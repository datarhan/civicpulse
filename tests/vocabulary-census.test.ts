import { describe, it, expect } from 'vitest'
import { censusFindings, FALLBACK_CEILING, type FieldCensus } from '../src/scraper/vocabulary-census'

const base: FieldCensus[] = [
  { path: 'tenders.contracts.status', values: { awarded: 362, formalized: 298, void: 41 } },
]

describe('vocabulary census', () => {
  it('catches the formalized bug: a field mostly falling back to unknown', () => {
    // The real shape before the fix — 298 signed contracts coerced to `unknown`
    // because the enum said `finalized`, a word the source never emits.
    const now: FieldCensus[] = [
      { path: 'tenders.contracts.status', values: { awarded: 362, unknown: 298, void: 41 } },
    ]
    const f = censusFindings(now, base)
    const err = f.filter((x) => x.severity === 'error')
    expect(err).toHaveLength(1)
    expect(err[0].kind).toBe('fallback-share')
    expect(err[0].detail).toMatch(/4[0-9]% of rows/)
  })

  it('stays quiet at the healthy level', () => {
    // 13 blank-status rows out of 711 is how Gobierto actually behaves.
    const now: FieldCensus[] = [
      { path: 'tenders.contracts.status', values: { awarded: 362, formalized: 298, unknown: 13 } },
    ]
    expect(censusFindings(now, base).filter((x) => x.severity === 'error')).toEqual([])
  })

  it('warns the day a new upstream value appears', () => {
    const now: FieldCensus[] = [
      {
        path: 'tenders.contracts.status',
        values: { awarded: 362, formalized: 298, void: 41, en_tramite: 5 },
      },
    ]
    const f = censusFindings(now, base)
    expect(f.some((x) => x.kind === 'new-value' && x.detail.includes('en_tramite'))).toBe(true)
  })

  it('warns when a common value disappears — an upstream rename', () => {
    const now: FieldCensus[] = [
      { path: 'tenders.contracts.status', values: { awarded: 362, void: 41 } },
    ]
    expect(censusFindings(now, base).some((x) => x.kind === 'value-vanished')).toBe(true)
  })

  it('does not report drift the first time a field is seen', () => {
    const now: FieldCensus[] = [{ path: 'brand.new.field', values: { a: 5, b: 5 } }]
    expect(censusFindings(now, base)).toEqual([])
  })

  it('keeps the ceiling clear of both the healthy and the broken case', () => {
    expect(FALLBACK_CEILING).toBeGreaterThan(0.06)
    expect(FALLBACK_CEILING).toBeLessThan(0.4)
  })
})
