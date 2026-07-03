/**
 * Pure decision core for the promise auto-curator. Maps each grounded
 * candidate to {auto-publish | fast-track | queue} by status tier +
 * confidence + grounding, and splits a candidate batch accordingly.
 *
 * No I/O, no LLM, no network — fully unit-tested. The orchestrator CLI
 * (scripts/auto-curate-promises.ts) supplies grounded candidates and
 * persists the result.
 */
import type { Status } from './promises'
import { stripDiacritics } from './normalize'
import type { DraftNewPromise, DraftStatusChange, DraftDecision, Grounding } from './promise-draft'

export const AUTO_PUBLISH_MIN_CONFIDENCE = 0.7

/**
 * Risk tier per status. Neutral/low-stakes verdicts auto-publish above the
 * gate; the strong claims 'parcial'/'cumplida' and the accusatory
 * 'no-ejecutada' are fast-track (one human click); 'inviable' is never
 * machine-published. Discovery only ever emits 'documentada', so the
 * fast-track rows only bite on status-change drafts. Edit this map to
 * retune posture.
 */
export const STATUS_TIER: Record<Status, 'auto' | 'fast-track' | 'human-only'> = {
  documentada: 'auto',
  'en-verificacion': 'auto',
  'en-progreso': 'auto',
  parcial: 'fast-track',
  cumplida: 'fast-track',
  'no-ejecutada': 'fast-track',
  inviable: 'human-only',
}

export function decideDraft(
  status: Status,
  confidence: number,
  grounding: Grounding,
  minConfidence: number = AUTO_PUBLISH_MIN_CONFIDENCE,
): DraftDecision {
  const tier = STATUS_TIER[status]
  if (tier === 'human-only') return 'queue'
  const clears = confidence >= minConfidence && grounding.grounded
  if (!clears) return 'queue'
  return tier === 'auto' ? 'auto-publish' : 'fast-track'
}

export function normKey(party: string, title: string): string {
  return `${stripDiacritics(party.toLowerCase())}::${stripDiacritics(title.toLowerCase()).replace(/\s+/g, ' ').trim()}`
}

export interface SelectInput {
  candidates: DraftNewPromise[]
  existingPromises: Array<{ id: string; party: string; title: string; source?: { url?: string } }>
  seenDraftIds: Set<string>
  frozen: boolean
  minConfidence?: number
  max?: number
}

export interface SelectOutput {
  autoPublish: DraftNewPromise[]
  queue: DraftNewPromise[]
  skipped: Array<{ draftId: string; reason: string }>
}

export function selectPromiseDrafts(inp: SelectInput): SelectOutput {
  const out: SelectOutput = { autoPublish: [], queue: [], skipped: [] }
  if (inp.frozen) {
    for (const c of inp.candidates) out.skipped.push({ draftId: c.draftId, reason: 'frozen' })
    return out
  }
  const existingKeys = new Set(inp.existingPromises.map((p) => normKey(p.party, p.title)))
  const existingUrls = new Set(
    inp.existingPromises.map((p) => p.source?.url).filter((u): u is string => Boolean(u)),
  )
  const min = inp.minConfidence ?? AUTO_PUBLISH_MIN_CONFIDENCE
  let taken = 0
  for (const c of inp.candidates) {
    if (inp.max !== undefined && taken >= inp.max) {
      out.skipped.push({ draftId: c.draftId, reason: 'max-reached' })
      continue
    }
    if (inp.seenDraftIds.has(c.draftId)) {
      out.skipped.push({ draftId: c.draftId, reason: 'duplicate' })
      continue
    }
    if (
      existingKeys.has(normKey(c.proposed.party, c.proposed.title)) ||
      existingUrls.has(c.proposed.source.url)
    ) {
      out.skipped.push({ draftId: c.draftId, reason: 'already-tracked' })
      continue
    }
    const decision = decideDraft(c.proposed.status, c.confidence, c.grounding, min)
    const draft = { ...c, decision }
    // fast-track items also land in out.queue; callers distinguish by draft.decision
    if (decision === 'auto-publish') out.autoPublish.push(draft)
    else out.queue.push(draft)
    taken++
  }
  return out
}

export interface SelectStatusInput {
  candidates: DraftStatusChange[]
  seenDraftIds: Set<string>
  /** promiseId+proposedStatus keys already published/queued, to avoid churn. */
  seenTransitions: Set<string>
  frozen: boolean
  minConfidence?: number
  max?: number
}

export interface SelectStatusOutput {
  autoPublish: DraftStatusChange[]
  queue: DraftStatusChange[]
  skipped: Array<{ draftId: string; reason: string }>
}

export function statusTransitionKey(promiseId: string, proposedStatus: string): string {
  return `${promiseId}::${proposedStatus}`
}

/** Fulfilment ordinal for the forward-only guard: an auto status change may only
 *  ADVANCE a promise, never regress it. documentada/en-verificacion are the
 *  baseline (0); en-progreso(1) < parcial(2) < cumplida(3). The accusatory /
 *  terminal statuses map to 0 so a machine change can never step "down" onto or
 *  off them (they are curator-only anyway). */
const PROGRESS_ORDER: Record<Status, number> = {
  documentada: 0,
  'en-verificacion': 0,
  'en-progreso': 1,
  parcial: 2,
  cumplida: 3,
  'no-ejecutada': 0,
  inviable: 0,
}

/** Mirror of selectPromiseDrafts for status-change drafts. */
export function selectStatusDrafts(inp: SelectStatusInput): SelectStatusOutput {
  const out: SelectStatusOutput = { autoPublish: [], queue: [], skipped: [] }
  if (inp.frozen) {
    for (const c of inp.candidates) out.skipped.push({ draftId: c.draftId, reason: 'frozen' })
    return out
  }
  const min = inp.minConfidence ?? AUTO_PUBLISH_MIN_CONFIDENCE
  // Intra-batch transition dedup: mineStatusChanges runs per promise and can
  // emit several drafts for the SAME (promiseId, proposedStatus) citing
  // different candidates. Without this, both land — duplicate queue rows, or (on
  // the auto path) a second apply that trips the stale guard and aborts the run.
  const takenTransitions = new Set<string>()
  let taken = 0
  for (const c of inp.candidates) {
    if (inp.max !== undefined && taken >= inp.max) {
      out.skipped.push({ draftId: c.draftId, reason: 'max-reached' })
      continue
    }
    if (inp.seenDraftIds.has(c.draftId)) {
      out.skipped.push({ draftId: c.draftId, reason: 'duplicate' })
      continue
    }
    const key = statusTransitionKey(c.promiseId, c.proposedStatus)
    if (inp.seenTransitions.has(key) || takenTransitions.has(key)) {
      out.skipped.push({ draftId: c.draftId, reason: 'already-tracked' })
      continue
    }
    // Forward-only: never auto-regress a promise (e.g. cumplida → en-progreso).
    // Curator corrections go through the apply CLI directly, not this selector.
    if (PROGRESS_ORDER[c.proposedStatus] <= PROGRESS_ORDER[c.currentStatus]) {
      out.skipped.push({ draftId: c.draftId, reason: 'not-forward' })
      continue
    }
    const decision = decideDraft(c.proposedStatus, c.confidence, c.grounding, min)
    const draft = { ...c, decision }
    // fast-track items also land in out.queue; callers distinguish by draft.decision
    if (decision === 'auto-publish') out.autoPublish.push(draft)
    else out.queue.push(draft)
    takenTransitions.add(key)
    taken++
  }
  return out
}
