/**
 * LLM-backed pleno vote extraction engine.
 *
 * Same output contract as src/scraper/pleno-vote-inference.ts (regex engine) —
 * both produce `InferredVote[]` so the downstream pipeline is identical and
 * curators promote suggestions via the same `npm run pleno-vote` path. The
 * difference is the extractor: here, each segment is fed to an LLM with a
 * strict schema + seat composition, and the output is validated against the
 * zod schema before any record is emitted.
 *
 * Uses the same splitSegments() boundary detector as the regex engine so the
 * two run on identical segment sets — makes precision/recall A/B comparison
 * meaningful.
 */

import { callLLM } from '../llm/client'
import type { CallLlmOptions } from '../llm/client'
import {
  PlenoVoteResponseSchema,
  PlenoVoteSuggestionSchema,
  type PlenoVoteSuggestion,
} from '../llm/schemas'
import {
  PLENO_VOTE_PROMPT_VERSION,
  buildPlenoVoteSystemPrompt,
  buildPlenoVoteUserPrompt,
} from '../llm/prompts'
import type { ZodTypeAny, z } from 'zod'
import { splitSegments, type InferenceResult, type InferredVote } from './pleno-vote-inference'
import { ALLOWED_BLOCS } from './pleno-votes'

export interface LlmInferOptions {
  plenoId: string
  plenoDate: string
  /** Current council composition — LLM prompt includes this to anchor bloc/seat expectations. */
  currentSeats: { bloc: string; seats: number }[]
  /** Segments below this confidence are dropped. */
  minConfidence?: number
}

/** Optional dependency injection for testing — default is the real callLLM. */
export type LlmCaller = <TSchema extends ZodTypeAny>(
  opts: CallLlmOptions<TSchema>,
) => Promise<z.infer<TSchema> | null>

/**
 * Run each vote-segment through the LLM and collect the valid suggestions.
 * Failed calls (network, schema mismatch after retries) are treated as
 * "no vote here" and silently dropped — the regex fallback can still find them.
 */
export async function inferVotesWithLlm(
  transcript: string,
  opts: LlmInferOptions,
  caller: LlmCaller = callLLM,
): Promise<InferenceResult> {
  const minConfidence = opts.minConfidence ?? 0.6
  const segments = splitSegments(transcript)
  const suggestions: InferredVote[] = []
  let droppedLowConfidence = 0

  const systemPrompt = buildPlenoVoteSystemPrompt({
    plenoDate: opts.plenoDate,
    currentSeats: opts.currentSeats,
  })

  for (const segment of segments) {
    const userPrompt = buildPlenoVoteUserPrompt(segment)
    const response = await caller({
      systemPrompt,
      userPrompt,
      promptVersion: PLENO_VOTE_PROMPT_VERSION,
      schema: PlenoVoteResponseSchema,
      input: { plenoId: opts.plenoId, segmentHash: segmentHash(segment) },
    })
    if (!response || !response.vote) continue

    const vote = sanitize(response.vote, opts.currentSeats)
    if (!vote) continue
    if (vote.confidence < minConfidence) {
      droppedLowConfidence += 1
      continue
    }

    suggestions.push({
      plenoId: opts.plenoId,
      plenoDate: opts.plenoDate,
      itemNumber: vote.itemNumber,
      excerpt: vote.excerpt,
      outcome: vote.outcome,
      votes: vote.votes,
      confidence: vote.confidence,
      requiresHumanApproval: true,
      // Pass-through the plazo fields when both are present. dueBy without
      // dueBySource is dropped (the pleno-votes.ts validator would reject
      // the promotion anyway — better to strip here than surface a broken
      // suggestion to the curator).
      ...(vote.dueBy && vote.dueBySource
        ? { dueBy: vote.dueBy, dueBySource: vote.dueBySource }
        : {}),
    })
  }

  return {
    suggestions,
    stats: {
      transcriptLength: transcript.length,
      segmentsScanned: segments.length,
      suggestionsEmitted: suggestions.length,
      droppedLowConfidence,
    },
  }
}

/**
 * Post-validation guard. Rejects:
 *  - LLM inventing a bloc not in the current council
 *  - Votes > current seat count for a bloc
 *  - Empty votes array (no actionable tuple)
 */
function sanitize(
  vote: PlenoVoteSuggestion,
  currentSeats: { bloc: string; seats: number }[],
): PlenoVoteSuggestion | null {
  const seatMap = new Map(currentSeats.map((s) => [s.bloc, s.seats]))
  const cleaned = vote.votes.filter((v) => {
    if (!(ALLOWED_BLOCS as readonly string[]).includes(v.bloc)) return false
    if (!seatMap.has(v.bloc)) return false // bloc not in current council
    if (v.seats !== undefined && v.seats > (seatMap.get(v.bloc) ?? 0)) return false
    return true
  })
  if (cleaned.length === 0) return null

  const parsed = PlenoVoteSuggestionSchema.safeParse({ ...vote, votes: cleaned })
  return parsed.success ? parsed.data : null
}

/** 10-char hash of the segment so the cache key is stable but short. */
function segmentHash(segment: string): string {
  let h = 0
  for (let i = 0; i < segment.length; i++) {
    h = (h * 31 + segment.charCodeAt(i)) & 0xffffffff
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
