/**
 * Google Fact Check Tools API adapter.
 *
 * Pulls the index of third-party fact-checks that touch Riba-roja
 * (Newtral, Maldita, EFE Verifica, AFP Factual, etc.). The API
 * returns W3C ClaimReview structured data; we normalise each
 * row + map the textual rating onto our own ClaimVerdict enum so
 * the lab can show external fact-checks side-by-side with internal
 * verifier verdicts.
 *
 * API: https://factchecktools.googleapis.com/v1alpha1/claims:search
 * Docs: https://developers.google.com/fact-check/tools/api
 * Auth: requires GOOGLE_FACT_CHECK_API_KEY env var. Free tier covers
 * our nightly volume comfortably.
 *
 * Graceful degradation: when the key is missing, the CLI writes an
 * empty snapshot (instead of throwing) so the lab page shows an
 * honest "no external fact-checks indexed" state without breaking
 * the nightly chain.
 */

import { createHash } from 'node:crypto'

import type { ClaimVerdict } from './claim-verifier'

export interface FactCheckRow {
  /** Stable id = sha256 of the review URL (first 12 chars). */
  id: string
  /** The claim text the fact-checker reviewed. */
  claim: string
  /** Who said it (often null when not specified). */
  claimant: string | null
  /** ISO date the claim was made (when reported), or null. */
  claimDate: string | null
  /** Publisher of the fact-check (e.g. "Newtral", "Maldita"). */
  reviewerName: string
  /** Host of the fact-checker's site, normalised (no www). */
  reviewerSite: string | null
  /** Headline of the fact-check article. */
  reviewTitle: string
  /** Absolute URL of the fact-check. */
  reviewUrl: string
  /** ISO date the fact-check was published. */
  reviewDate: string
  /** Verbatim textual rating from the fact-checker (e.g. "Falso", "Engañoso"). */
  verdict: string
  /** Our ClaimVerdict enum projection of the textual rating. */
  normalizedVerdict: ClaimVerdict | 'unknown'
  /** Language code from the API (es / ca / en / …). */
  languageCode: string
}

export interface FactCheckSnapshot {
  generatedAt: string
  source: {
    url: string
    query: string
    description: string
  }
  stats: {
    total: number
    reviewers: number
    byVerdict: Record<string, number>
  }
  items: FactCheckRow[]
}

// ─── Verdict normalisation ─────────────────────────────────────────────────

/**
 * Map a textual ClaimReview rating onto our internal ClaimVerdict enum.
 *
 * Fact-checkers use wildly varying wording. We normalise on the *intent*
 * the reader takes away — false / misleading / true / mixed — and fall
 * back to 'unknown' for edge cases (satire, "needs context", etc.) so
 * the curator can review.
 */
export function normalizeVerdict(textualRating: string): ClaimVerdict | 'unknown' {
  const r = textualRating.toLowerCase().trim()
  // Order matters: the "a medias" / "mostly" / "mixto" variants must be
  // matched BEFORE the broader engañoso / true / cierto branches, or
  // "engañoso a medias" would be misclassified as contradicho.
  if (
    /parcial|mostly\s+true|mostly\s+false|mixto|mitad|sólo\s+a\s+medias|a\s+medias|engañoso\s+a\s+medias/.test(
      r,
    )
  )
    return 'parcial'
  if (/sin\s+evidencia|sin\s+pruebas|insufficient|no\s+evidence|sin\s+contexto/.test(r))
    return 'sin-datos'
  if (
    /\bfalso\b|fake|false\b|engañoso|misleading|incorrecto|erróneo|bulo|desinforma/.test(r)
  )
    return 'contradicho'
  if (/\bverdader|true\b|cierto|correcto|confirmado|verified/.test(r)) return 'verificado'
  return 'unknown'
}

// ─── Parser (pure function for tests) ─────────────────────────────────────

interface ApiClaimReview {
  publisher?: { name?: string; site?: string }
  url?: string
  title?: string
  reviewDate?: string
  textualRating?: string
  languageCode?: string
}

interface ApiClaim {
  text?: string
  claimant?: string
  claimDate?: string
  claimReview?: ApiClaimReview[]
}

interface ApiResponse {
  claims?: ApiClaim[]
  nextPageToken?: string
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 12)
}

function extractHost(url: string): string | null {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return null
  }
}

function safeDate(raw: string | undefined | null): string {
  if (!raw) return new Date(0).toISOString()
  const d = new Date(raw)
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date(0).toISOString()
}

/**
 * Parse a single ApiResponse page (or an array of pages already
 * merged) into FactCheckRow[]. Deduplicated by review URL.
 */
