/**
 * TED (Tenders Electronic Daily) adapter — EU procurement.
 *
 * Pulls contract notices from https://api.ted.europa.eu/v3 where the
 * buyer's name contains "Riba-roja". TED indexes contracts above the
 * EU threshold (~€143k for supplies/services in 2026); it catches
 * DANA recovery + NextGenerationEU spending that PLACSP either
 * publishes late or routes through national funding lines.
 *
 * The API is free (no auth, no key). POST endpoint accepting an
 * "expert query" syntax: `field~"value"` for text contains.
 *
 * We project this into the same `TenderRow`-ish shape the existing
 * verifier already understands, so it can be merged with tenders.json
 * via [...local.contracts, ...ted.items] in the verifier inputs.
 */

import { createHash } from 'node:crypto'

const API_URL = 'https://api.ted.europa.eu/v3/notices/search'
const UA = 'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) civic-tech ingestion'

const REQUESTED_FIELDS = [
  'publication-number',
  'notice-title',
  'total-value',
  'contract-nature',
  'buyer-name',
  'publication-date',
  'place-of-performance',
  'classification-cpv',
  'links',
] as const

export interface TenderTedRow {
  /** sha256(publicationNumber) — first 12 chars, stable across runs. */
  id: string
  publicationNumber: string
  /** Best-effort title (Spanish > first non-MUL > placeholder). */
  title: string
  /** Buyer organisation (mostly "Ayuntamiento de Riba-Roja de Túria"). */
  buyerName: string
  /** ['services'] | ['supplies'] | ['works'] (sometimes multiple). */
  contractNature: string[]
  /** ISO publication date. */
  publicationDate: string
  /** Award amount in euros, when present on the notice. */
  totalValueEur: number | null
  currency: string
  /** Direct link to the Spanish PDF when available. */
  pdfUrl: string | null
  /** TED's HTML landing page for the notice. */
  htmlUrl: string
}

interface ApiNotice {
  'publication-number'?: string
  'notice-title'?: Record<string, string[]>
  'total-value'?: { amount?: number; currency?: string } | number
  'contract-nature'?: string[]
  'buyer-name'?: Record<string, string[]>
  'publication-date'?: string
  'place-of-performance'?: unknown
  'classification-cpv'?: string[]
  links?: { pdf?: Record<string, string>; xml?: Record<string, string> }
}

interface ApiResponse {
  notices?: ApiNotice[]
  totalNoticeCount?: number
  iterationNextToken?: string | null
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 12)
}

function pickLang(map: Record<string, string[]> | undefined, langs: string[]): string {
  if (!map) return ''
  for (const lang of langs) {
    const v = map[lang]
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'string') return v[0]
  }
  for (const v of Object.values(map)) {
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'string') return v[0]
  }
  return ''
}

function safeDate(raw: string | undefined): string {
  if (!raw) return new Date(0).toISOString()
  const d = new Date(raw)
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date(0).toISOString()
}

function projectAmount(v: ApiNotice['total-value']): { amount: number | null; currency: string } {
  if (v == null) return { amount: null, currency: 'EUR' }
  if (typeof v === 'number') return { amount: v, currency: 'EUR' }
  if (typeof v === 'object') {
    const amount = typeof v.amount === 'number' ? v.amount : null
    const currency = v.currency || 'EUR'
    return { amount, currency }
  }
  return { amount: null, currency: 'EUR' }
}

/**
 * Pure parser — takes already-fetched ApiResponse pages, returns
 * normalised + deduplicated rows. Sorted newest-first.
 */
export function parseTedResponse(pages: ApiResponse[]): TenderTedRow[] {
  const seen = new Set<string>()
  const rows: TenderTedRow[] = []
  for (const page of pages) {
    for (const n of page.notices ?? []) {
      const pubNum = (n['publication-number'] ?? '').trim()
      if (!pubNum || seen.has(pubNum)) continue
      seen.add(pubNum)
      const title =
        pickLang(n['notice-title'], ['spa', 'eng', 'ENG', 'SPA']) || `Anuncio TED ${pubNum}`
      const buyer = pickLang(n['buyer-name'], ['spa', 'eng', 'ENG', 'SPA']) || 'Desconocido'
      const { amount, currency } = projectAmount(n['total-value'])
      const pdfUrl = n.links?.pdf?.SPA ?? n.links?.pdf?.ENG ?? null
      const htmlUrl =
        n.links?.pdf?.SPA?.replace('/pdf', '/notice') ??
        `https://ted.europa.eu/en/notice/${pubNum}`
      rows.push({
        id: sha256(pubNum),
        publicationNumber: pubNum,
        title,
        buyerName: buyer,
        contractNature: Array.isArray(n['contract-nature']) ? n['contract-nature'] : [],
        publicationDate: safeDate(n['publication-date']),
        totalValueEur: currency === 'EUR' ? amount : null,
        currency,
        pdfUrl,
        htmlUrl,
      })
    }
  }
  rows.sort((a, b) => b.publicationDate.localeCompare(a.publicationDate))
  return rows
}

// ─── Fetcher ───────────────────────────────────────────────────────────────

export interface FetchOptions {
  query?: string
  limit?: number
  maxPages?: number
  fetchImpl?: typeof fetch
}

/**
 * Paginated POST to TED's expert search. Default query targets buyers
 * whose name contains "Riba-roja".
 */
export async function fetchTedNotices(opts: FetchOptions = {}): Promise<ApiResponse[]> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const query = opts.query ?? 'buyer-name~"Riba-roja"'
  const limit = opts.limit ?? 100
  const maxPages = opts.maxPages ?? 3
  const pages: ApiResponse[] = []
  let iterationNextToken: string | null = null
  let pageCount = 0
  while (pageCount < maxPages) {
    const body: Record<string, unknown> = {
      query,
      fields: REQUESTED_FIELDS as unknown as string[],
      limit,
    }
    if (iterationNextToken) body.iterationNextToken = iterationNextToken
    const res = await fetchImpl(API_URL, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`TED API ${res.status} on page ${pageCount + 1}: ${text.slice(0, 200)}`)
    }
    const json = (await res.json()) as ApiResponse
    pages.push(json)
    iterationNextToken = json.iterationNextToken ?? null
    pageCount += 1
    if (!iterationNextToken) break
  }
  return pages
}

// ─── Verifier projection ──────────────────────────────────────────────────

/**
 * Project a TED row into the same shape `tenders.json:contracts[]` uses,
 * so the existing claim-verifier can consume TED rows without code
 * changes downstream.
 */
export function asTenderRow(row: TenderTedRow): {
  permalink: string
  title: string
  contractor: string
  award_amount_eur: number | null
  status: string
  date: string
} {
  return {
    permalink: row.htmlUrl,
    title: row.title,
    contractor: row.buyerName,
    award_amount_eur: row.totalValueEur,
    status: 'TED', // origin tag; verifier displays as snippet
    date: row.publicationDate.slice(0, 10),
  }
}

export interface TenderTedSnapshot {
  generatedAt: string
  source: { url: string; query: string; description: string }
  stats: {
    total: number
    byContractNature: Record<string, number>
  }
  items: TenderTedRow[]
}
