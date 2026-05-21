/**
 * Freshness-helper contract tests.
 *
 * Locks the boundaries so a future refactor can't silently shift the
 * tone scheme — operators rely on the visual signal to triage stale
 * scrapers, and a Pill that turns warn 1h too early or too late would
 * be a quiet trust erosion.
 */
import { describe, expect, it } from 'vitest'

import { ageHours, freshnessLabelKey, freshnessTone } from '../src/lib/data-freshness'

const REF_NOW = new Date('2026-05-21T12:00:00.000Z').getTime()

function isoHoursAgo(h: number): string {
  return new Date(REF_NOW - h * 60 * 60 * 1000).toISOString()
}

describe('ageHours', () => {
  it('returns 0 for an iso equal to now', () => {
    expect(ageHours(isoHoursAgo(0), REF_NOW)).toBe(0)
  })

  it('returns the elapsed hours for a past iso', () => {
    expect(ageHours(isoHoursAgo(5), REF_NOW)).toBeCloseTo(5)
    expect(ageHours(isoHoursAgo(168), REF_NOW)).toBeCloseTo(168)
  })

  it('clamps future iso to 0', () => {
    expect(ageHours(isoHoursAgo(-12), REF_NOW)).toBe(0)
  })

  it('returns +Infinity for missing input', () => {
    expect(ageHours(undefined as unknown as string, REF_NOW)).toBe(Number.POSITIVE_INFINITY)
    expect(ageHours('', REF_NOW)).toBe(Number.POSITIVE_INFINITY)
    expect(ageHours(null as unknown as string, REF_NOW)).toBe(Number.POSITIVE_INFINITY)
  })

  it('returns +Infinity for an unparseable string', () => {
    expect(ageHours('not a date', REF_NOW)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('freshnessTone', () => {
  it('returns ok for < 36 h', () => {
    expect(freshnessTone(isoHoursAgo(0), REF_NOW)).toBe('ok')
    expect(freshnessTone(isoHoursAgo(12), REF_NOW)).toBe('ok')
    expect(freshnessTone(isoHoursAgo(35), REF_NOW)).toBe('ok')
  })

  it('flips to civic at the 36 h boundary', () => {
    expect(freshnessTone(isoHoursAgo(35.99), REF_NOW)).toBe('ok')
    expect(freshnessTone(isoHoursAgo(36), REF_NOW)).toBe('civic')
  })

  it('stays civic up to 7 d', () => {
    expect(freshnessTone(isoHoursAgo(24 * 6), REF_NOW)).toBe('civic')
    expect(freshnessTone(isoHoursAgo(24 * 7 - 0.01), REF_NOW)).toBe('civic')
  })

  it('flips to warn at the 7 d boundary', () => {
    expect(freshnessTone(isoHoursAgo(24 * 7), REF_NOW)).toBe('warn')
  })

  it('stays warn up to 30 d', () => {
    expect(freshnessTone(isoHoursAgo(24 * 29), REF_NOW)).toBe('warn')
    expect(freshnessTone(isoHoursAgo(24 * 30 - 0.01), REF_NOW)).toBe('warn')
  })

  it('flips to crit at the 30 d boundary', () => {
    expect(freshnessTone(isoHoursAgo(24 * 30), REF_NOW)).toBe('crit')
    expect(freshnessTone(isoHoursAgo(24 * 90), REF_NOW)).toBe('crit')
  })

  it('treats missing/invalid iso as crit (broken signal)', () => {
    expect(freshnessTone(undefined as unknown as string, REF_NOW)).toBe('crit')
    expect(freshnessTone('', REF_NOW)).toBe('crit')
    expect(freshnessTone('garbage', REF_NOW)).toBe('crit')
  })
})

describe('freshnessLabelKey', () => {
  it('maps every tone bucket to a stable i18n key', () => {
    expect(freshnessLabelKey(isoHoursAgo(1), REF_NOW)).toBe('freshness.fresh')
    expect(freshnessLabelKey(isoHoursAgo(48), REF_NOW)).toBe('freshness.recent')
    expect(freshnessLabelKey(isoHoursAgo(24 * 14), REF_NOW)).toBe('freshness.stale')
    expect(freshnessLabelKey(isoHoursAgo(24 * 60), REF_NOW)).toBe('freshness.dead')
  })

  it('treats missing iso as freshness.dead', () => {
    expect(freshnessLabelKey('', REF_NOW)).toBe('freshness.dead')
  })
})
