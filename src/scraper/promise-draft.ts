/**
 * Schema + validators for the promise auto-curator review queue.
 *
 * The queue lives at editorial/promise-review-queue.json (gitignored,
 * local-only — unreviewed party attributions never leave the laptop).
 * Every record carries requiresHumanApproval:true. This module NEVER
 * writes promises.json; the apply path (promise-apply.ts) does.
 */
import { fnv32 } from './hash'
import { slugify } from './normalize'
import {
  ALLOWED_PARTIES,
  ALLOWED_TOPICS,
  ALLOWED_KINDS,
  type Party,
  type Topic,
  type Kind,
} from './promises'

export const QUEUE_VERSION = '1.0'

export type DraftDecision = 'auto-publish' | 'fast-track' | 'queue'
const DECISIONS: readonly DraftDecision[] = ['auto-publish', 'fast-track', 'queue']

export interface Grounding {
  grounded: boolean
  urlResolved: boolean
  quoteFound: boolean
  resolvedUrl?: string
  checkedAt: string
}

export interface DraftReasoning {
  url: string
  date: string
  quote: string
  publisher?: string
  matchedKeywords: string[]
}

export interface DraftNewPromise {
  draftId: string
  kind: 'new-promise'
  requiresHumanApproval: true
  confidence: number
  grounding: Grounding
  decision: DraftDecision
  proposed: {
    party: Party
    title: string
    quote: string
    source: { url: string; publisher: string }
    madeAt: string
    topic: Topic
    kind: Kind
    status: 'documentada'
  }
  reasoning: DraftReasoning[]
  generatedAt: string
}

export interface PromiseReviewQueue {
  version: string
  generatedAt: string
  drafts: DraftNewPromise[]
}

class QueueValidationError extends Error {
  constructor(msg: string) {
    super(`promise-review-queue: ${msg}`)
  }
}

function str(v: unknown, name: string, min = 1, max = Infinity): string {
  if (typeof v !== 'string') throw new QueueValidationError(`${name} must be string`)
  if (v.length < min) throw new QueueValidationError(`${name} too short (${v.length} < ${min})`)
  if (v.length > max) throw new QueueValidationError(`${name} too long (${v.length} > ${max})`)
  return v
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], name: string): T {
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
    throw new QueueValidationError(
      `${name} must be one of [${allowed.join(', ')}] (got ${JSON.stringify(v)})`,
    )
  }
  return v as T
}

function iso(v: unknown, name: string): string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v)) {
    throw new QueueValidationError(`${name} must be ISO date (got ${JSON.stringify(v)})`)
  }
  return v
}

function url(v: unknown, name: string): string {
  if (typeof v !== 'string' || !/^https?:\/\//.test(v)) {
    throw new QueueValidationError(`${name} must be http(s) URL (got ${JSON.stringify(v)})`)
  }
  return v
}

export function makeDraftId(party: string, title: string, sourceUrl: string): string {
  return `dnp-${slugify(party)}-${fnv32(`${party}|${title}|${sourceUrl}`)}`
}

function validateDraft(d: unknown, i: number): DraftNewPromise {
  if (!d || typeof d !== 'object') throw new QueueValidationError(`drafts[${i}] must be object`)
  const r = d as Record<string, unknown>
  str(r.draftId, `drafts[${i}].draftId`, 3, 120)
  if (r.kind !== 'new-promise')
    throw new QueueValidationError(`drafts[${i}].kind must be 'new-promise'`)
  if (r.requiresHumanApproval !== true)
    throw new QueueValidationError(`drafts[${i}].requiresHumanApproval must be true`)
  if (typeof r.confidence !== 'number' || r.confidence < 0 || r.confidence > 1)
    throw new QueueValidationError(`drafts[${i}].confidence must be 0..1`)
  oneOf(r.decision, DECISIONS, `drafts[${i}].decision`)
  const g = r.grounding as Record<string, unknown>
  if (!g || typeof g !== 'object') throw new QueueValidationError(`drafts[${i}].grounding missing`)
  if (typeof g.grounded !== 'boolean')
    throw new QueueValidationError(`drafts[${i}].grounding.grounded must be bool`)
  const p = r.proposed as Record<string, unknown>
  if (!p || typeof p !== 'object') throw new QueueValidationError(`drafts[${i}].proposed missing`)
  oneOf(p.party, ALLOWED_PARTIES, `drafts[${i}].proposed.party`)
  str(p.title, `drafts[${i}].proposed.title`, 4, 200)
  str(p.quote, `drafts[${i}].proposed.quote`, 20, 1500)
  const src = p.source as Record<string, unknown>
  if (!src || typeof src !== 'object')
    throw new QueueValidationError(`drafts[${i}].proposed.source missing`)
  url(src.url, `drafts[${i}].proposed.source.url`)
  str(src.publisher, `drafts[${i}].proposed.source.publisher`, 1, 100)
  iso(p.madeAt, `drafts[${i}].proposed.madeAt`)
  oneOf(p.topic, ALLOWED_TOPICS, `drafts[${i}].proposed.topic`)
  oneOf(p.kind, ALLOWED_KINDS, `drafts[${i}].proposed.kind`)
  if (p.status !== 'documentada')
    throw new QueueValidationError(
      `drafts[${i}].proposed.status must be 'documentada' (discovery is V1-only)`,
    )
  if (!Array.isArray(r.reasoning))
    throw new QueueValidationError(`drafts[${i}].reasoning must be array`)
  str(r.generatedAt, `drafts[${i}].generatedAt`)
  return r as unknown as DraftNewPromise
}

export function validateReviewQueue(json: string): PromiseReviewQueue {
  const raw = JSON.parse(json) as Record<string, unknown>
  str(raw.version, 'version')
  str(raw.generatedAt, 'generatedAt')
  if (!Array.isArray(raw.drafts)) throw new QueueValidationError('drafts must be array')
  const drafts = (raw.drafts as unknown[]).map((d, i) => validateDraft(d, i))
  const seen = new Set<string>()
  for (const d of drafts) {
    if (seen.has(d.draftId)) throw new QueueValidationError(`duplicate draftId "${d.draftId}"`)
    seen.add(d.draftId)
  }
  return { version: raw.version as string, generatedAt: raw.generatedAt as string, drafts }
}

export function emptyQueue(now: string): PromiseReviewQueue {
  return { version: QUEUE_VERSION, generatedAt: now, drafts: [] }
}

export function removeDraftFromQueue(
  queue: PromiseReviewQueue,
  draftId: string,
): PromiseReviewQueue {
  return { ...queue, drafts: queue.drafts.filter((d) => d.draftId !== draftId) }
}
