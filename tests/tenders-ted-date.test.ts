import { describe, it, expect } from 'vitest'
import { yearFromPublicationNumber, resolveTedDate } from '../src/scraper/tenders-ted'

/**
 * TED's `publication-date` is absent on most notices this buyer appears in:
 * 54 of 56 real rows fell back to the Unix epoch, so the dataset read as
 * "everything happened on 1 January 1970" and could not be shown to anyone.
 *
 * The publication NUMBER carries the year — "66594-2018" — so the year is
 * recoverable even when the date field is missing. A year is less precise than
 * a date and is marked as such (approximate), rather than inventing a day.
 */
describe('tenders-ted — date recovery', () => {
  it('extracts the year from a publication number', () => {
    expect(yearFromPublicationNumber('66594-2018')).toBe(2018)
    expect(yearFromPublicationNumber('242372-2024')).toBe(2024)
  })

  it('returns null for a malformed number rather than guessing', () => {
    expect(yearFromPublicationNumber('')).toBeNull()
    expect(yearFromPublicationNumber('66594')).toBeNull()
    expect(yearFromPublicationNumber('66594-19')).toBeNull()
  })

  it('prefers a real publication date when TED supplies one', () => {
    const r = resolveTedDate('2024-04-24T00:00:00.000Z', '242372-2024')
    expect(r.date.slice(0, 10)).toBe('2024-04-24')
    expect(r.approximate).toBe(false)
  })

  it('falls back to the publication-number year, flagged approximate', () => {
    const r = resolveTedDate(undefined, '66594-2018')
    expect(r.date.slice(0, 4)).toBe('2018')
    expect(r.approximate).toBe(true)
  })

  it('treats an epoch date as missing — that is the bug being fixed', () => {
    const r = resolveTedDate('1970-01-01T00:00:00.000Z', '66594-2018')
    expect(r.date.slice(0, 4)).toBe('2018')
    expect(r.approximate).toBe(true)
  })

  it('leaves the date null when neither source yields a year', () => {
    expect(resolveTedDate(undefined, 'nonsense').date).toBeNull()
  })
})
