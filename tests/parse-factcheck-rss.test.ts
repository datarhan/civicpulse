/**
 * Maldita / Newtral RSS parser contract tests (Package 2C).
 *
 * The existing `parse-factcheck.test.ts` covers the Google API path
 * (ClaimReview JSON). This file pins the RSS-fallback path used when
 * a publisher doesn't emit ClaimReview structured data.
 */
import { describe, expect, it } from 'vitest'

import { mergeFactCheckRows, parseFactcheckRss, type FactCheckRow } from '../src/scraper/factcheck'

const mockMalditaXml = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>Maldita.es</title>
    <link>https://maldita.es</link>
    <item>
      <title>Bulo nacional sobre subsidios — sin relación con Valencia</title>
      <link>https://maldita.es/malditobulo/20260518/national-bulo/</link>
      <pubDate>Sun, 18 May 2026 09:00:00 +0200</pubDate>
      <description><![CDATA[Verificamos un bulo sobre subsidios estatales.]]></description>
      <category><![CDATA[Bulo]]></category>
      <category><![CDATA[Política]]></category>
    </item>
    <item>
      <title>Falso que el Ayuntamiento de Riba-roja haya cancelado el suministro de agua</title>
      <link>https://maldita.es/malditobulo/20260515/riba-roja-agua/</link>
      <pubDate>Thu, 15 May 2026 14:00:00 +0200</pubDate>
      <description><![CDATA[Una publicación viral afirma que el consistorio de Ribarroja ha suspendido…]]></description>
      <category><![CDATA[Falso]]></category>
      <category><![CDATA[Servicios públicos]]></category>
    </item>
    <item>
      <title>Engañoso: vídeo viralizado sobre obras en Ribarroja de Túria</title>
      <link>https://maldita.es/malditobulo/20260510/obras-video/</link>
      <pubDate>Sat, 10 May 2026 11:00:00 +0200</pubDate>
      <description><![CDATA[El vídeo es real pero corresponde a 2017, no a la DANA actual.]]></description>
      <category><![CDATA[Engañoso]]></category>
    </item>
  </channel>
