import { describe, it, expect } from 'vitest'
import { isMapComplete } from '../src/scraper/speaker-map'

const stats = (chunksTranscribed: unknown, chunksExpected: unknown) => ({
  stats: { chunksTranscribed, chunksExpected },
})

describe('isMapComplete', () => {
  it('is complete when every chunk of the session was transcribed', () => {
    expect(isMapComplete(stats(25, 25))).toBe(true)
  })

  /**
   * The defect this predicate replaces. The backlog used to select on the map
   * FILE existing, so a 25-chunk session capped at 16 by the daily quota wrote
   * a partial map and was never picked up again — its last 9 chunks
   * unreachable at any quota, forever.
   */
  it('is INCOMPLETE when the quota cut the run short', () => {
    expect(isMapComplete(stats(16, 25))).toBe(false)
  })

  it('tolerates a run that somehow exceeded the count', () => {
    expect(isMapComplete(stats(26, 25))).toBe(true)
  })

  describe('anything it cannot read counts as unfinished', () => {
    /**
     * Asymmetric on purpose: re-running a finished session costs some quota,
     * skipping an unfinished one costs a session nobody ever revisits.
     */
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['no stats block', {}],
      ['missing counters', { stats: {} }],
      ['string counters', stats('16', '25')],
      ['NaN', stats(Number.NaN, 25)],
      ['Infinity', stats(Number.POSITIVE_INFINITY, 25)],
      ['zero total — nothing was ever planned', stats(0, 0)],
      ['negative total', stats(0, -1)],
      ['an array instead of an object', []],
      ['a bare string', 'nope'],
    ])('%s → unfinished', (_label, input) => {
      expect(isMapComplete(input)).toBe(false)
    })
  })

  it('does not treat an all-failed run as done', () => {
    // 0 of 25 transcribed: the quota died before the first chunk.
    expect(isMapComplete(stats(0, 25))).toBe(false)
  })
})
