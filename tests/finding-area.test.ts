import { describe, it, expect } from 'vitest'
import { findingDeptSlugs, findingMatchesArea } from '../src/lib/finding-area'

/**
 * Findings carry no department of their own — the link runs
 * finding → sourceClaimIds → claim.topic → department, reusing the exact
 * DEPT_TO_CLAIM_TOPICS mapping the department pages already rely on. That
 * matters: an área filter invented from scratch would be a second, unaudited
 * notion of "which concejalía does this belong to".
 */
const claims = {
  items: [
    { claim: { id: 'c1', topic: 'urbanismo' } },
    { claim: { id: 'c2', topic: 'medio-ambiente' } },
    { claim: { id: 'c3', topic: 'other' } },
  ],
}

describe('finding-area', () => {
  it('resolves a finding to the departments its claims belong to', () => {
    const f = { sourceClaimIds: ['c1'] }
    expect(findingDeptSlugs(f, claims)).toContain('urbanismo')
  })

  it('unions the departments when a finding cites several topics', () => {
    const f = { sourceClaimIds: ['c1', 'c2'] }
    const slugs = findingDeptSlugs(f, claims)
    expect(slugs).toContain('urbanismo')
    expect(slugs).toContain('medio-ambiente')
  })

  it('returns nothing for an unmapped topic rather than guessing', () => {
    expect(findingDeptSlugs({ sourceClaimIds: ['c3'] }, claims)).toEqual([])
  })

  it('returns nothing when the cited claim is unknown', () => {
    expect(findingDeptSlugs({ sourceClaimIds: ['nope'] }, claims)).toEqual([])
  })

  it('treats a missing claims snapshot as "cannot tell", not "no match"', () => {
    expect(findingDeptSlugs({ sourceClaimIds: ['c1'] }, null)).toEqual([])
  })

  it('matches an área filter only on a real resolution', () => {
    expect(findingMatchesArea({ sourceClaimIds: ['c1'] }, 'urbanismo', claims)).toBe(true)
    expect(findingMatchesArea({ sourceClaimIds: ['c1'] }, 'cultura', claims)).toBe(false)
    // No filter set → everything passes, so the page is unfiltered by default.
    expect(findingMatchesArea({ sourceClaimIds: ['c3'] }, null, claims)).toBe(true)
  })
})

describe('department-claim-topics — the catch-all topic routes nowhere', () => {
  it('"other" resolves to no department', async () => {
    const { topicToDeptSlugs } = await import('../src/lib/department-claim-topics')
    // "other" is the classifier's could-not-determine bucket. Routing it to
    // alcaldia + innovacion put 439 unclassified claims under each of them.
    expect(topicToDeptSlugs('other')).toEqual([])
  })

  it('real topics still route', async () => {
    const { topicToDeptSlugs } = await import('../src/lib/department-claim-topics')
    expect(topicToDeptSlugs('urbanismo')).toContain('urbanismo')
    expect(topicToDeptSlugs('medio-ambiente')).toContain('medio-ambiente')
  })
})
