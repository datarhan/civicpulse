import { describe, it, expect } from 'vitest'
import {
  isReviewed,
  recordReview,
  staleReviews,
  summaryHash,
  REVIEW_LOG_VERSION,
  type ExceptionReview,
  type ExceptionReviewLog,
} from '../src/scraper/finding-exception-review'

const review = (over: Partial<ExceptionReview> = {}): ExceptionReview => ({
  findingId: 'f-1',
  decision: 'keep',
  reviewer: 'alguien',
  reviewedAt: '2026-08-11T00:00:00.000Z',
  summaryHash: summaryHash('un sumario cualquiera'),
  note: 'relata lo dicho sin afirmarlo como hecho comprobado',
  ...over,
})

const log = (reviews: ExceptionReview[]): ExceptionReviewLog => ({
  version: REVIEW_LOG_VERSION,
  generatedAt: '2026-08-11T00:00:00.000Z',
  reviews,
})

describe('summaryHash', () => {
  it('ignores whitespace reflowing, which is not an editorial change', () => {
    expect(summaryHash('un  sumario\n cualquiera')).toBe(summaryHash('un sumario cualquiera'))
  })

  it('changes when a word changes', () => {
    expect(summaryHash('el PSOE afirma')).not.toBe(summaryHash('el PP afirma'))
  })
})

describe('isReviewed', () => {
  it('is true only for the exact summary that was judged', () => {
    const l = log([review()])
    expect(isReviewed(l, 'f-1', 'un sumario cualquiera')).toBe(true)
  })

  /**
   * The property the whole log rests on. A reviewer cleared specific words, not
   * an id; if the words change, nobody has judged what is now published.
   */
  it('is FALSE once the summary is edited', () => {
    const l = log([review()])
    expect(isReviewed(l, 'f-1', 'un sumario cualquiera, ampliado')).toBe(false)
  })

  describe('fails towards unreviewed', () => {
    it.each([
      ['no log at all', null],
      ['empty log', log([])],
      ['a different finding', log([review({ findingId: 'f-otro' })])],
    ])('%s', (_label, l) => {
      expect(isReviewed(l as ExceptionReviewLog | null, 'f-1', 'un sumario cualquiera')).toBe(false)
    })
  })
})

describe('recordReview', () => {
  it('adds a review', () => {
    expect(recordReview(null, review()).reviews).toHaveLength(1)
  })

  /** One current entry per finding, not a pile of stale ones. */
  it('replaces an earlier review of the same finding', () => {
    const first = recordReview(null, review())
    const second = recordReview(first, review({ summaryHash: summaryHash('reescrito') }))
    expect(second.reviews).toHaveLength(1)
    expect(second.reviews[0].summaryHash).toBe(summaryHash('reescrito'))
  })

  it('keeps reviews of other findings', () => {
    const l = recordReview(log([review({ findingId: 'f-otro' })]), review())
    expect(l.reviews.map((r) => r.findingId).sort()).toEqual(['f-1', 'f-otro'])
  })
})

describe('staleReviews', () => {
  it('finds a review whose summary moved on', () => {
    const l = log([review()])
    const stale = staleReviews(l, new Map([['f-1', 'otro sumario']]))
    expect(stale.map((r) => r.findingId)).toEqual(['f-1'])
  })

  it('finds a review whose finding no longer exists', () => {
    expect(staleReviews(log([review()]), new Map()).map((r) => r.findingId)).toEqual(['f-1'])
  })

  it('is empty when every review still describes what is published', () => {
    expect(staleReviews(log([review()]), new Map([['f-1', 'un sumario cualquiera']]))).toEqual([])
  })
})
