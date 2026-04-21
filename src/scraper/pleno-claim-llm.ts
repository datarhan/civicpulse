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

function claimKey(c: PlenoClaimExtraction): string {
  // Dedup by (type, topic, first-40-chars-of-verbatim, amount, count). The
  // sliding windows overlap, so the same claim can surface twice — we keep
  // the first occurrence.
  return [
    c.type,
    c.topic,
    c.verbatim.toLowerCase().trim().slice(0, 40).replace(/\s+/g, ' '),
    c.entities.amountEuros ?? '',
    c.entities.count ?? '',
  ].join('|')
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

  return {
    items,
    stats: {
      transcriptLength: transcript.length,
      segmentsScanned: windows.length,
      claimsEmitted: items.length,
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
