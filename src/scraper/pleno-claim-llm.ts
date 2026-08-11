/**
 * LLM-backed extraction of verifiable claims from pleno transcripts.
 *
 * Walks every ~900-char window of the transcript (same chunking as
 * splitSegments in pleno-vote-inference, but with a wider sliding window
 * because claims can appear anywhere, not just near a voting phrase).
 *
 * Output is `PlenoClaim[]` in the shape defined by src/scraper/pleno-claim.ts.
 * Each record carries requiresHumanApproval:true; the verifier
 * (src/scraper/claim-verifier.ts) adds a verdict but never promotes
 * claims to a curated file.
 */

import { callLLM } from '../llm/client'
import type { CallLlmOptions } from '../llm/client'
import { PlenoClaimResponseSchema, type PlenoClaimExtraction } from '../llm/schemas'
import {
  PLENO_CLAIM_PROMPT_VERSION,
  buildPlenoClaimSystemPrompt,
  buildPlenoClaimUserPrompt,
  type AgendaItemHint,
  type AllowedSpeaker,
} from '../llm/prompts'
import type { ZodTypeAny, z } from 'zod'
import type { PlenoClaim } from './pleno-claim'

export interface ClaimExtractionOptions {
  plenoId: string
  plenoDate: string
  currentSeats: { bloc: string; seats: number }[]
  agendaItems?: AgendaItemHint[]
  /**
   * Optional list of councillors whose voiceprint has been enrolled.
   * Each entry must include `slug`, `name` and `party`. When supplied,
   * the LLM may emit `speakerSlug` for claims extracted from lines
   * carrying the matching `(Full Name)` voice-id tag. Slugs not in
   * this list — or that disagree with `speakerGroup` party-wise — are
   * stripped to null at write time as a defensive guard.
   */
  allowedSpeakers?: AllowedSpeaker[]
  /** Minimum confidence (0..1). Defaults to 0.5. */
  minConfidence?: number
  /**
   * Window size in chars (default 1200). Larger windows give the model more
   * context and reduce duplicate claims across boundaries. Step defaults to
   * window/2 so windows overlap (covers claims that span boundaries).
   */
  windowChars?: number
  windowStep?: number
  /**
   * Number of LLM calls to issue in parallel. Default 1 (serial) for clean
   * telemetry. Bumping to 3-4 is safe on Claude Code Max plan and cuts
   * wall-clock ~3-4× for multi-hundred-window transcripts. Kept modest so
   * rate-limit headroom is preserved for other concurrent pipelines.
   */
  concurrency?: number
  /**
   * Optional callback fired after each window resolves — useful for
   * progress reporting from long-running CLIs.
   */
  onWindow?: (info: { index: number; total: number; claimsKept: number }) => void
  /**
   * Which bloc said this verbatim, from `pleno-speaker-map/`.
   *
   * The model no longer answers this — it never could. Its window is ~1200
   * characters and, measured on pleno 10yl550, 1% of windows contain the
   * turn-grant that establishes who is speaking while 41% merely name a party,
   * which in a debate is usually the party under attack. Asked anyway, it
   * reached for the name in the text.
   *
   * Absent or returning null ⇒ `speakerGroup: null`, which is an honest
   * "nobody is claiming to know" and the answer the eval rewards over a guess.
   * Build one with `blocResolverFor` in `speaker-map-align.ts`.
   */
  resolveBloc?: (verbatim: string) => string | null
}

export interface ClaimExtractionResult {
  items: PlenoClaim[]
  stats: {
    transcriptLength: number
    segmentsScanned: number
    claimsEmitted: number
    droppedLowConfidence: number
  }
}

export type LlmCaller = <TSchema extends ZodTypeAny>(
  opts: CallLlmOptions<TSchema>,
) => Promise<z.infer<TSchema> | null>

/**
 * Round a number to N significant figures so LLM-variant amounts
 * (242000 vs 242255) collapse to the same dedup bucket.
 */
function roundSig(n: number | null | undefined, sig = 3): string {
  if (n == null || !Number.isFinite(n) || n === 0) return ''
  const d = Math.ceil(Math.log10(Math.abs(n)))
  const power = sig - d
  const factor = Math.pow(10, power)
  return String(Math.round(n * factor) / factor)
}

