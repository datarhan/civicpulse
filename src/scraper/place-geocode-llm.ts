/**
 * LLM place-geocode engine — the machine half of the tender map's LLM recall
 * boost. For each awarded contract the deterministic resolver could NOT situate,
 * the LLM reads the specific place NAME out of the title (handling the
 * Spanish/Valencian + abbreviation gap the conservative title-matcher skips),
 * and that name is resolved to a REAL gazetteer point via matchNameToGazetteer.
 *
 * Honesty guardrails baked in:
 *  - the LLM never emits a coordinate — the point is always the gazetteer's;
 *  - a name that doesn't resolve to a known place is dropped (counted), never
 *    placed at a guessed spot;
 *  - every emitted suggestion carries `requiresHumanApproval:true`.
 *
 * Mirrors pleno-vote-llm.ts: strict zod schema, dependency-injectable caller,
 * failed/low-confidence calls silently dropped.
 */
import { callLLM } from '../llm/client'
import type { CallLlmOptions } from '../llm/client'
import { PlaceGeocodeResponseSchema } from '../llm/schemas'
import {
  PLACE_GEOCODE_PROMPT_VERSION,
  buildPlaceGeocodeSystemPrompt,
  buildPlaceGeocodeUserPrompt,
} from '../llm/prompts'
import type { ZodTypeAny, z } from 'zod'
import { matchNameToGazetteer, type Candidate } from './place-resolver'
import type { PlaceSuggestion } from './place-suggestion'

export interface GeocodeContract {
  id: string
  title: string
  amount: number
  date: string | null
}

export interface GeocodeOptions {
  /** Extractions below this confidence are dropped. Default 0.5. */
  minConfidence?: number
  /** Cap on how many titles are sent to the LLM (cost guard). */
  limit?: number
}

export interface GeocodeStats {
  candidatesScanned: number
  suggested: number
  /** LLM returned a name, but it resolved to no known gazetteer place. */
  unmatched: number
  /** LLM said the title names no specific place (placeName: null). */
  noPlace: number
  lowConfidence: number
}

export type LlmCaller = <TSchema extends ZodTypeAny>(
  opts: CallLlmOptions<TSchema>,
) => Promise<z.infer<TSchema> | null>

export async function geocodeContractsWithLlm(
  contracts: GeocodeContract[],
  gazetteer: Candidate[],
  opts: GeocodeOptions = {},
  caller: LlmCaller = callLLM,
): Promise<{ suggestions: PlaceSuggestion[]; stats: GeocodeStats }> {
  const minConfidence = opts.minConfidence ?? 0.5
  const batch = typeof opts.limit === 'number' ? contracts.slice(0, opts.limit) : contracts
  const systemPrompt = buildPlaceGeocodeSystemPrompt()

  const suggestions: PlaceSuggestion[] = []
  const stats: GeocodeStats = {
    candidatesScanned: batch.length,
    suggested: 0,
    unmatched: 0,
    noPlace: 0,
    lowConfidence: 0,
  }

  for (const c of batch) {
    const response = await caller({
      systemPrompt,
      userPrompt: buildPlaceGeocodeUserPrompt(c.title),
      promptVersion: PLACE_GEOCODE_PROMPT_VERSION,
      schema: PlaceGeocodeResponseSchema,
      input: { contractId: c.id },
    })
    if (!response) continue // null = network/schema/circuit → treat as no place
    if (!response.placeName) {
      stats.noPlace++
      continue
    }
    if (response.confidence < minConfidence) {
      stats.lowConfidence++
      continue
    }
    const match = matchNameToGazetteer(response.placeName, gazetteer)
    if (!match) {
      stats.unmatched++
      continue
    }
    suggestions.push({
      contractId: c.id,
      title: c.title,
      amount: c.amount,
      date: c.date,
      llmPlaceName: response.placeName,
      confidence: response.confidence,
      reasoning: response.reasoning,
      match: {
        sourceId: match.sourceId,
        name: match.name,
        kind: match.kind,
        point: match.point,
      },
      requiresHumanApproval: true,
    })
    stats.suggested++
  }

  return { suggestions, stats }
}
