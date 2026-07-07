/**
 * Phase 2 status-change miner. For ONE promise, retrieves candidates across all
 * corpora, flattens them into a 0-based list, asks the LLM which candidate (by
 * index) proves a progress transition, and post-filters (freeze, confidence,
 * candidateIndex-resolves). Mirrors minePromiseEvidence but goes BEYOND V1 —
 * a separate module so the V1 evidence miner stays untouched.
 */
import { callLLM, type CallLlmOptions } from '../llm/client'
import type { ZodTypeAny, z } from 'zod'
import { PromiseStatusChangeBatchSchema } from '../llm/schemas'
import {
  PROMISE_STATUS_PROMPT_VERSION,
  buildPromiseStatusSystemPrompt,
  buildPromiseStatusUserPrompt,
  type PromiseStatusInput,
} from '../llm/prompts'
import { retrieveCandidates, type RetrievalInput } from '../llm/retriever'
import { isFrozen, type PromisesSnapshot, type EvidenceEntry } from './promises'

export type LlmCaller = <TSchema extends ZodTypeAny>(
  opts: CallLlmOptions<TSchema>,
) => Promise<z.infer<TSchema> | null>

export interface StatusMiningOptions {
  snapshot: Pick<PromisesSnapshot, 'frozenUntil'>
  minConfidence?: number
  now?: Date
  /** budget rows have no per-row URL; supply the snapshot-level source URL. */
  budgetSourceUrl?: string
}

export interface StatusChangeCandidate {
  promiseId: string
  proposedStatus: 'en-progreso' | 'parcial' | 'cumplida'
  corpus: string
  confidence: number
  reasoning: string
  fieldCite?: string
  /** The grounded evidence to append on apply (kind mapped from corpus). */
  evidence: EvidenceEntry
  /** The resolved flat candidate (for grounding). */
  candidate: {
    url: string
    title: string
    date: string
    publisher?: string
    text: string
    corpus: string
  }
}

const CORPUS_TO_KIND: Record<string, EvidenceEntry['kind']> = {
  press: 'press',
  pleno_agenda: 'pleno',
  pleno_vote: 'pleno',
  pleno_transcript: 'pleno',
  tender: 'tender',
  bdns: 'bdns',
  budget: 'budget',
}

export async function mineStatusChanges(
  input: RetrievalInput,
  opts: StatusMiningOptions,
  caller: LlmCaller = callLLM,
): Promise<{
  candidates: StatusChangeCandidate[]
  stats: {
    frozen: boolean
    candidatesRetrieved: number
    emitted: number
    rejected: { hallucinatedCite: number; belowConfidence: number }
  }
}> {
  const stats = {
    frozen: false,
    candidatesRetrieved: 0,
    emitted: 0,
    rejected: { hallucinatedCite: 0, belowConfidence: 0 },
  }
  if (isFrozen(opts.snapshot, opts.now)) {
    stats.frozen = true
    return { candidates: [], stats }
  }
  const retrieval = retrieveCandidates(input)
  // Flatten to a single 0-based list; the LLM cites by this index.
  const flat = retrieval.byCorpus.flatMap((b) =>
    b.candidates.map((c) => ({
      url: c.url,
      title: c.title,
      date: c.date,
      publisher: c.publisher,
      text: c.text,
      corpus: b.corpus,
    })),
  )
  stats.candidatesRetrieved = flat.length
  if (flat.length === 0) return { candidates: [], stats }

  const llmInput: PromiseStatusInput = {
    promise: {
      id: input.promise.id,
      party: (input.promise as { party?: string }).party ?? 'unknown',
      title: input.promise.title,
      quote: input.promise.quote,
      topic: input.promise.topic,
    },
    candidates: flat.map((c) => ({
      corpus: c.corpus,
      ref: c.url,
      title: c.title,
      date: c.date,
      publisher: c.publisher,
      snippet: c.text.slice(0, 300),
    })),
  }
  const response = await caller({
    systemPrompt: buildPromiseStatusSystemPrompt(),
    userPrompt: buildPromiseStatusUserPrompt(llmInput),
    promptVersion: PROMISE_STATUS_PROMPT_VERSION,
    schema: PromiseStatusChangeBatchSchema,
    input: { promiseId: input.promise.id, candidateCount: flat.length },
  })
  if (!response) return { candidates: [], stats }

  const min = opts.minConfidence ?? 0.6
  const out: StatusChangeCandidate[] = []
  for (const ch of response.changes) {
    if (ch.candidateIndex < 0 || ch.candidateIndex >= flat.length) {
      stats.rejected.hallucinatedCite += 1
      continue
    }
    if (ch.confidence < min) {
      stats.rejected.belowConfidence += 1
      continue
    }
    const cand = flat[ch.candidateIndex]
    const kind = CORPUS_TO_KIND[cand.corpus] ?? 'otro'
    const url = kind === 'budget' ? (opts.budgetSourceUrl ?? cand.url) : cand.url
    // The mining context is single-promise: the id is ours, never the LLM's.
    // Trusting the echo let a mangled id ("infraestructura_transporte", the
    // topic) reach applyStatusChange and abort the whole 2026-07-07 run.
    if (ch.promiseId !== input.promise.id) {
      process.stderr.write(
        `[status-miner] LLM echoed promiseId "${ch.promiseId}" for promise "${input.promise.id}" — forcing the real id\n`,
      )
    }
    out.push({
      promiseId: input.promise.id,
      proposedStatus: ch.proposedStatus,
      corpus: cand.corpus,
      confidence: ch.confidence,
      reasoning: ch.reasoning,
      fieldCite: ch.fieldCite,
      evidence: {
        date: (cand.date || '').slice(0, 10) || '2026-01-01',
        url,
        quote: ch.quote,
        publisher: cand.publisher || 'Ayuntamiento Riba-roja',
        kind,
        addedBy: 'auto-curation-v1',
      },
      candidate: cand,
    })
  }
  stats.emitted = out.length
  return { candidates: out, stats }
}
