import { describe, it, expect } from 'vitest'
import { isCommittedContract, contractAmountEur } from '../src/lib/contract-status'

/**
 * One predicate for "did the town commit this money", because the definition
 * had already drifted: /departamentos reported €79M while /presupuesto
 * reported €14.7M from the same snapshot on the same day.
 */
describe('contract-status', () => {
  it('counts a formalized contract — it is signed, not a draft', () => {
    expect(isCommittedContract({ status: 'formalized', assignee: 'ACME SL' })).toBe(true)
  })

  it('counts an awarded contract', () => {
    expect(isCommittedContract({ status: 'awarded', assignee: 'ACME SL' })).toBe(true)
  })

  it('counts a blank-status row that names a winner', () => {
    // Gobierto leaves status empty on rows with assignee + date + amount.
    expect(isCommittedContract({ status: 'unknown', assignee: 'ACME SL' })).toBe(true)
  })

  it('never counts a cancelled award, even with a winner named', () => {
    for (const status of ['void', 'abandoned', 'revoked']) {
      expect(isCommittedContract({ status, assignee: 'ACME SL' })).toBe(false)
    }
  })

  it('does not count an unknown row with no winner', () => {
    expect(isCommittedContract({ status: 'unknown' })).toBe(false)
  })

  it('prefers the sin-IVA amount', () => {
    expect(contractAmountEur({ finalAmountNoTaxes: 100, finalAmount: 121 })).toBe(100)
  })

  it('treats missing or non-positive amounts as zero', () => {
    expect(contractAmountEur({})).toBe(0)
    expect(contractAmountEur({ finalAmountNoTaxes: -5 })).toBe(0)
  })
})

describe('isCommittedContract — in-flight statuses', () => {
  it('does not count an open tender that already names an assignee', () => {
    // Regression: the first version of this predicate treated "not cancelled +
    // has an assignee" as committed, which counted live tenders as spend.
    expect(isCommittedContract({ status: 'open', assignee: 'ACME' })).toBe(false)
  })

  it('does not count a provisional award', () => {
    // Provisional awards can still be withdrawn before formalisation; 23 of
    // the 449 licitaciones sit in that state.
    expect(isCommittedContract({ status: 'provisionally_awarded', assignee: 'ACME' })).toBe(false)
  })

  it('still counts a blank/unknown status when a winner is named', () => {
    expect(isCommittedContract({ status: 'unknown', assignee: 'GARBIALDI, S.A.' })).toBe(true)
    expect(isCommittedContract({ status: 'unknown', assignee: '' })).toBe(false)
  })
})

describe('isCommittedContract — unrecognised vocabulary', () => {
  it('refuses a status string it does not know, even with an assignee', () => {
    // If Gobierto introduces a new status, the honest answer is "not counted
    // as spend until someone looks", not "assume it is money out the door".
    expect(isCommittedContract({ status: 'en_tramite', assignee: 'ACME' })).toBe(false)
  })
})
