/**
 * Curator approvals for queja ↔ contract Tier-B links.
 *
 * The relations engine writes machine suggestions to
 * public/data/queja-contract-relations.json (Tier B carries
 * `requiresHumanApproval: true`). A curator promotes a specific pair via
 * `npm run promote-relation`, which appends it here — a SEPARATE, human-curated
 * file the nightly scraper never regenerates. The UI renders a Tier-B link only
 * when its (quejaId, tenderId) pair appears in this file.
 *
 * Defence in depth: this shape FORBIDS `requiresHumanApproval` (as
 * place-overrides forbids it) — an approved row is, by definition, approved.
 */

const FORBIDDEN = 'requiresHumanApproval'

export interface RelationApproval {
  quejaId: string
  tenderId: string
  curator: string
  note?: string
  approvedAt: string
}

export interface ApprovalsSnapshot {
  generatedAt: string
  approvals: RelationApproval[]
}

function must(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`[queja-relation-approval] ${msg}`)
}

export function validateApprovalsSnapshot(json: string): ApprovalsSnapshot {
  const snap = JSON.parse(json) as unknown
  must(snap && typeof snap === 'object', 'snapshot must be an object')
  const s = snap as Record<string, unknown>
  must(Array.isArray(s.approvals), 'approvals must be an array')
  ;(s.approvals as unknown[]).forEach((raw, i) => {
    must(raw && typeof raw === 'object', `approval ${i} must be an object`)
    const a = raw as Record<string, unknown>
    must(!(FORBIDDEN in a), `approval ${i} must not carry ${FORBIDDEN}`)
    must(typeof a.quejaId === 'string' && a.quejaId.length > 0, `approval ${i}: bad quejaId`)
    must(typeof a.tenderId === 'string' && a.tenderId.length > 0, `approval ${i}: bad tenderId`)
    must(typeof a.curator === 'string' && a.curator.trim().length > 0, `approval ${i}: bad curator`)
    must(
      typeof a.approvedAt === 'string' && !Number.isNaN(Date.parse(a.approvedAt)),
      `approval ${i}: bad approvedAt`,
    )
    must(a.note === undefined || typeof a.note === 'string', `approval ${i}: bad note`)
  })
  return snap as ApprovalsSnapshot
}

/** Append (or replace, deduped by pair) an approval. Last write wins. */
export function appendApproval(snap: ApprovalsSnapshot, a: RelationApproval): ApprovalsSnapshot {
  const approvals = (snap.approvals ?? []).filter(
    (x) => !(x.quejaId === a.quejaId && x.tenderId === a.tenderId),
  )
  approvals.push(a)
  return { ...snap, approvals }
}

/** Remove an approved pair (curator reject). */
export function removeApproval(
  snap: ApprovalsSnapshot,
  quejaId: string,
  tenderId: string,
): ApprovalsSnapshot {
  return {
    ...snap,
    approvals: (snap.approvals ?? []).filter(
      (x) => !(x.quejaId === quejaId && x.tenderId === tenderId),
    ),
  }
}
