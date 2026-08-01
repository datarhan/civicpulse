// @ts-check
/**
 * Is this contract money the town has actually committed?
 *
 * Gobierto's `status` vocabulary is `awarded | formalized | void | abandoned |
 * revoked | ''`. **`formalized` means signed** — it is the final state of a
 * contract, not a draft — and it is the single most common value after
 * `awarded` (298 of 730 rows in the committed fixture).
 *
 * Every awarded total in this project used to be written as
 * `status === 'awarded'`, which excluded all of them: €53.5M across 314 signed
 * contracts, including the town's largest single contract (GARBIALDI's €15.8M
 * waste concession — on its own bigger than the entire published headline).
 *
 * One predicate, imported everywhere, so the definition of "spent" cannot
 * drift between the KPI strip, the map, the leaderboard and the department
 * pages again — which it already had: /departamentos said €79M while
 * /presupuesto said €14.7M from the same file.
 */

/** Statuses that mean the contract was signed or awarded. */
const COMMITTED = new Set(['awarded', 'formalized', 'finalized', 'closed'])

/** Statuses that mean the award was undone. Never counted as spend. */
const CANCELLED = new Set(['void', 'abandoned', 'revoked', 'withdrawn'])

/**
 * Statuses that mean the procurement is still running, so no money is
 * committed yet. `provisionally_awarded` belongs here: a provisional award can
 * still be withdrawn before formalisation, and 23 of the 449 licitaciones sit
 * in that state.
 */
const IN_FLIGHT = new Set([
  'open',
  'in_progress',
  'evaluation',
  'draft',
  'pending',
  'provisionally_awarded',
])

/**
 * True when the contract represents committed public money.
 *
 * The `unknown` fallback is deliberate and narrow. Gobierto leaves `status`
 * blank on rows that plainly are awarded — assignee, award date and amount all
 * present — and the parser normalises blank to `unknown`; that is where the
 * town's largest contract lives (GARBIALDI, €15.8M). But the fallback applies
 * ONLY to `unknown`. An in-flight status with a named winner is not spend, and
 * an earlier draft of this function that trusted any non-cancelled row with an
 * assignee counted open tenders as awarded money.
 */
export function isCommittedContract(c) {
  if (!c) return false
  if (CANCELLED.has(c.status)) return false
  if (COMMITTED.has(c.status)) return true
  if (IN_FLIGHT.has(c.status)) return false
  // Only a blank/unknown status falls back to "is there a named winner". A
  // status string we do not recognise is not evidence of spend — it means the
  // upstream vocabulary moved and someone needs to look, which the parser's
  // own enum test now enforces.
  if (c.status && c.status !== 'unknown') return false
  return Boolean(c.assignee)
}

/** Amount to attribute, sin IVA where available. Never negative. */
export function contractAmountEur(c) {
  const v = c?.finalAmountNoTaxes ?? c?.initialAmountNoTaxes ?? c?.finalAmount ?? c?.initialAmount
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}
