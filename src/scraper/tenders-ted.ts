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

import { sha256Short } from './hash'

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
  /** True when the day is unknown and only the year could be recovered. */
  dateApproximate?: boolean
  /** Award amount in euros, when present on the notice. */
  totalValueEur: number | null
  currency: string
  /** Direct link to the Spanish PDF when available. */
  pdfUrl: string | null
  /** TED's HTML landing page for the notice. */
  htmlUrl: string
}

export interface ApiNotice {
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

export interface ApiResponse {
  notices?: ApiNotice[]
  totalNoticeCount?: number
  iterationNextToken?: string | null
}

// Shared impl — TED notice ids are stable keys across runs.
const sha256 = sha256Short

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

/**
 * TED publication numbers are "<sequence>-<year>", e.g. "66594-2018".
 * That year is the only date signal on most of this buyer's notices.
 */
export function yearFromPublicationNumber(pubNum: string | undefined): number | null {
  const m = /-(\d{4})$/.exec((pubNum ?? '').trim())
  if (!m) return null
  const y = Number(m[1])
  return y >= 1990 && y <= 2100 ? y : null
}

/**
 * Best available date for a notice.
 *
 * TED omits `publication-date` on most notices for this buyer — 54 of 56 real
 * rows — and the old fallback was `new Date(0)`, so the snapshot claimed every
 * one of them was published on 1 January 1970. That is worse than no date: it
 * sorts wrongly and reads as fact. Recover the year from the publication
 * number instead and mark it approximate, so a surface can say "2018" without
 * inventing a day.
 */
export function resolveTedDate(
  raw: string | undefined,
  pubNum: string | undefined,
): { date: string | null; approximate: boolean } {
  if (raw) {
    const d = new Date(raw)
    if (Number.isFinite(d.getTime()) && d.getTime() > 0) {
      return { date: d.toISOString(), approximate: false }
    }
  }
  const y = yearFromPublicationNumber(pubNum)
  if (y == null) return { date: null, approximate: true }
  return { date: `${y}-01-01T00:00:00.000Z`, approximate: true }
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
        n.links?.pdf?.SPA?.replace('/pdf', '/notice') ?? `https://ted.europa.eu/en/notice/${pubNum}`
      rows.push({
        id: sha256(pubNum),
        publicationNumber: pubNum,
        title,
        buyerName: buyer,
        contractNature: Array.isArray(n['contract-nature']) ? n['contract-nature'] : [],
        ...(() => {
          const r = resolveTedDate(n['publication-date'], pubNum)
          return { publicationDate: r.date ?? '', dateApproximate: r.approximate }
        })(),
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

// The paginated network fetcher lives in ./tenders-ted-fetch.ts — this
// module stays a pure parser (the architecture contract).

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
