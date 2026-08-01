import { describe, it, expect } from 'vitest'
import { mergeWithCarryForward, type NewsItem, type FeedOutcome } from '../src/scraper/press'

/**
 * Regression contract for the 2026-07-30 data loss.
 *
 * That night the Ayuntamiento's own RSS feed answered with a WAF block, the
 * scraper wrote the snapshot anyway, and all 50 town-hall articles vanished
 * from civicpulse.es — the public site lost its primary source for two days
 * while every other feed looked healthy.
 *
 * The invariant: a feed that FAILS must never subtract already-published
 * items. It contributes its slice of the previous snapshot instead, so a
 * transient outage freezes that source rather than erasing it.
 */

function item(over: Partial<NewsItem> & { fingerprint: string }): NewsItem {
  return {
    id: over.fingerprint,
    title: `title ${over.fingerprint}`,
    link: `https://example.test/${over.fingerprint}`,
    source: 'Test',
    sourceHost: 'example.test',
    date: '2026-07-30T09:00:00.000Z',
    ...over,
  }
}

const isOfficial = (i: NewsItem) => i.official === true
const isInfoturia = (i: NewsItem) => i.sourceHost === 'infoturia.com'

describe('scraper/press — mergeWithCarryForward', () => {
  it('carries a failed feed forward from the previous snapshot', () => {
    const previous = [
      item({ fingerprint: 'o1', official: true, source: 'Ayuntamiento' }),
      item({ fingerprint: 'o2', official: true, source: 'Ayuntamiento' }),
      item({ fingerprint: 'g1' }),
    ]
    const outcomes: FeedOutcome[] = [
      { items: [], ok: false, owns: isOfficial },
      { items: [item({ fingerprint: 'g2' })], ok: true, owns: () => false },
    ]

    const { items, carriedForward } = mergeWithCarryForward(outcomes, previous)

    expect(carriedForward).toBe(2)
    expect(items.map((i) => i.fingerprint).sort()).toEqual(['g2', 'o1', 'o2'])
  })

  it('does NOT carry forward when the feed succeeded — fresh output wins', () => {
    const previous = [item({ fingerprint: 'o1', official: true })]
    const outcomes: FeedOutcome[] = [
      { items: [item({ fingerprint: 'o2', official: true })], ok: true, owns: isOfficial },
    ]

    const { items, carriedForward } = mergeWithCarryForward(outcomes, previous)

    expect(carriedForward).toBe(0)
    expect(items.map((i) => i.fingerprint)).toEqual(['o2'])
  })

  it('an empty-but-successful feed legitimately publishes zero items', () => {
    // A feed that genuinely went quiet must not be resurrected from cache —
    // only a FAILED fetch is carried forward.
    const previous = [item({ fingerprint: 'i1', sourceHost: 'infoturia.com' })]
    const outcomes: FeedOutcome[] = [{ items: [], ok: true, owns: isInfoturia }]

    const { items, carriedForward } = mergeWithCarryForward(outcomes, previous)

    expect(carriedForward).toBe(0)
    expect(items).toEqual([])
  })

  it('keeps feed priority: a live higher-trust feed still wins the dedup', () => {
    // Same story (same fingerprint) from the official feed and Google News.
    // Official is passed first, so its attribution must survive.
    const outcomes: FeedOutcome[] = [
      {
        items: [item({ fingerprint: 'dup', official: true, source: 'Ayuntamiento' })],
        ok: true,
        owns: isOfficial,
      },
      {
        items: [item({ fingerprint: 'dup', source: 'Las Provincias' })],
        ok: true,
        owns: () => false,
      },
    ]

    const { items } = mergeWithCarryForward(outcomes, [])

    expect(items).toHaveLength(1)
    expect(items[0].source).toBe('Ayuntamiento')
  })

  it('carried-forward items still dedup against a live feed', () => {
    // The official feed is down, but Google News picked up the same story.
    // Carrying forward must not produce a duplicate row.
    const previous = [item({ fingerprint: 'dup', official: true, source: 'Ayuntamiento' })]
    const outcomes: FeedOutcome[] = [
      { items: [], ok: false, owns: isOfficial },
      {
        items: [item({ fingerprint: 'dup', source: 'Las Provincias' })],
        ok: true,
        owns: () => false,
      },
    ]

    const { items, carriedForward } = mergeWithCarryForward(outcomes, previous)

    expect(carriedForward).toBe(1)
    expect(items).toHaveLength(1)
    expect(items[0].source).toBe('Ayuntamiento')
  })

  it('tolerates a missing previous snapshot (first ever run)', () => {
    const outcomes: FeedOutcome[] = [{ items: [], ok: false, owns: isOfficial }]

    const { items, carriedForward } = mergeWithCarryForward(outcomes, [])

    expect(carriedForward).toBe(0)
    expect(items).toEqual([])
  })

  it('reproduces the 2026-07-30 incident: 50 official items survive the WAF block', () => {
    const previous = Array.from({ length: 50 }, (_, n) =>
      item({
        fingerprint: `off-${n}`,
        official: true,
        source: 'Ayuntamiento de Riba-roja de Túria',
      }),
    )
    const google = Array.from({ length: 100 }, (_, n) => item({ fingerprint: `g-${n}` }))

    const outcomes: FeedOutcome[] = [
      { items: [], ok: false, owns: isOfficial }, // WAF 403
      { items: google, ok: true, owns: () => false },
    ]

    const { items, carriedForward } = mergeWithCarryForward(outcomes, [...previous, ...google])

    expect(carriedForward).toBe(50)
    expect(items.filter((i) => i.official)).toHaveLength(50)
    expect(items).toHaveLength(150)
  })
})
