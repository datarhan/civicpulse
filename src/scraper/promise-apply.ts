/**
 * Pure snapshot mutations for the apply path. The CLIs read+validate
 * promises.json, call these, then re-validate + write. No I/O here so the
 * round-trip (including validatePromisesSnapshot) is unit-tested.
 */
import type { PromisesSnapshot, Promise } from './promises'
import { makeDraftId, type DraftNewPromise, type DraftStatusChange } from './promise-draft'

export interface AutoPublishMeta {
  confidence: number
  at: string // ISO
}

export function ensureUniqueId(id: string, existing: Set<string>): string {
  if (!existing.has(id)) return id
  let i = 2
  while (existing.has(`${id}-${i}`)) i++
  return `${id}-${i}`
}

export function newPromiseFromDraft(
  draft: DraftNewPromise,
  now: string,
  autoPublish?: AutoPublishMeta,
): Promise {
  const p: Promise = {
    id: draft.draftId.replace(/^dnp-/, 'ac-'),
    party: draft.proposed.party,
    title: draft.proposed.title,
    quote: draft.proposed.quote,
    source: { url: draft.proposed.source.url, publisher: draft.proposed.source.publisher },
    madeAt: draft.proposed.madeAt,
    topic: draft.proposed.topic,
    kind: draft.proposed.kind,
    status: 'documentada',
    evidence: [],
    createdAt: now.slice(0, 10),
    autoPublished: autoPublish
      ? {
          at: autoPublish.at,
          by: 'auto-curation-v1',
          confidence: autoPublish.confidence,
          reviewState: 'pending-review',
        }
      : null,
  }
  return p
}

export function insertPromise(snap: PromisesSnapshot, promise: Promise): PromisesSnapshot {
  const ids = new Set(snap.items.map((p) => p.id))
  const withId: Promise = { ...promise, id: ensureUniqueId(promise.id, ids) }
  return { ...snap, items: [...snap.items, withId] }
}

export function setReviewState(
  snap: PromisesSnapshot,
  promiseId: string,
  state: 'pending-review' | 'reviewed' | 'retracted',
  now: string,
): PromisesSnapshot {
  return {
    ...snap,
    items: snap.items.map((p) => {
      if (p.id !== promiseId || !p.autoPublished) return p
      return {
        ...p,
        autoPublished: { ...p.autoPublished, reviewState: state, reviewedAt: now },
        updatedAt: now.slice(0, 10),
      }
    }),
  }
}

/**
 * Reconstruct the queue-draft that discovery WOULD regenerate for an
 * already-published promise. Used on retract to tombstone the promise in
 * the review archive so the orchestrator's `seen` set skips it and it can
 * never be re-discovered + re-auto-published.
 */
export function tombstoneDraftFromPromise(p: Promise, now: string): DraftNewPromise {
  return {
    draftId: makeDraftId(p.party, p.title, p.source.url),
    kind: 'new-promise',
    requiresHumanApproval: true,
    confidence: p.autoPublished?.confidence ?? 0,
    grounding: { grounded: false, urlResolved: false, quoteFound: false, checkedAt: now },
    decision: 'queue',
    proposed: {
      party: p.party,
      title: p.title,
      quote: p.quote,
      source: { url: p.source.url, publisher: p.source.publisher },
      madeAt: p.madeAt,
      topic: p.topic,
      kind: p.kind,
      status: 'documentada',
    },
    reasoning: [],
    generatedAt: now,
  }
}

export function removeAutoPublished(snap: PromisesSnapshot, promiseId: string): PromisesSnapshot {
  const target = snap.items.find((p) => p.id === promiseId)
  if (!target) throw new Error(`promise "${promiseId}" not found`)
  if (!target.autoPublished)
    throw new Error(
      `promise "${promiseId}" is not auto-published — refusing to retract a human-curated promise`,
    )
  return { ...snap, items: snap.items.filter((p) => p.id !== promiseId) }
}

/**
 * Apply a status-change draft to an EXISTING promise: set the new status AND
 * append the grounded evidence in the SAME object, so the V1 gate (non-V1
 * status requires ≥1 evidence entry) passes on the single validated write.
 * Throws if the promiseId is missing.
 */
export function applyStatusChange(
  snap: PromisesSnapshot,
  draft: DraftStatusChange,
  now: string,
  autoPublish?: AutoPublishMeta,
): PromisesSnapshot {
  const target = snap.items.find((p) => p.id === draft.promiseId)
  if (!target) throw new Error(`promise "${draft.promiseId}" not found`)
  return {
    ...snap,
    items: snap.items.map((p) => {
      if (p.id !== draft.promiseId) return p
      return {
        ...p,
        status: draft.proposedStatus,
        evidence: [...p.evidence, draft.evidence],
        updatedAt: now.slice(0, 10),
        autoPublished: autoPublish
          ? {
              at: autoPublish.at,
              by: 'auto-curation-v1',
              confidence: autoPublish.confidence,
              reviewState: 'pending-review',
            }
          : (p.autoPublished ?? null),
      }
    }),
  }
}
