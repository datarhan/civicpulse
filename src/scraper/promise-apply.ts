/**
 * Pure snapshot mutations for the apply path. The CLIs read+validate
 * promises.json, call these, then re-validate + write. No I/O here so the
 * round-trip (including validatePromisesSnapshot) is unit-tested.
 */
import type { PromisesSnapshot, Promise } from './promises'
import type { DraftNewPromise } from './promise-draft'

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

export function removeAutoPublished(snap: PromisesSnapshot, promiseId: string): PromisesSnapshot {
  const target = snap.items.find((p) => p.id === promiseId)
  if (!target) throw new Error(`promise "${promiseId}" not found`)
  if (!target.autoPublished)
    throw new Error(
      `promise "${promiseId}" is not auto-published — refusing to retract a human-curated promise`,
    )
  return { ...snap, items: snap.items.filter((p) => p.id !== promiseId) }
}
