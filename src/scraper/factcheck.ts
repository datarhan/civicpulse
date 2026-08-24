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
  /** Qué se consultó y qué le pasó a cada fuente. Sin esto, un cero es mudo. */
  consulta?: { intentos: IntentoFuente[] }
  stats: {
    total: number
    reviewers: number
    byVerdict: Record<string, number>
    fuentesConsultadas?: number
    fuentesCaidas?: number
    /** Revisiones que devolvieron las fuentes ANTES del filtro de municipio. */
    revisionesExaminadas?: number
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
  if (/\bfalso\b|fake|false\b|engañoso|misleading|incorrecto|erróneo|bulo|desinforma/.test(r))
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
        // The API is queried with "Riba-roja de Túria" but matches fuzzily and
        // returns dam stories; it never had a municipality filter of its own.
        const haystack = `${claimText} ${r.title ?? ''}`
        if (!mentionsRibaRojaDeTuria(haystack)) continue
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

// ─── RSS parser (direct publisher feeds: Maldita, Newtral) ──────────────
//
// The Google Fact Check Tools API indexes ClaimReview structured data, but
// Maldita + Newtral don't always emit ClaimReview JSON-LD — they often
// publish the same articles through their RSS feeds with a category tag
// that maps to a verdict ("Falso", "Engañoso", "Fakes", …). Parsing the
// RSS gives us a fallback path so we're not 100% dependent on the API.

const TOWN_RE = /\b(riba[\s-]?roja|ribarroja|ribaroja)\b/i
/**
 * The disambiguator. "Riba-roja" alone is also the Ebro-river dam in
 * Aragón/Catalunya, and Spanish fact-checkers write about that dam far more
 * often than about this town of 24,600.
 */
const TURIA_RE = /\bt[uú]ria\b/i

/**
 * Is this fact-check about Riba-roja de Túria specifically?
 *
 * Requires BOTH the town name and the Túria/Turia qualifier, the same rule
 * `ctbg.ts` already applies via RIBA_ROJA_ALIASES. Without it the snapshot's
 * single published item was a Maldita.es debunk of a DANA chain letter about
 * the **embalse de Forata** and the Júcar-basin dams — a different province,
 * a different river, and no connection to this municipality, rendered on
 * /laboratorio as a red "Bulo" pill under the heading "Observatorio de medios ·
 * Riba-roja de Túria". Deliberately strict: a fact-check that never names the
 * town in full is not confidently about the town, and a false attribution to a
 * named outlet is worse than an empty widget.
 */
export function mentionsRibaRojaDeTuria(text: string): boolean {
  return TOWN_RE.test(text) && TURIA_RE.test(text)
}

function pickTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')
  const m = xml.match(re)
  if (!m) return null
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() || null
}

function pickAllTags(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi')
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const value = m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim()
    if (value) out.push(value)
  }
  return out
}

function extractRssItems(xml: string): string[] {
  const out: string[] = []
  const re = /<item[\s\S]*?<\/item>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) out.push(m[0])
  return out
}

/**
 * Heuristic: map an RSS feed's category list to one of our normalised
 * verdict buckets. Maldita uses "Bulo", "Falso", "Engañoso"; Newtral
 * uses "Fakes", "Datos", "Zona de verificación". When nothing maps,
 * normalizeVerdict() will land on 'unknown' and the curator can
 * inspect manually.
 */
function categoriesToVerdict(categories: string[]): string {
  for (const cat of categories) {
    const c = cat.toLowerCase()
    if (/\bbulo\b|\bfake|\bfalso\b|enganos|engaños/.test(c)) return 'Falso'
    if (/\bverdad|veracidad|cierto/.test(c)) return 'Verdadero'
    if (/a\s+medias|engañoso\s+a\s+medias|sólo\s+a\s+medias|mostly/.test(c)) return 'A medias'
    if (/sin\s+contexto|sin\s+evidencia|insufficient/.test(c)) return 'Sin contexto'
  }
  return ''
}

export interface ParseFactcheckRssOptions {
  /** Publisher name stamped on every row (e.g. "Maldita.es", "Newtral"). */
  reviewerName: string
  /** Host string (e.g. "maldita.es"). */
  reviewerSite: string
  /** Skip items whose title + description don't mention Riba-roja. Default true. */
  filterByMunicipio?: boolean
}

/**
 * Parse a publisher-direct RSS 2.0 feed (Maldita or Newtral) and
 * project items onto FactCheckRow. By default only items whose title
 * or description mention Riba-roja are kept — the publisher feeds
 * cover everything they fact-check nationally and we don't want
 * the noise.
 */