export function parseFactCheckResponse(pages: ApiResponse[]): FactCheckRow[] {
  const seen = new Set<string>()
  const rows: FactCheckRow[] = []
  for (const page of pages) {
    for (const c of page.claims ?? []) {
      const claimText = (c.text ?? '').trim()
      for (const r of c.claimReview ?? []) {
        const url = r.url
        if (!url) continue
        if (seen.has(url)) continue
        seen.add(url)
        const verdict = (r.textualRating ?? '').trim()
        rows.push({
          id: sha256(url),
          claim: claimText,
          claimant: (c.claimant ?? '').trim() || null,
          claimDate: c.claimDate ? safeDate(c.claimDate) : null,
          reviewerName: (r.publisher?.name ?? '').trim() || 'Desconocido',
          reviewerSite: r.publisher?.site ? extractHost(r.publisher.site) : extractHost(url),
          reviewTitle: (r.title ?? '').trim() || claimText.slice(0, 80),
          reviewUrl: url,
          reviewDate: safeDate(r.reviewDate),
          verdict,
          normalizedVerdict: normalizeVerdict(verdict),
          languageCode: r.languageCode ?? 'und',
        })
      }
    }
  }
  rows.sort((a, b) => b.reviewDate.localeCompare(a.reviewDate))
  return rows
}

// ─── Matcher: link FactCheckRow to a press claim ────────────────────────

function tokenise(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9 ]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 4),
  )
}

export interface MatchInput {
  claimVerbatim: string
  articleUrl?: string
}

export interface MatchedFactCheck {
  row: FactCheckRow
  /** 0..1 overlap of significant tokens (Jaccard). */
  score: number
  /** Why we kept this match (audit trail). */
  reason: 'url' | 'token-overlap'
}

/**
 * Find published fact-checks that match a press claim by token
 * overlap (≥3 shared significant tokens, jaccard ≥ minScore).
 * Returns the top 3 by score.
 */
export function matchFactChecks(
  input: MatchInput,
  factchecks: FactCheckRow[],
  opts: { minOverlap?: number; minScore?: number } = {},
): MatchedFactCheck[] {
  const minOverlap = opts.minOverlap ?? 3
  const minScore = opts.minScore ?? 0.15

  const claimTokens = tokenise(input.claimVerbatim)
  const matches: MatchedFactCheck[] = []

  for (const row of factchecks) {
    const reviewTokens = tokenise(`${row.claim} ${row.reviewTitle}`)
    const intersection = new Set([...claimTokens].filter((t) => reviewTokens.has(t)))
    const union = new Set([...claimTokens, ...reviewTokens])
    const score = union.size === 0 ? 0 : intersection.size / union.size
    if (intersection.size >= minOverlap && score >= minScore) {
      matches.push({ row, score: Math.round(score * 1000) / 1000, reason: 'token-overlap' })
    }
  }

  matches.sort((a, b) => b.score - a.score)
  return matches.slice(0, 3)
}

// ─── Fetcher (CLI uses this) ──────────────────────────────────────────────

const API_BASE = 'https://factchecktools.googleapis.com/v1alpha1/claims:search'

export interface FetchOptions {
  apiKey: string
  query: string
  languageCode?: string
  pageSize?: number
  maxPages?: number
  fetchImpl?: typeof fetch
}

/**
 * Paginated fetch of the Fact Check Tools API. Throws on persistent
 * non-OK responses so the nightly chain logs the error; the CLI
 * wraps that throw with a graceful fallback when no key is set.
 */
export async function fetchFactChecks(opts: FetchOptions): Promise<ApiResponse[]> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const pages: ApiResponse[] = []
  let pageToken: string | null = null
  let pageCount = 0
  const maxPages = opts.maxPages ?? 5

  while (pageCount < maxPages) {
    const params = new URLSearchParams({
      query: opts.query,
      languageCode: opts.languageCode ?? 'es',
      pageSize: String(opts.pageSize ?? 50),
      key: opts.apiKey,
    })
    if (pageToken) params.set('pageToken', pageToken)
    const url = `${API_BASE}?${params}`
    const res = await fetchImpl(url, {
      headers: {
        'User-Agent':
          'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) civic-tech ingestion',
        Accept: 'application/json',
      },
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Fact Check API ${res.status}: ${body.slice(0, 240)}`)
    }
    const json = (await res.json()) as ApiResponse
    pages.push(json)
    pageToken = json.nextPageToken ?? null
    pageCount += 1
    if (!pageToken) break
  }
  return pages
}
