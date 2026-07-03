/**
 * Pure snapshot mutations for the apply path. The CLIs read+validate
 * promises.json, call these, then re-validate + write. No I/O here so the
 * round-trip (including validatePromisesSnapshot) is unit-tested.
 */
import type { PromisesSnapshot, Promise, Status } from './promises'
import {
  makeDraftId,
  makeStatusDraftId,
  type DraftNewPromise,
  type DraftStatusChange,
} from './promise-draft'

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
  // Only auto-CREATED promises (id "ac-…", from newPromiseFromDraft) may be
  // deleted on retract. A pre-existing promise carries `autoPublished` only
  // because an auto-published STATUS CHANGE landed on it — deleting the whole
  // promise would lose curated data. Reverting the status (not deleting) is the
  // correct retract for those, and lands with the dashboard control (Plan 2B).
  if (!promiseId.startsWith('ac-')) {
    throw new Error(
      `promise "${promiseId}" pre-existed and was advanced by an auto-published status change — deleting it would lose curated data. Revert its status manually (status-change retract is a curator dashboard action).`,
    )
  }
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
  // Optimistic concurrency: a status-change draft can sit in the queue for days
  // before a curator applies it. If the promise's status has moved since the
  // draft was built, the draft is STALE — applying it could downgrade or
  // clobber a newer status. Refuse rather than apply a stale transition.
  if (target.status !== draft.currentStatus) {
    throw new Error(
      `promise "${draft.promiseId}" is now "${target.status}", not the draft's expected "${draft.currentStatus}" — refusing to apply a stale status transition`,
    )
  }
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
              // Record the pre-change state so a retract can cleanly REVERT this
              // pre-existing promise (status → priorStatus, drop the appended
              // evidence) instead of deleting it.
              priorStatus: p.status,
              appendedEvidenceUrl: draft.evidence.url,
            }
          : (p.autoPublished ?? null),
      }
    }),
  }
}

/**
 * Revert an auto-published STATUS CHANGE on a pre-existing promise: restore the
 * status to `autoPublished.priorStatus`, drop the single evidence entry the
 * change appended (matched by url + auto-curation authorship), and clear the
 * autoPublished stamp — the promise returns to its pre-change curated state.
 * Throws if the promise is missing or carries no revertible status change.
 */
export function revertStatusChange(
  snap: PromisesSnapshot,
  promiseId: string,
  now: string,
): PromisesSnapshot {
  const target = snap.items.find((p) => p.id === promiseId)
  if (!target) throw new Error(`promise "${promiseId}" not found`)
  const meta = target.autoPublished
  if (!meta || meta.priorStatus === undefined)
    throw new Error(`promise "${promiseId}" has no auto-published status change to revert`)
  const evUrl = meta.appendedEvidenceUrl
  return {
    ...snap,
    items: snap.items.map((p) => {
      if (p.id !== promiseId) return p
      // Drop the LAST auto-curation evidence entry at the appended url (the one
      // this status change added), leaving any pre-existing evidence intact.
      const evidence = [...p.evidence]
      for (let i = evidence.length - 1; i >= 0; i--) {
        if (evidence[i].url === evUrl && evidence[i].addedBy === 'auto-curation-v1') {
          evidence.splice(i, 1)
          break
        }
      }
      return {
        ...p,
        status: meta.priorStatus as Status,
        evidence,
        updatedAt: now.slice(0, 10),
        autoPublished: null,
      }
    }),
  }
}

/**
 * Reconstruct the status-change draft that mining WOULD regenerate for an
 * auto-published status change, so retract can tombstone it in the review
 * archive — the orchestrator's `seen` set then skips THIS evidence url. A
 * different/stronger evidence later still re-proposes (different draftId).
 * Returns null if the promise carries no reconstructable status change.
 */
export function tombstoneStatusChange(p: Promise, now: string): DraftStatusChange | null {
  const meta = p.autoPublished
  if (!meta || meta.priorStatus === undefined || !meta.appendedEvidenceUrl) return null
  const evUrl = meta.appendedEvidenceUrl
  const ev = [...p.evidence]
    .reverse()
    .find((e) => e.url === evUrl && e.addedBy === 'auto-curation-v1')
  if (!ev) return null
  const proposed = p.status
  if (proposed !== 'en-progreso' && proposed !== 'parcial' && proposed !== 'cumplida') return null
  return {
    draftId: makeStatusDraftId(p.id, proposed, evUrl),
    kind: 'status-change',
    requiresHumanApproval: true,
    confidence: meta.confidence,
    grounding: { grounded: false, urlResolved: false, quoteFound: false, checkedAt: now },
    decision: 'queue',
    promiseId: p.id,
    currentStatus: meta.priorStatus,
    proposedStatus: proposed,
    evidence: ev,
    reasoning: [],
    generatedAt: now,
  }
}
