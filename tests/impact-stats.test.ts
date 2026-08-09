import { describe, it, expect } from 'vitest'
import { summarizeImpact } from '../src/lib/impact-stats'

describe('summarizeImpact', () => {
  it('returns zeros and null date on empty/missing snapshots', () => {
    expect(summarizeImpact({})).toEqual({
      plenosCount: 0,
      findingsCount: 0,
      quejasCount: 0,
      contractsCount: 0,
      lastFindingAt: null,
    })
    expect(summarizeImpact()).toEqual({
      plenosCount: 0,
      findingsCount: 0,
      quejasCount: 0,
      contractsCount: 0,
      lastFindingAt: null,
    })
  })

  it('counts items across the four snapshot shapes', () => {
    const out = summarizeImpact({
      plenos: { items: [{}, {}, {}] },
      findings: { items: [{ publishedAt: '2026-07-01' }] },
      quejas: { items: [{}] },
      tenders: { contracts: [{}, {}] },
    })
    expect(out).toEqual({
      plenosCount: 3,
      findingsCount: 1,
      quejasCount: 1,
      contractsCount: 2,
      lastFindingAt: '2026-07-01',
    })
  })

  it('lastFindingAt is the max publishedAt, tolerating rows without one', () => {
    const out = summarizeImpact({
      findings: {
        items: [
          { publishedAt: '2026-07-03' },
          {},
          { publishedAt: '2026-07-06' },
          { publishedAt: '2026-06-01' },
        ],
      },
    })
    expect(out.findingsCount).toBe(4)
    expect(out.lastFindingAt).toBe('2026-07-06')
  })
})
