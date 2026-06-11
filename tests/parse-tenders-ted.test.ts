/**
 * TED v3 adapter contract tests (Package 2A).
 *
 * The CLI smoke-test against the live API confirmed the projection
 * works on real data (54 EU notices for Riba-roja). These tests
 * pin the contract on synthetic ApiResponse payloads so the parser
 * doesn't silently drift when the schema changes.
 */
import { describe, expect, it } from 'vitest'

import { asTenderRow, parseTedResponse, type TenderTedRow } from '../src/scraper/tenders-ted'
import { fetchTedNotices } from '../src/scraper/tenders-ted-fetch'

const samplePage = {
  notices: [
    {
      'publication-number': '00123456-2026',
      'notice-title': {
        spa: ['Suministro de luminarias LED Parque del Túria'],
        eng: ['Supply of LED lighting · Parque del Túria'],
      },
      'buyer-name': {
        spa: ['Ayuntamiento de Riba-Roja de Túria'],
      },
      'contract-nature': ['supplies'],
      'publication-date': '2026-04-24T08:00:00Z',
      'total-value': { amount: 185000.5, currency: 'EUR' },
      'classification-cpv': ['31527200-8'],
      links: {
        pdf: {
          SPA: 'https://ted.europa.eu/en/notice/00123456-2026/pdf',
        },
      },
    },
    {
      'publication-number': '00567890-2026',
      // No Spanish title — should fall back to English.
      'notice-title': { eng: ['Cleaning services framework agreement'] },
      'buyer-name': { eng: ['Riba-Roja City Council'] },
      'contract-nature': ['services'],
      'publication-date': '2026-03-12T07:00:00Z',
      'total-value': 92500,
    },
    {
      // No publication-number → should be skipped.
      'notice-title': { spa: ['Sin numero'] },
      'publication-date': '2026-02-01T00:00:00Z',
    },
  ],
}

describe('parseTedResponse', () => {
  it('projects TED notices into TenderTedRow with Spanish title preferred', () => {
    const rows = parseTedResponse([samplePage])
    expect(rows).toHaveLength(2)
    expect(rows[0].title).toBe('Suministro de luminarias LED Parque del Túria')
    expect(rows[0].buyerName).toBe('Ayuntamiento de Riba-Roja de Túria')
    expect(rows[0].totalValueEur).toBe(185000.5)
    expect(rows[0].pdfUrl).toBe('https://ted.europa.eu/en/notice/00123456-2026/pdf')
  })

  it('falls back to English when Spanish title is missing', () => {
    const rows = parseTedResponse([samplePage])
    const fallback = rows.find((r) => r.publicationNumber === '00567890-2026')
    expect(fallback?.title).toBe('Cleaning services framework agreement')
    expect(fallback?.buyerName).toBe('Riba-Roja City Council')
  })

  it('accepts a bare-number total-value', () => {
    const rows = parseTedResponse([samplePage])
    const bare = rows.find((r) => r.publicationNumber === '00567890-2026')
    expect(bare?.totalValueEur).toBe(92500)
    expect(bare?.currency).toBe('EUR')
  })

  it('skips notices without a publication-number', () => {
    const rows = parseTedResponse([samplePage])
    expect(rows.every((r) => r.publicationNumber !== '')).toBe(true)
  })

  it('deduplicates by publication-number across pages', () => {
    const dup = { ...samplePage }
    const rows = parseTedResponse([samplePage, dup])
    expect(rows).toHaveLength(2)
  })

  it('returns rows sorted newest-first by publicationDate', () => {
    const rows = parseTedResponse([samplePage])
    expect(rows[0].publicationDate >= rows[1].publicationDate).toBe(true)
  })

  it('returns empty array on an empty payload', () => {
    expect(parseTedResponse([])).toEqual([])
    expect(parseTedResponse([{ notices: [] }])).toEqual([])
  })

  it('uses null pdfUrl when no link is provided', () => {
    const rows = parseTedResponse([samplePage])
    const noPdf = rows.find((r) => r.publicationNumber === '00567890-2026')
    expect(noPdf?.pdfUrl).toBeNull()
  })
})

describe('asTenderRow', () => {
  it('projects a TenderTedRow onto the TenderRow-ish shape the verifier reads', () => {
    const ted: TenderTedRow = {
      id: 'abc123abc123',
      publicationNumber: '00123456-2026',
      title: 'Suministro luminarias',
      buyerName: 'Ayuntamiento de Riba-Roja',
      contractNature: ['supplies'],
      publicationDate: '2026-04-24T08:00:00.000Z',
      totalValueEur: 185000.5,
      currency: 'EUR',
      pdfUrl: 'https://ted.europa.eu/en/notice/00123456-2026/pdf',
      htmlUrl: 'https://ted.europa.eu/en/notice/00123456-2026',
    }
    const row = asTenderRow(ted)
    expect(row.title).toBe('Suministro luminarias')
    expect(row.contractor).toBe('Ayuntamiento de Riba-Roja')
    expect(row.award_amount_eur).toBe(185000.5)
    expect(row.status).toBe('TED')
    expect(row.date).toBe('2026-04-24')
    expect(row.permalink).toContain('ted.europa.eu')
  })
})

describe('fetchTedNotices (mocked)', () => {
  it('POSTs the expert-query payload and walks iterationNextToken', async () => {
    const calls: { body: unknown }[] = []
    const fetchImpl = async (_url: string, init?: RequestInit) => {
      calls.push({ body: init?.body ? JSON.parse(String(init.body)) : null })
      const page = calls.length
      return new Response(
        JSON.stringify({
          notices: [
            {
              'publication-number': `0000${page}-2026`,
              'notice-title': { spa: [`Aviso ${page}`] },
              'buyer-name': { spa: ['Ribarroja'] },
              'publication-date': `2026-0${page}-01T00:00:00Z`,
            },
          ],
          iterationNextToken: page < 2 ? `tok-${page}` : null,
        }),
        { status: 200 },
      ) as unknown as Response
    }
    const pages = await fetchTedNotices({
      query: 'buyer-name~"Riba-roja"',
      maxPages: 3,
      fetchImpl,
    })
    expect(pages).toHaveLength(2)
    expect(calls).toHaveLength(2)
    const body1 = calls[0].body as { query: string; fields: string[]; iterationNextToken?: string }
    expect(body1.query).toBe('buyer-name~"Riba-roja"')
    expect(body1.fields).toContain('publication-number')
    expect(body1.iterationNextToken).toBeUndefined()
    const body2 = calls[1].body as { iterationNextToken: string }
    expect(body2.iterationNextToken).toBe('tok-1')
  })

  it('throws with a descriptive error on non-2xx', async () => {
    const fetchImpl = async () =>
      new Response('rate limited', { status: 429 }) as unknown as Response
    await expect(
      fetchTedNotices({ query: 'buyer-name~"x"', maxPages: 1, fetchImpl }),
    ).rejects.toThrow(/TED API 429/)
  })
})
