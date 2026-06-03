/**
 * LLM-backed promise evidence miner.
 *
 * Pipeline per promise:
 *   1. Retriever (src/llm/retriever.ts) shortlists top-N candidates per
 *      corpus using the existing stemmer.
 *   2. LLM receives the promise + shortlist and returns a structured
 *      evidence batch. The schema (PromiseEvidenceBatchSchema) disallows
 *      any status promotion beyond V1.
 *   3. Post-filter rejects:
 *      - LOREG freeze in effect (returns [])
 *      - URLs the LLM hallucinated (not in the allowlist from step 1)
 *      - Any proposedStatus outside V1_STATUSES (belt-and-suspenders; zod
 *        already rejects but we double-check at the app level)
 *
 * Output shape is compatible with the existing promise-suggestions.json
 * schema — the scripts/scrape-promise-suggestions.ts CLI merges with the
 * regex engine's suggestions keyed by (promiseId, evidenceUrl).
 */

import { callLLM, type CallLlmOptions } from '../llm/client'
import type { ZodTypeAny, z } from 'zod'
import { PromiseEvidenceBatchSchema, type PromiseEvidenceItem } from '../llm/schemas'
import {
  PROMISE_EVIDENCE_PROMPT_VERSION,
  buildPromiseEvidenceSystemPrompt,
  buildPromiseEvidenceUserPrompt,
  type PromiseEvidenceInput,
} from '../llm/prompts'
import {
  buildUrlAllowlist,
  type RetrievalInput,
  type RetrievalOutput,
  retrieveCandidates,
} from '../llm/retriever'
import { isFrozen, V1_STATUSES, type PromisesSnapshot } from './promises'

export type LlmCaller = <TSchema extends ZodTypeAny>(
  opts: CallLlmOptions<TSchema>,
) => Promise<z.infer<TSchema> | null>

export interface EvidenceMiningOptions {
  snapshot: Pick<PromisesSnapshot, 'frozenUntil'>
  minConfidence?: number
  now?: Date
}

export interface EvidenceMiningResult {
  items: PromiseEvidenceItem[]
  stats: {
    frozen: boolean
    promisesScanned: number
    corporaScanned: number
    candidatesRetrieved: number
    itemsEmitted: number
    itemsRejected: {
      hallucinatedUrl: number
      belowConfidence: number
      invalidStatus: number
    }
  }
}

export async function minePromiseEvidence(
  input: RetrievalInput,
  opts: EvidenceMiningOptions,
  caller: LlmCaller = callLLM,
): Promise<EvidenceMiningResult> {
  const result: EvidenceMiningResult = {
    items: [],
    stats: {
      frozen: false,
      promisesScanned: 1,
      corporaScanned: input.corpora.length,
      candidatesRetrieved: 0,
      itemsEmitted: 0,
      itemsRejected: { hallucinatedUrl: 0, belowConfidence: 0, invalidStatus: 0 },
    },
  }

  // LOREG freeze — electoral period, no machine-generated claims about
  // elected officials while polls are open.
  if (isFrozen(opts.snapshot, opts.now)) {
    result.stats.frozen = true
    return result
  }

  const retrieval: RetrievalOutput = retrieveCandidates(input)
  result.stats.candidatesRetrieved = retrieval.stats.totalCandidatesKept
  if (retrieval.stats.totalCandidatesKept === 0) return result

  const allowlist = buildUrlAllowlist(retrieval)

  const systemPrompt = buildPromiseEvidenceSystemPrompt()
  const llmInput: PromiseEvidenceInput = {
    promise: {
      id: input.promise.id,
      party: (input.promise as { party?: string }).party ?? 'unknown',
      title: input.promise.title,
      quote: input.promise.quote,
      topic: input.promise.topic,
      madeAt: (input.promise as { madeAt?: string }).madeAt ?? '',
    },
    candidates: retrieval.byCorpus.map((b) => ({
      corpus: b.corpus,
      items: b.candidates.map((c) => ({
        url: c.url,
        title: c.title,
        date: c.date,
        publisher: c.publisher,
        snippet: c.text.slice(0, 300),
      })),
    })),
  }

  const response = await caller({
    systemPrompt,
    userPrompt: buildPromiseEvidenceUserPrompt(llmInput),
    promptVersion: PROMISE_EVIDENCE_PROMPT_VERSION,
    schema: PromiseEvidenceBatchSchema,
    input: { promiseId: input.promise.id, urls: [...allowlist].sort() },
  })
  if (!response) return result

  const minConfidence = opts.minConfidence ?? 0.6
  for (const ev of response.evidence) {
    if (!allowlist.has(ev.evidenceUrl)) {
      result.stats.itemsRejected.hallucinatedUrl += 1
      continue
    }
    if (ev.confidence < minConfidence) {
      result.stats.itemsRejected.belowConfidence += 1
      continue
    }
    if (ev.proposedStatus && !(V1_STATUSES as unknown as Set<string>).has(ev.proposedStatus)) {
      result.stats.itemsRejected.invalidStatus += 1
      continue
    }
    result.items.push(ev)
  }
  result.stats.itemsEmitted = result.items.length
  return result
}