</rss>`

describe('parseFactcheckRss', () => {
  it('keeps only items mentioning Riba-roja by default', () => {
    const rows = parseFactcheckRss(mockMalditaXml, {
      reviewerName: 'Maldita.es',
      reviewerSite: 'maldita.es',
    })
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.reviewUrl).sort()).toEqual([
      'https://maldita.es/malditobulo/20260510/obras-video/',
      'https://maldita.es/malditobulo/20260515/riba-roja-agua/',
    ])
  })

  it('returns all items when filterByMunicipio is false', () => {
    const rows = parseFactcheckRss(mockMalditaXml, {
      reviewerName: 'Maldita.es',
      reviewerSite: 'maldita.es',
      filterByMunicipio: false,
    })
    expect(rows).toHaveLength(3)
  })

  it('maps category tags onto a normalised verdict', () => {
    const rows = parseFactcheckRss(mockMalditaXml, {
      reviewerName: 'Maldita.es',
      reviewerSite: 'maldita.es',
    })
    const falso = rows.find((r) => r.reviewUrl.includes('riba-roja-agua'))
    expect(falso?.verdict).toBe('Falso')
    expect(falso?.normalizedVerdict).toBe('contradicho')

    const enganoso = rows.find((r) => r.reviewUrl.includes('obras-video'))
    expect(enganoso?.verdict).toBe('Falso') // "Engañoso" maps to the same bucket
    expect(enganoso?.normalizedVerdict).toBe('contradicho')
  })

  it('stamps reviewerName + reviewerSite from options', () => {
    const rows = parseFactcheckRss(mockMalditaXml, {
      reviewerName: 'Maldita.es',
      reviewerSite: 'maldita.es',
    })
    expect(rows[0].reviewerName).toBe('Maldita.es')
    expect(rows[0].reviewerSite).toBe('maldita.es')
    expect(rows[0].languageCode).toBe('es')
  })

  it('parses RFC-822 pubDate into ISO 8601', () => {
    const rows = parseFactcheckRss(mockMalditaXml, {
      reviewerName: 'Maldita.es',
      reviewerSite: 'maldita.es',
    })
    const falso = rows.find((r) => r.reviewUrl.includes('riba-roja-agua'))
    expect(falso?.reviewDate.startsWith('2026-05-15')).toBe(true)
  })

  it('falls back to "unknown" when no category maps cleanly', () => {
    const xml = `<rss><channel><item>
      <title>Algo confuso sobre Riba-roja</title>
      <link>https://example.com/raro</link>
      <pubDate>Mon, 01 Jan 2026 00:00:00 +0000</pubDate>
      <category><![CDATA[Curiosidades]]></category>
    </item></channel></rss>`
    const rows = parseFactcheckRss(xml, { reviewerName: 'Test', reviewerSite: 'example.com' })
    expect(rows).toHaveLength(1)
    expect(rows[0].verdict).toBe('')
    expect(rows[0].normalizedVerdict).toBe('unknown')
  })

  it('deduplicates by reviewUrl within a single feed', () => {
    const xml = `<rss><channel>
      <item>
        <title>Riba-roja noticia</title>
        <link>https://example.com/x</link>
        <pubDate>Mon, 01 Jan 2026 00:00:00 +0000</pubDate>
        <category>Falso</category>
      </item>
      <item>
        <title>Riba-roja noticia (dup)</title>
        <link>https://example.com/x</link>
        <pubDate>Mon, 01 Jan 2026 00:00:00 +0000</pubDate>
        <category>Falso</category>
      </item>
    </channel></rss>`
    const rows = parseFactcheckRss(xml, { reviewerName: 'X', reviewerSite: 'x' })
    expect(rows).toHaveLength(1)
  })

  it('sorts rows newest-first by reviewDate', () => {
    const rows = parseFactcheckRss(mockMalditaXml, {
      reviewerName: 'Maldita.es',
      reviewerSite: 'maldita.es',
    })
    expect(rows[0].reviewDate >= rows[1].reviewDate).toBe(true)
  })

  it('returns empty array on malformed XML', () => {
    expect(parseFactcheckRss('not xml', { reviewerName: 'X', reviewerSite: 'x' })).toEqual([])
    expect(parseFactcheckRss('', { reviewerName: 'X', reviewerSite: 'x' })).toEqual([])
  })
})

describe('mergeFactCheckRows', () => {
  it('deduplicates by reviewUrl across lists (first occurrence wins)', () => {
    const apiRow: FactCheckRow = {
      id: 'api-1',
      claim: 'API claim',
      claimant: null,
      claimDate: null,
      reviewerName: 'Newtral',
      reviewerSite: 'newtral.es',
      reviewTitle: 'API title',
      reviewUrl: 'https://www.newtral.es/x',
      reviewDate: '2026-05-15T10:00:00.000Z',
      verdict: 'Falso',
      normalizedVerdict: 'contradicho',
      languageCode: 'es',
    }
    const rssRow: FactCheckRow = { ...apiRow, id: 'rss-1', claim: 'RSS claim (dup)' }
    const merged = mergeFactCheckRows([apiRow], [rssRow])
    expect(merged).toHaveLength(1)
    expect(merged[0].claim).toBe('API claim')
  })

  it('preserves disjoint rows + sorts by reviewDate desc', () => {
    const a: FactCheckRow = {
      id: 'a',
      claim: 'A',
      claimant: null,
      claimDate: null,
      reviewerName: 'X',
      reviewerSite: 'x',
      reviewTitle: 'A',
      reviewUrl: 'https://x/a',
      reviewDate: '2026-04-01T00:00:00.000Z',
      verdict: '',
      normalizedVerdict: 'unknown',
      languageCode: 'es',
    }
    const b: FactCheckRow = {
      ...a,
      id: 'b',
      reviewUrl: 'https://x/b',
      reviewDate: '2026-05-01T00:00:00.000Z',
    }
    const merged = mergeFactCheckRows([a], [b])
    expect(merged).toHaveLength(2)
    expect(merged[0].id).toBe('b')
  })
})
