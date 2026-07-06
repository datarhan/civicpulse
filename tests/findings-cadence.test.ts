import { describe, it, expect } from 'vitest'
import { isoWeekKey, weeklyCadence } from '../src/lib/findings-cadence'

describe('isoWeekKey', () => {
  it('computes ISO 8601 week keys (Thursday-anchored)', () => {
    // 2026-01-01 is a Thursday → ISO week 1 of 2026.
    expect(isoWeekKey('2026-01-01')).toBe('2026-W01')
    // 2025-12-29 is the Monday of that same ISO week → belongs to ISO-year 2026.
    expect(isoWeekKey('2025-12-29')).toBe('2026-W01')
    // 2026-06-01 is a Monday → week 23.
    expect(isoWeekKey('2026-06-01')).toBe('2026-W23')
    expect(isoWeekKey('2026-07-06')).toBe('2026-W28')
  })

  it('returns null for garbage', () => {
    expect(isoWeekKey('not-a-date')).toBe(null)
  })
})

describe('weeklyCadence', () => {
  it('returns null when nothing has been published', () => {
    expect(weeklyCadence([], { now: '2026-07-06' })).toBe(null)
    expect(weeklyCadence([{}, { publishedAt: undefined }], { now: '2026-07-06' })).toBe(null)
  })

  it('enumerates every week from first publication to now, counting gaps', () => {
    const items = [
      { publishedAt: '2026-06-01' }, // W23
      { publishedAt: '2026-06-03' }, // W23
      { publishedAt: '2026-06-15' }, // W25
    ]
    const r = weeklyCadence(items, { now: '2026-06-18' }) // Thursday of W25
    expect(r).not.toBe(null)
    expect(r!.firstWeek).toBe('2026-W23')
    expect(r!.currentWeek).toBe('2026-W25')
    expect(r!.totalWeeks).toBe(3)
    expect(r!.coveredWeeks).toBe(2)
    expect(r!.coverageRatio).toBeCloseTo(2 / 3)
    expect(r!.currentWeekCount).toBe(1)
    expect(r!.gapWeeks).toEqual(['2026-W24'])
    expect(r!.perWeek).toEqual([
      { week: '2026-W23', count: 2 },
      { week: '2026-W24', count: 0 },
      { week: '2026-W25', count: 1 },
    ])
  })

  it('flags an uncovered current week', () => {
    const r = weeklyCadence([{ publishedAt: '2026-06-01' }], { now: '2026-06-10' })
    expect(r!.currentWeekCount).toBe(0)
    expect(r!.gapWeeks).toEqual(['2026-W24'])
  })

  it('returns null when every publication is in the future of now', () => {
    expect(weeklyCadence([{ publishedAt: '2026-08-03' }], { now: '2026-07-06' })).toBe(null)
  })
})
