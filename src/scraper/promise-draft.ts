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
  ALLOWED_STATUSES,
  type Party,
  type Topic,
  type Kind,
  type EvidenceEntry,
  type Status,
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

/**
 * The three "progress" statuses a status-change draft may propose. This is a
 * deliberate subset of ALLOWED_STATUSES: the miner only ever advances a promise
 * along the fulfilment axis (documentada → en-progreso → parcial → cumplida).
 * It never proposes no-ejecutada / inviable — those are libel-heavy negative
 * judgements reserved for a human curator.
 */
export const PROGRESS_STATUSES: readonly ['en-progreso', 'parcial', 'cumplida'] = [
  'en-progreso',
  'parcial',
  'cumplida',
]

export interface DraftStatusChange {
  draftId: string
  kind: 'status-change'
  requiresHumanApproval: true
  confidence: number
  grounding: Grounding
  decision: DraftDecision
  promiseId: string
  currentStatus: Status
  proposedStatus: 'en-progreso' | 'parcial' | 'cumplida'
  evidence: EvidenceEntry
  reasoning: DraftReasoning[]
  generatedAt: string
}

export type QueueDraft = DraftNewPromise | DraftStatusChange

export interface PromiseReviewQueue {
  version: string
  generatedAt: string
  drafts: QueueDraft[]
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

export function makeStatusDraftId(
  promiseId: string,
  proposedStatus: string,
  evidenceUrl: string,
): string {
  return `dsc-${slugify(promiseId)}-${proposedStatus}-${fnv32(`${promiseId}|${proposedStatus}|${evidenceUrl}`)}`
}

function validateDraft(d: unknown, i: number): QueueDraft {
  if (!d || typeof d !== 'object') throw new QueueValidationError(`drafts[${i}] must be object`)
  const r = d as Record<string, unknown>
  str(r.draftId, `drafts[${i}].draftId`, 3, 120)
  if (r.kind === 'new-promise') return validateNewPromiseDraft(r, i)
  if (r.kind === 'status-change') return validateStatusChangeDraft(r, i)
  throw new QueueValidationError(`drafts[${i}].kind must be 'new-promise' or 'status-change'`)
}

function validateNewPromiseDraft(r: Record<string, unknown>, i: number): DraftNewPromise {
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

function validateStatusChangeDraft(r: Record<string, unknown>, i: number): DraftStatusChange {
  if (r.requiresHumanApproval !== true)
    throw new QueueValidationError(`drafts[${i}].requiresHumanApproval must be true`)
  if (typeof r.confidence !== 'number' || r.confidence < 0 || r.confidence > 1)
    throw new QueueValidationError(`drafts[${i}].confidence must be 0..1`)
  oneOf(r.decision, DECISIONS, `drafts[${i}].decision`)
  const g = r.grounding as Record<string, unknown>
  if (!g || typeof g !== 'object') throw new QueueValidationError(`drafts[${i}].grounding missing`)
  if (typeof g.grounded !== 'boolean')
    throw new QueueValidationError(`drafts[${i}].grounding.grounded must be bool`)
  oneOf(r.currentStatus, ALLOWED_STATUSES, `drafts[${i}].currentStatus`)
  oneOf(r.proposedStatus, PROGRESS_STATUSES, `drafts[${i}].proposedStatus`)
  str(r.promiseId, `drafts[${i}].promiseId`, 3, 80)
  const ev = r.evidence as Record<string, unknown>
  if (!ev || typeof ev !== 'object') throw new QueueValidationError(`drafts[${i}].evidence missing`)
  url(ev.url, `drafts[${i}].evidence.url`)
  str(ev.quote, `drafts[${i}].evidence.quote`, 10, 800)
  iso(ev.date, `drafts[${i}].evidence.date`)
  str(ev.publisher, `drafts[${i}].evidence.publisher`, 1, 100)
  str(ev.kind, `drafts[${i}].evidence.kind`)
  str(ev.addedBy, `drafts[${i}].evidence.addedBy`, 1, 80)
  if (!Array.isArray(r.reasoning))
    throw new QueueValidationError(`drafts[${i}].reasoning must be array`)
  str(r.generatedAt, `drafts[${i}].generatedAt`)
  return r as unknown as DraftStatusChange
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