function normForKey(s: string): string {
  // NFD diacritic strip + lowercase + collapse whitespace + strip punctuation
  // so variant transcripts of the same utterance collapse.
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function claimKey(c: PlenoClaimExtraction): string {
  // Semantic dedup — the sliding windows overlap and the LLM paraphrases
  // the same utterance slightly differently across windows. We collapse
  // by (type, topic, rounded-amount, rounded-count, 25-char-verbatim-prefix).
  // Amount is rounded to 3 significant figures so 242000 and 242255 collide.
  return [
    c.type,
    c.topic,
    normForKey(c.verbatim).slice(0, 25),
    roundSig(c.entities.amountEuros ?? null, 3),
    c.entities.count != null ? Math.round(c.entities.count / 10) * 10 : '',
  ].join('|')
}

/**
 * Second-pass semantic collapse — if two claims share type + topic +
 * rounded amount (regardless of verbatim prefix), keep the one with the
 * highest confidence. Runs after the per-window dedup.
 */
function semanticCollapse<
  T extends {
    type: string
    topic: string
    entities: { amountEuros?: number; count?: number }
    confidence: number
  },
>(items: T[]): T[] {
  const byBucket = new Map<string, T>()
  for (const it of items) {
    const bucket = [
      it.type,
      it.topic,
      roundSig(it.entities.amountEuros ?? null, 3),
      it.entities.count != null ? Math.round(it.entities.count / 10) * 10 : '',
    ].join('|')
    // Buckets with no numeric anchor (both amount + count absent) aren't
    // safe to collapse semantically — keep them all.
    if (!it.entities.amountEuros && !it.entities.count) {
      byBucket.set(bucket + '|' + Math.random(), it)
      continue
    }
    const prev = byBucket.get(bucket)
    if (!prev || it.confidence > prev.confidence) byBucket.set(bucket, it)
  }
  return [...byBucket.values()]
}

/**
 * Cut the transcript into overlapping windows, **on line boundaries**.
 *
 * The old version sliced at raw character offsets, which lands inside a
 * `[123.4 → 130.2] (SPEAKER_05)` tag about as often as not — the model was
 * routinely handed fragments like `AKER_05) …texto` and a half-eaten
 * timestamp. Splitting on lines costs nothing and keeps every window made of
 * whole, well-formed transcript lines.
 *
 * Windows still overlap by roughly `windowChars - step`, so a claim spanning a
 * boundary is seen whole at least once; `semanticCollapse` removes the
 * duplicates that overlap produces.
 */
export function splitClaimWindows(transcript: string, windowChars: number, step: number): string[] {
  if (transcript.length <= windowChars) return [transcript]
  const lines = transcript.split('\n')
  const out: string[] = []
  let start = 0
  while (start < lines.length) {
    let end = start
    let size = 0
    // At least one line per window, even if that single line is longer than
    // windowChars — dropping it would silently lose a stretch of debate.
    while (end < lines.length && (end === start || size + lines[end].length + 1 <= windowChars)) {
      size += lines[end].length + 1
      end += 1
    }
    out.push(lines.slice(start, end).join('\n'))
    if (end >= lines.length) break

    // Step forward by roughly `step` characters, measured in whole lines.
    let advanced = 0
    let next = start
    while (next < end - 1 && advanced + lines[next].length + 1 <= step) {
      advanced += lines[next].length + 1
      next += 1
    }
    start = next > start ? next : start + 1
  }
  return out
}

export async function extractClaimsWithLlm(
  transcript: string,
  opts: ClaimExtractionOptions,
  caller: LlmCaller = callLLM,
): Promise<ClaimExtractionResult> {
  const minConfidence = opts.minConfidence ?? 0.5
  const windowChars = opts.windowChars ?? 1200
  const step = opts.windowStep ?? Math.floor(windowChars / 2)
  const concurrency = Math.max(1, opts.concurrency ?? 1)
  const windows = splitClaimWindows(transcript, windowChars, step)

  const systemPrompt = buildPlenoClaimSystemPrompt({
    plenoDate: opts.plenoDate,
    currentSeats: opts.currentSeats,
    agendaItems: opts.agendaItems,
    allowedSpeakers: opts.allowedSpeakers,
  })

  // Defensive party-consistency check applied to every emitted speakerSlug.
  // The prompt forbids inferring identity from prose, but the schema can't
  // enforce that — this guard catches LLM drift where the model latches
  // onto a tag from a different bloc.
  const speakersBySlug = new Map<string, AllowedSpeaker>()
  for (const s of opts.allowedSpeakers ?? []) speakersBySlug.set(s.slug, s)
  function validateSlug(
    rawSlug: string | null | undefined,
    speakerGroup: string | null,
  ): string | null {
    if (!rawSlug) return null
    const entry = speakersBySlug.get(rawSlug)
    if (!entry) return null
    // If we have a bloc and it disagrees with the slug's party, drop the slug.
    // We don't drop speakerGroup — it has its own libel-safe verification.
    if (speakerGroup && entry.party !== speakerGroup) return null
    return rawSlug
  }

  const seen = new Set<string>()
  const items: PlenoClaim[] = []
  let droppedLowConfidence = 0

  // Process windows in fixed-size parallel batches. Each batch awaits all of
  // its calls before starting the next so cache writes + dedup keep ordered
  // semantics. Concurrency=1 keeps identical behavior to the serial version.
  async function runWindow(i: number): Promise<number> {
    const window = windows[i]
    const userPrompt = buildPlenoClaimUserPrompt(window)
    const response = await caller({
      systemPrompt,
      userPrompt,
      promptVersion: PLENO_CLAIM_PROMPT_VERSION,
      schema: PlenoClaimResponseSchema,
      input: { plenoId: opts.plenoId, windowIndex: i, windowHash: windowHash(window) },
    })
    if (!response) return 0
    let kept = 0
    for (const raw of response.claims) {
      if (raw.confidence < minConfidence) {
        droppedLowConfidence += 1
        continue
      }
      const key = claimKey(raw)
      if (seen.has(key)) continue
      seen.add(key)
      const typeAbbr = raw.type.slice(0, 3)
      const shortHash = keyHash(key)
      const id = `${opts.plenoId}-${String(i).padStart(3, '0')}-${typeAbbr}-${shortHash}`
      // Joined from the speaker map, never inferred from the window's content.
      const speakerGroup = (opts.resolveBloc?.(raw.verbatim) ?? null) as PlenoClaim['speakerGroup']
      const validatedSlug = validateSlug(raw.speakerSlug, speakerGroup)
      items.push({
        id,
        plenoId: opts.plenoId,
        plenoDate: opts.plenoDate,
        segmentIndex: i,
        type: raw.type,
        speakerGroup,
        ...(validatedSlug ? { speakerSlug: validatedSlug } : {}),
        verbatim: raw.verbatim.trim(),
        context: raw.context.trim(),
        topic: raw.topic,
        entities: {
          ...(raw.entities.amountEuros != null ? { amountEuros: raw.entities.amountEuros } : {}),
          ...(raw.entities.count != null ? { count: raw.entities.count } : {}),
          ...(raw.entities.countUnit ? { countUnit: raw.entities.countUnit } : {}),
          ...(raw.entities.date ? { date: raw.entities.date } : {}),
          ...(raw.entities.referencedEntity
            ? { referencedEntity: raw.entities.referencedEntity.toLowerCase().trim() }
            : {}),
        },
        ...(raw.accusationSubtype ? { accusationSubtype: raw.accusationSubtype } : {}),
        confidence: raw.confidence,
        reasoning: raw.reasoning,
        requiresHumanApproval: true,
      })
      kept += 1
    }
    return kept
  }

  for (let batchStart = 0; batchStart < windows.length; batchStart += concurrency) {
    const batch: Array<Promise<{ index: number; kept: number }>> = []
    for (let j = 0; j < concurrency && batchStart + j < windows.length; j++) {
      const i = batchStart + j
      batch.push(runWindow(i).then((kept) => ({ index: i, kept })))
    }
    const results = await Promise.all(batch)
    if (opts.onWindow) {
      for (const r of results) {
        opts.onWindow({ index: r.index, total: windows.length, claimsKept: r.kept })
      }
    }
  }

  // Second-pass collapse across window boundaries — keep the highest-
  // confidence representative of each (type, topic, rounded-amount) bucket.
  const collapsed = semanticCollapse(items)
  return {
    items: collapsed,
    stats: {
      transcriptLength: transcript.length,
      segmentsScanned: windows.length,
      claimsEmitted: collapsed.length,
      droppedLowConfidence,
    },
  }
}

function windowHash(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffffff
  return (h >>> 0).toString(16).padStart(8, '0')
}

function keyHash(s: string): string {
  return windowHash(s).slice(0, 6)
}
