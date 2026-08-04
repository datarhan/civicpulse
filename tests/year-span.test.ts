import { describe, it, expect } from 'vitest'
import { yearSpan } from '../src/lib/year-span.js'

describe('yearSpan', () => {
  it('spans the first and last year present', () => {
    expect(yearSpan(['2019-04-01', '2017-07-03', '2026-07-28'])).toBe('2017–2026')
  })

  it('collapses to a single year when every row shares one', () => {
    expect(yearSpan(['2025-01-09', '2025-12-30'])).toBe('2025')
  })

  it('returns null rather than inventing a period when nothing is dated', () => {
    expect(yearSpan([])).toBeNull()
    expect(yearSpan([null, undefined, ''])).toBeNull()
  })

  it('ignores unusable dates instead of letting them widen the span', () => {
    // A null awardDate stringifies to "null" — four characters, which a naive
    // slice(0,4) would happily sort ahead of every real year.
    expect(yearSpan(['2021-05-05', null, 'n/a', undefined, '2023-01-01'])).toBe('2021–2023')
  })

  it('reads full ISO timestamps, which is what the TED snapshot carries', () => {
    expect(yearSpan(['2018-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'])).toBe('2018–2026')
  })

  it('is not fooled by lexical sorting of mixed-length strings', () => {
    expect(yearSpan(['2020', '2019-12-31T23:59:59.000Z'])).toBe('2019–2020')
  })
})