export function parseFactcheckRss(xml: string, opts: ParseFactcheckRssOptions): FactCheckRow[] {
  const items = extractRssItems(xml)
  const rows: FactCheckRow[] = []
  const seen = new Set<string>()
  const filter = opts.filterByMunicipio !== false
  for (const item of items) {
    const title = pickTag(item, 'title') ?? ''
    const link = pickTag(item, 'link') ?? ''
    const description = pickTag(item, 'description') ?? ''
    const pubDate = pickTag(item, 'pubDate') ?? pickTag(item, 'dc:date') ?? null
    if (!title || !link) continue
    if (seen.has(link)) continue
    seen.add(link)
    const haystack = `${title} ${description}`
    if (filter && !mentionsRibaRojaDeTuria(haystack)) continue
    const categories = pickAllTags(item, 'category')
    const verdict = categoriesToVerdict(categories)
    rows.push({
      id: sha256(link),
      claim: title,
      claimant: null,
      claimDate: null,
      reviewerName: opts.reviewerName,
      reviewerSite: opts.reviewerSite,
      reviewTitle: title,
      reviewUrl: link,
      reviewDate: safeDate(pubDate),
      verdict,
      normalizedVerdict: verdict ? normalizeVerdict(verdict) : 'unknown',
      languageCode: 'es',
    })
  }
  rows.sort((a, b) => b.reviewDate.localeCompare(a.reviewDate))
  return rows
}

/**
 * Merge multiple FactCheckRow lists, deduping by reviewUrl. The first
 * occurrence wins — pass the higher-trust list first (typically the
 * Google API result before RSS supplements).
 */
export function mergeFactCheckRows(...lists: FactCheckRow[][]): FactCheckRow[] {
  const seen = new Set<string>()
  const out: FactCheckRow[] = []
  for (const list of lists) {
    for (const row of list) {
      if (seen.has(row.reviewUrl)) continue
      seen.add(row.reviewUrl)
      out.push(row)
    }
  }
  out.sort((a, b) => b.reviewDate.localeCompare(a.reviewDate))
  return out
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

// ─── Procedencia de la consulta ─────────────────────────────────────────────

/**
 * Qué le pasó a cada fuente en una pasada.
 *
 * Existe porque el snapshot mentía sobre sí mismo. La `description` se derivaba
 * del RECUENTO DE FILAS:
 *
 *   apiRows.length > 0 ? 'Google Fact Check Tools API' : null
 *
 * así que una llamada que funcionaba con su clave y devolvía legítimamente cero
 * resultados se describía a sí misma como «No sources active (API key missing
 * AND RSS feeds returned nothing)». El inverso exacto del defecto de
 * `r?.findings ?? []`: en vez de un fallo imprimiendo un todo-claro, una
 * comprobación limpia imprimiendo un fallo.
 *
 * Costó dos informes equivocados: se dio por hecho que la clave no estaba
 * puesta —estaba, y funciona— porque el fichero lo decía.
 *
 * Lo que hay que separar, que es la regla 2 de DATA_INTEGRITY: consultada ·
 * examinadas · aceptadas · no consultada CON SU MOTIVO. Un cero de «miré y no
 * hay» y un cero de «no pude mirar» no son el mismo cero.
 */
export type EstadoFuente = 'consultada' | 'sin-credencial' | 'error'

export interface IntentoFuente {
  fuente: string
  estado: EstadoFuente
  /** Revisiones que devolvió la fuente, ANTES del filtro de municipio. */
  examinadas: number
  /** Las que nombran Riba-roja de Túria con su desambiguador. */
  aceptadas: number
  /** Por qué no se consultó, o qué falló. Obligatorio si el estado no es `consultada`. */
  motivo?: string
}

/**
 * La frase que va en el snapshot, derivada de lo que PASÓ y no de lo que salió.
 *
 * Distingue los tres ceros que antes se confundían en uno.
 */
export function describirConsulta(intentos: readonly IntentoFuente[]): string {
  if (intentos.length === 0) return 'Ninguna fuente declarada — la pasada no registró qué consultó'

  const consultadas = intentos.filter((i) => i.estado === 'consultada')
  const caidas = intentos.filter((i) => i.estado !== 'consultada')
  const aceptadas = intentos.reduce((n, i) => n + i.aceptadas, 0)
  const examinadas = intentos.reduce((n, i) => n + i.examinadas, 0)

  const partes: string[] = []
  if (consultadas.length > 0) {
    partes.push(
      `Consultadas ${consultadas.length} de ${intentos.length} fuentes ` +
        `(${consultadas.map((i) => i.fuente).join(', ')})`,
    )
    partes.push(
      aceptadas > 0
        ? `${examinadas} revisión(es) examinada(s), ${aceptadas} sobre Riba-roja de Túria`
        : examinadas > 0
          ? `${examinadas} revisión(es) examinada(s), ninguna nombra Riba-roja de Túria ` +
            `(la consulta arrastra el embalse de Riba-roja del Ebro, que es otro sitio)`
          : 'ninguna revisión devuelta',
    )
  }
  for (const i of caidas) {
    partes.push(`${i.fuente}: NO consultada — ${i.motivo ?? 'sin motivo registrado'}`)
  }
  return partes.join(' · ')
}

/** ¿Se consultó de verdad alguna fuente? Un cero sin esto no es un cero honesto. */
export function seConsultoAlgo(intentos: readonly IntentoFuente[]): boolean {
  return intentos.some((i) => i.estado === 'consultada')
}
