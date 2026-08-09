/**
 * The 2026-08-09 incident: `extract:press-claims` wrote its snapshot BEFORE
 * checking `llmUnavailable`, so a run whose every LLM call failed published
 * `items: []` over a live claim and only then exited 1. `c6a6e23` is the
 * damage. These tests pin the direction rule that replaced it — an incomplete
 * run may add claims, never remove them.
 */
import { describe, expect, it } from 'vitest'

import { countSnapshotItems, decideSnapshotWrite } from '../src/scraper/snapshot-write'

/**
 * `decideSnapshotWrite` is the generalised form of what shipped in 621872a as
 * `decidePressClaimsWrite`. `summarize:press` needed the identical gate, so the
 * function moved to src/scraper/snapshot-write.ts and was parameterised
 * (`llmUnavailable` → `unresolvedCount`, plus a cosmetic `itemNoun`) instead of
 * being copied. These tests still pin the extractor's use of it; the
 * summariser's is pinned in press-summaries-write-guard.test.ts.
 */
const asClaims = (args: {
  incomingCount: number
  llmUnavailable: number
  existingRaw: string | null
}) =>
  decideSnapshotWrite({
    incomingCount: args.incomingCount,
    unresolvedCount: args.llmUnavailable,
    existingRaw: args.existingRaw,
    itemNoun: 'claim',
  })

/** Build an on-disk snapshot with `n` claim-shaped rows. Only length matters. */
function snapshotWith(n: number): string {
  return JSON.stringify({
    generatedAt: '2026-08-05T08:45:30.969Z',
    source: { description: 'x', contract: 'src/scraper/press-claim.ts' },
    stats: { total: n },
    items: Array.from({ length: n }, (_, i) => ({ id: `claim-${i}` })),
  })
}

describe('decideSnapshotWrite · as extract:press-claims calls it', () => {
  it('refuses to shrink the corpus when the run was incomplete (the c6a6e23 reproducer)', () => {
    const d = asClaims({
      incomingCount: 0,
      llmUnavailable: 25,
      existingRaw: snapshotWith(1),
    })
    expect(d.write).toBe(false)
    // Assert the decision measured both sides, not merely that it said no.
    expect(d.existingCount).toBe(1)
    expect(d.incomingCount).toBe(0)
    expect(d.complete).toBe(false)
    expect(d.reason).toMatch(/refusing to overwrite 1 claim\(s\) with 0/)
  })

  it('refuses any shrink, not just a shrink to zero', () => {
    const d = asClaims({
      incomingCount: 3,
      llmUnavailable: 4,
      existingRaw: snapshotWith(7),
    })
    expect(d.write).toBe(false)
    expect(d.reason).toMatch(/refusing to overwrite 7 claim\(s\) with 3/)
  })

  it('allows growth from an incomplete run — that is real partial progress', () => {
    const d = asClaims({
      incomingCount: 9,
      llmUnavailable: 18,
      existingRaw: snapshotWith(4),
    })
    expect(d.write).toBe(true)
    expect(d.existingCount).toBe(4)
    expect(d.incomingCount).toBe(9)
    expect(d.reason).toMatch(/did not shrink the corpus \(4 → 9\)/)
  })

  it('allows an equal count from an incomplete run', () => {
    const d = asClaims({
      incomingCount: 2,
      llmUnavailable: 1,
      existingRaw: snapshotWith(2),
    })
    expect(d.write).toBe(true)
  })

  it('allows a first-ever write when no file exists on disk', () => {
    const d = asClaims({
      incomingCount: 0,
      llmUnavailable: 25,
      existingRaw: null,
    })
    expect(d.write).toBe(true)
    expect(d.existingCount).toBe(0)
  })

  it('treats a corrupt existing file as 0 on disk rather than blocking forever', () => {
    const d = asClaims({
      incomingCount: 0,
      llmUnavailable: 25,
      existingRaw: '{ this is not json',
    })
    expect(d.write).toBe(true)
    expect(d.existingCount).toBe(0)
  })

  it('does not interfere at all when the run was complete, even if it shrank', () => {
    const d = asClaims({
      incomingCount: 0,
      llmUnavailable: 0,
      existingRaw: snapshotWith(12),
    })
    // A complete run is authoritative: if the feed genuinely no longer yields
    // claims, the snapshot must be allowed to say so.
    expect(d.write).toBe(true)
    expect(d.complete).toBe(true)
    expect(d.existingCount).toBe(12)
    expect(d.reason).toMatch(/complete run \(unresolved=0\)/)
  })

  it('reports the counts it compared, so a green test cannot mean "measured nothing"', () => {
    const d = asClaims({
      incomingCount: 5,
      llmUnavailable: 2,
      existingRaw: snapshotWith(5),
    })
    expect(d).toMatchObject({ existingCount: 5, incomingCount: 5, complete: false })
    expect(d.reason.length).toBeGreaterThan(0)
  })
})

describe('countSnapshotItems', () => {
  it('counts items in a well-formed snapshot', () => {
    expect(countSnapshotItems(snapshotWith(3))).toBe(3)
  })

  it('returns 0 for null, empty, corrupt JSON and a missing items array', () => {
    expect(countSnapshotItems(null)).toBe(0)
    expect(countSnapshotItems('')).toBe(0)
    expect(countSnapshotItems('{ nope')).toBe(0)
    expect(countSnapshotItems('{"stats":{"total":9}}')).toBe(0)
    expect(countSnapshotItems('{"items":"not-an-array"}')).toBe(0)
  })
})
