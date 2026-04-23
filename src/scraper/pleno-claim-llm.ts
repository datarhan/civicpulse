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
} from '../llm/prompts'
import type { ZodTypeAny, z } from 'zod'
import type { PlenoClaim } from './pleno-claim'

export interface ClaimExtractionOptions {
  plenoId: string
  plenoDate: string
  currentSeats: { bloc: string; seats: number }[]
  agendaItems?: AgendaItemHint[]
  /** Minimum confidence (0..1). Defaults to 0.5. */
  minConfidence?: number
  /**
   * Window size in chars (default 1200). Larger windows give the model more
   * context and reduce duplicate claims across boundaries. Step defaults to
   * window/2 so windows overlap (covers claims that span boundaries).
   */
  windowChars?: number
  windowStep?: number
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

function splitClaimWindows(transcript: string, windowChars: number, step: number): string[] {
  const out: string[] = []
  if (transcript.length <= windowChars) return [transcript]
  for (let start = 0; start < transcript.length; start += step) {
    const end = Math.min(transcript.length, start + windowChars)
    out.push(transcript.slice(start, end))
    if (end === transcript.length) break
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
  const windows = splitClaimWindows(transcript, windowChars, step)

  const systemPrompt = buildPlenoClaimSystemPrompt({
    plenoDate: opts.plenoDate,
    currentSeats: opts.currentSeats,
    agendaItems: opts.agendaItems,
  })

  const seen = new Set<string>()
  const items: PlenoClaim[] = []
  let droppedLowConfidence = 0

  for (let i = 0; i < windows.length; i++) {
    const window = windows[i]
    const userPrompt = buildPlenoClaimUserPrompt(window)
    const response = await caller({
      systemPrompt,
      userPrompt,
      promptVersion: PLENO_CLAIM_PROMPT_VERSION,
      schema: PlenoClaimResponseSchema,
      input: { plenoId: opts.plenoId, windowIndex: i, windowHash: windowHash(window) },
    })
    if (!response) continue

    for (const raw of response.claims) {
      if (raw.confidence < minConfidence) {
        droppedLowConfidence += 1
        continue
      }
      const key = claimKey(raw)
      if (seen.has(key)) continue
      seen.add(key)
      // Stable id combines plenoId + window + type-abbrev + short hash.
      const typeAbbr = raw.type.slice(0, 3)
      const shortHash = keyHash(key)
      const id = `${opts.plenoId}-${String(i).padStart(3, '0')}-${typeAbbr}-${shortHash}`
      items.push({
        id,
        plenoId: opts.plenoId,
        plenoDate: opts.plenoDate,
        segmentIndex: i,
        type: raw.type,
        speakerGroup: raw.speakerGroup,
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
        confidence: raw.confidence,
        reasoning: raw.reasoning,
        requiresHumanApproval: true,
      })
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
