/**
 * Research tools the journalist agent calls during Stage 2 of its pipeline.
 *
 * Every tool here is a small pure-ish function:
 *   · deterministic given (input, on-disk snapshots, network state)
 *   · returns a compact JSON payload suitable for inclusion in an LLM
 *     prompt without flooding the context window
 *   · wraps network calls in a research cache at
 *       .research-cache/<sha256(toolname+args)>.json
 *     so re-running the agent does not re-hit Wikipedia or Exa for the
 *     same query within a session.
 *
 * No tool here writes to public/data/* — that's reserved for the
 * curator-promoted reports file. These helpers feed the LLM and the
 * citation builder; the agent then assembles SourceCitation rows from
 * whatever the tools return.
 *
 * Politeness:
 *   · Every outbound request carries a CivicPulse User-Agent
 *   · Wikipedia + Wikidata are throttled to ≥1 req / 500 ms
 *   · Exa web search costs real money; capped at 8 results per query
 *   · Wayback look-ups never trigger Save-Page-Now from this module;
 *     callers go through audit() for explicit archival decisions
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { archiveOnWayback, findExistingSnapshot } from './wayback'
import type { CitationKind, CitationTrust, SourceCitation } from './journalist'

// ─── Cache layer ───────────────────────────────────────────────────────────

const CACHE_DIR = resolve('.research-cache')
const UA = 'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) journalist-agent research'

interface CacheEntry<T> {
  fetchedAt: string
  payload: T
}

function cacheKey(name: string, args: unknown): string {
  return createHash('sha256').update(JSON.stringify({ name, args })).digest('hex')
}

function readCache<T>(key: string): T | null {
  const path = join(CACHE_DIR, `${key}.json`)
  if (!existsSync(path)) return null
  try {
    const raw = readFileSync(path, 'utf8')
    return (JSON.parse(raw) as CacheEntry<T>).payload
  } catch {
    return null
  }
}

function writeCacheEntry<T>(key: string, payload: T): void {
  mkdirSync(CACHE_DIR, { recursive: true })
  const entry: CacheEntry<T> = { fetchedAt: new Date().toISOString(), payload }
  writeFileSync(join(CACHE_DIR, `${key}.json`), JSON.stringify(entry))
}

async function cached<T>(name: string, args: unknown, run: () => Promise<T>): Promise<T> {
  const key = cacheKey(name, args)
  const hit = readCache<T>(key)
  if (hit !== null) return hit
  const result = await run()
  writeCacheEntry(key, result)
  return result
}

// ─── Common helpers ────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString()
}

function readJsonSnapshot<T>(localPath: string): T | null {
  const abs = resolve(localPath)
  if (!existsSync(abs)) return null
  try {
    return JSON.parse(readFileSync(abs, 'utf8')) as T
  } catch {
    return null
  }
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function tokenize(s: string): string[] {
  return normalize(s)
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length >= 2)
}

function matchesAnyToken(haystack: string, needleTokens: string[]): boolean {
  if (needleTokens.length === 0) return false
  const norm = normalize(haystack)
  return needleTokens.some((t) => norm.includes(t))
}

// ─── Local-snapshot tools ──────────────────────────────────────────────────

export interface LocalHit<T = unknown> {
  localPath: string
  matchedField: string
  preview: string
  row: T
}

const DEFAULT_LOCAL_FILES = [
  'public/data/officials.json',
  'public/data/press.json',
  'public/data/pleno-claims-suggestions.json',
  'public/data/pleno-claims-verified.json',
  'public/data/promises.json',
  'public/data/plenos.json',
  'public/data/plenos-agendas.json',
  'public/data/bdns.json',
  'public/data/tenders.json',
  'public/data/wikidata.json',
] as const

/**
 * Grep a list of `public/data/*.json` snapshots for a query string and
 * return up to N matching rows per file. Pure local — no network. Used
 * by the agent's Stage-2 to bootstrap its knowledge before reaching
 * outside.
 */
export function searchLocalSnapshots(
  query: string,
  opts: { files?: readonly string[]; perFileLimit?: number } = {},
): LocalHit[] {
  const files = opts.files ?? DEFAULT_LOCAL_FILES
  const perFile = opts.perFileLimit ?? 6
  const needleTokens = tokenize(query)
  if (needleTokens.length === 0) return []
  const hits: LocalHit[] = []
  for (const f of files) {
    const data = readJsonSnapshot<Record<string, unknown>>(f)
    if (!data) continue
    const arrays = candidateArrays(data)
    for (const [arrName, arr] of arrays) {
      let kept = 0
      for (const row of arr) {
        if (kept >= perFile) break
        const flat = flattenForSearch(row)
        if (matchesAnyToken(flat, needleTokens)) {
          hits.push({
            localPath: f,
            matchedField: arrName,
            preview: flat.slice(0, 240),
            row,
          })
          kept += 1
        }
      }
    }
  }
  return hits
}

function candidateArrays(obj: Record<string, unknown>): Array<[string, unknown[]]> {
  const out: Array<[string, unknown[]]> = []
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) out.push([k, v as unknown[]])
  }
  return out
}

function flattenForSearch(row: unknown, depth = 0): string {
  if (row === null || row === undefined) return ''
  if (typeof row === 'string') return row
  if (typeof row === 'number' || typeof row === 'boolean') return String(row)
  if (depth > 3) return ''
  if (Array.isArray(row)) return row.map((r) => flattenForSearch(r, depth + 1)).join(' · ')
  if (typeof row === 'object') {
    return Object.values(row as Record<string, unknown>)
      .map((v) => flattenForSearch(v, depth + 1))
      .join(' · ')
  }
  return ''
}

export interface OfficialRow {
  slug: string
  name: string
  honorific?: string
  role: string
  party: string
  portfolios: string[]
  email?: string
  photoUrl?: string
  cvUrl?: string
}

export function fetchOfficialBySlug(slug: string): OfficialRow | null {
  const data = readJsonSnapshot<{ officials?: OfficialRow[] }>('public/data/officials.json')
  if (!data?.officials) return null
  return data.officials.find((o) => o.slug === slug) ?? null
}

export interface PressHit {
  title: string
  source: string
  publishedAt: string
  url: string
  summary?: string
}

export function fetchPressForSubject(name: string, limit = 20): PressHit[] {
  const data = readJsonSnapshot<{ items?: Array<Record<string, unknown>> }>(
    'public/data/press.json',
  )
  if (!data?.items) return []
  const tokens = tokenize(name)
  const hits: PressHit[] = []
  for (const it of data.items) {
    if (hits.length >= limit) break
    const title = (it.title as string) ?? ''
    if (!matchesAnyToken(title, tokens)) continue
    // press.json canonical schema (from src/scraper/press.ts) uses
    // `link` + `date` (ISO datetime). Older test fixtures used
    // `url` + `publishedAt`; we read both defensively so the tool
    // keeps working across schema bumps.
    const url = ((it.url as string) || (it.link as string) || '').trim()
    const rawDate = (it.publishedAt as string) || (it.date as string) || ''
    hits.push({
      title,
      source: (it.source as string) ?? '',
      publishedAt: rawDate.slice(0, 10),
      url,
      summary: (it.summary as string) ?? undefined,
    })
  }
  return hits
}

export interface PlenoClaimHit {
  id: string
  plenoId?: string
  plenoDate?: string
  verbatim: string
  type: string
  topic: string
  speakerGroup: string | null
}

export function fetchPlenoClaimsForSubject(name: string, limit = 15): PlenoClaimHit[] {
  const suggestions = readJsonSnapshot<{
    items?: Array<Record<string, unknown>>
  }>('public/data/pleno-claims-suggestions.json')
  if (!suggestions?.items) return []
  const tokens = tokenize(name)
  const hits: PlenoClaimHit[] = []
  for (const it of suggestions.items) {
    if (hits.length >= limit) break
    const verbatim = (it.verbatim as string) ?? ''
    const context = (it.context as string) ?? ''
    if (!matchesAnyToken(verbatim + ' ' + context, tokens)) continue
    hits.push({
      id: (it.id as string) ?? '',
      plenoId: (it.plenoId as string) ?? undefined,
      plenoDate: (it.plenoDate as string) ?? undefined,
      verbatim,
      type: (it.type as string) ?? 'unknown',
      topic: (it.topic as string) ?? 'other',
      speakerGroup: (it.speakerGroup as string) ?? null,
    })
  }
  return hits
}

export interface PromiseHit {
  id: string
  title: string
  party: string
  topic: string
  status: string
  quote: string
  madeAt: string
}

export function fetchPromisesForParty(party: string, limit = 25): PromiseHit[] {
  const data = readJsonSnapshot<{ items?: Array<Record<string, unknown>> }>(
    'public/data/promises.json',
  )
  if (!data?.items) return []
  const hits: PromiseHit[] = []
  for (const it of data.items) {
    if (hits.length >= limit) break
    if ((it.party as string)?.toLowerCase() !== party.toLowerCase()) continue
    hits.push({
      id: (it.id as string) ?? '',
      title: (it.title as string) ?? '',
      party: (it.party as string) ?? '',
      topic: (it.topic as string) ?? 'other',
      status: (it.status as string) ?? 'documentada',
      quote: (it.quote as string) ?? '',
      madeAt: (it.madeAt as string) ?? '',
    })
  }
  return hits
}

// ─── External whitelist tools (cached) ─────────────────────────────────────

let lastWikiCall = 0
async function throttleWiki(): Promise<void> {
  const elapsed = Date.now() - lastWikiCall
  if (elapsed < 500) await new Promise((r) => setTimeout(r, 500 - elapsed))
  lastWikiCall = Date.now()
}

export interface WikidataPayload {
  qid: string
  labels: Record<string, string>
  descriptions: Record<string, string>
  claims: Record<string, string[]>
  sitelinks: Record<string, string>
  url: string
}

export async function fetchWikidata(qid: string): Promise<WikidataPayload | null> {
  return cached('wikidata', { qid }, async () => {
    await throttleWiki()
    const url = `https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(qid)}.json`
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
      if (!res.ok) return null
      const json = (await res.json()) as {
        entities?: Record<
          string,
          {
            labels?: Record<string, { value: string }>
            descriptions?: Record<string, { value: string }>
            claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>>
            sitelinks?: Record<string, { url?: string; title?: string }>
          }
        >
      }
      const ent = json.entities?.[qid]
      if (!ent) return null
      const labels: Record<string, string> = {}
      for (const [lang, v] of Object.entries(ent.labels ?? {})) labels[lang] = v.value
      const descriptions: Record<string, string> = {}
      for (const [lang, v] of Object.entries(ent.descriptions ?? {})) descriptions[lang] = v.value
      const claims: Record<string, string[]> = {}
      for (const [prop, arr] of Object.entries(ent.claims ?? {})) {
        const vals: string[] = []
        for (const c of arr) {
          const v = c.mainsnak?.datavalue?.value
          if (v == null) continue
          if (typeof v === 'string' || typeof v === 'number') vals.push(String(v))
          else if (typeof v === 'object') vals.push(JSON.stringify(v).slice(0, 240))
        }
        if (vals.length > 0) claims[prop] = vals.slice(0, 6)
      }
      const sitelinks: Record<string, string> = {}
      for (const [k, v] of Object.entries(ent.sitelinks ?? {})) {
        if (v.url) sitelinks[k] = v.url
      }
      return {
        qid,
        labels,
        descriptions,
        claims,
        sitelinks,
        url: `https://www.wikidata.org/wiki/${qid}`,
      }
    } catch {
      return null
    }
  })
}

export interface WikipediaSummary {
  lang: string
  title: string
  url: string
  description?: string
  extract?: string
}

export async function fetchWikipedia(
  title: string,
  lang: 'es' | 'ca' | 'en' = 'es',
): Promise<WikipediaSummary | null> {
  return cached('wikipedia', { title, lang }, async () => {
    await throttleWiki()
    const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
      if (!res.ok) return null
      const json = (await res.json()) as {
        title?: string
        description?: string
        extract?: string
        content_urls?: { desktop?: { page?: string } }
      }
      return {
        lang,
        title: json.title ?? title,
        url: json.content_urls?.desktop?.page ?? `https://${lang}.wikipedia.org/wiki/${title}`,
        description: json.description,
        extract: json.extract,
      }
    } catch {
      return null
    }
  })
}

export interface UrlFetchResult {
  url: string
  status: number | null
  ok: boolean
  contentType: string | null
  bodyExcerpt: string | null
  archiveUrl: string | null
  archivedAt: string | null
  retrievedAt: string
  error?: string
}

/**
 * Fetch an arbitrary URL with the project's User-Agent. Captures the
 * first 8KB of body text, the response status, and (best-effort) an
 * existing Wayback snapshot URL. Never triggers Save-Page-Now from
 * here — that's a deliberate decision; call `audit()` when you want
 * to archive the page.
 */
export async function fetchUrl(url: string, timeoutMs = 12_000): Promise<UrlFetchResult> {
  return cached('fetchUrl', { url }, async () => {
    const retrievedAt = nowIso()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let status: number | null = null
    let ok = false
    let contentType: string | null = null
    let bodyExcerpt: string | null = null
    let error: string | undefined
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
        redirect: 'follow',
        signal: controller.signal,
      })
      status = res.status
      ok = res.ok
      contentType = res.headers.get('content-type')
      if (res.ok && contentType && contentType.includes('text')) {
        const body = await res.text()
        bodyExcerpt = body.slice(0, 8000)
      }
    } catch (err) {
      error = (err as Error).message
    } finally {
      clearTimeout(timer)
    }
    let archiveUrl: string | null = null
    let archivedAt: string | null = null
    try {
      const wb = await findExistingSnapshot(url)
      if (wb.ok) {
        archiveUrl = wb.archivedUrl
        archivedAt = wb.archivedAt
      }
    } catch {
      /* archive lookup is best-effort */
    }
    return { url, status, ok, contentType, bodyExcerpt, archiveUrl, archivedAt, retrievedAt, error }
  })
}

export interface ExaResult {
  title: string
  url: string
  publishedDate?: string
  author?: string
  text?: string
  score?: number
}

export interface ExaSearchPayload {
  query: string
  results: ExaResult[]
  costCents?: number
  error?: string
}

/**
 * Web search — dispatches to a self-hosted SearXNG instance first, the
 * paid Exa REST API second, and returns a helpful empty payload when
 * neither backend is configured.
 *
 * Backend selection (per-call, env-driven):
 *   1. SEARXNG_URL set       → webSearchSearxng()  (free, preferred)
 *   2. EXA_API_KEY set       → webSearchExa()      (legacy / paid)
 *   3. neither set           → { results:[], error:'…' }  (agent skips)
 *
 * The `ExaSearchPayload` / `ExaResult` shapes are kept as the
 * backend-agnostic contract the agent already consumes — renaming them
 * would ripple through journalist-agent.ts unnecessarily.
 */
export async function webSearch(
  query: string,
  opts: { numResults?: number; includeText?: boolean } = {},
): Promise<ExaSearchPayload> {
  const numResults = Math.min(opts.numResults ?? 6, 8)
  const includeText = opts.includeText ?? true
  const searxngUrl = process.env.SEARXNG_URL?.trim()
  if (searxngUrl) {
    return webSearchSearxng(query, searxngUrl, { numResults, includeText })
  }
  const apiKey = process.env.EXA_API_KEY
  if (apiKey) {
    return webSearchExa(query, apiKey, { numResults, includeText })
  }
  return {
    query,
    results: [],
    error:
      'No web-search backend configured. Run `npm run searxng:up` and set SEARXNG_URL (preferred, free) — or set EXA_API_KEY for the paid Exa REST backend.',
  }
}

/**
 * SearXNG JSON endpoint. SearXNG is open-source metasearch — aggregates
 * Google / Bing / DuckDuckGo / Wikipedia / news engines — and ships with
 * a JSON output format (must be enabled in settings.yml under
 * `search.formats: [html, json]`; see scripts/searxng/settings.yml).
 */
async function webSearchSearxng(
  query: string,
  baseUrl: string,
  opts: { numResults: number; includeText: boolean },
): Promise<ExaSearchPayload> {
  return cached('webSearch', { backend: 'searxng', query, ...opts }, async () => {
    const trimmed = baseUrl.replace(/\/$/, '')
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      language: 'es',
      safesearch: '0',
    })
    try {
      const res = await fetch(`${trimmed}/search?${params.toString()}`, {
        method: 'GET',
        headers: { 'User-Agent': UA, Accept: 'application/json' },
      })
      if (!res.ok) {
        return { query, results: [], error: `SearXNG HTTP ${res.status}` }
      }
      const data = (await res.json()) as {
        results?: Array<{
          url?: string
          title?: string
          content?: string
          publishedDate?: string
          engine?: string
          score?: number
        }>
      }
      const results: ExaResult[] = (data.results ?? [])
        .filter((r) => r.url && /^https?:\/\//.test(r.url))
        .slice(0, opts.numResults)
        .map((r) => ({
          title: r.title ?? r.url ?? '',
          url: r.url as string,
          ...(r.publishedDate ? { publishedDate: r.publishedDate.slice(0, 10) } : {}),
          ...(opts.includeText && r.content ? { text: r.content.slice(0, 2000) } : {}),
          ...(typeof r.score === 'number' ? { score: r.score } : {}),
        }))
      return { query, results }
    } catch (err) {
      return { query, results: [], error: (err as Error).message }
    }
  })
}

/** Paid Exa REST backend (legacy). Reached only when SEARXNG_URL is unset
 *  and EXA_API_KEY is set. */
async function webSearchExa(
  query: string,
  apiKey: string,
  opts: { numResults: number; includeText: boolean },
): Promise<ExaSearchPayload> {
  return cached('webSearch', { backend: 'exa', query, ...opts }, async () => {
    try {
      const res = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'User-Agent': UA,
        },
        body: JSON.stringify({
          query,
          numResults: opts.numResults,
          type: 'neural',
          contents: opts.includeText
            ? { text: { maxCharacters: 2000, includeHtmlTags: false } }
            : undefined,
        }),
      })
      if (!res.ok) {
        return { query, results: [], error: `Exa HTTP ${res.status}` }
      }
      const data = (await res.json()) as {
        results?: Array<{
          title?: string
          url?: string
          publishedDate?: string
          author?: string
          text?: string
          score?: number
        }>
        costDollars?: { total?: number }
      }
      const results: ExaResult[] = (data.results ?? []).map((r) => ({
        title: r.title ?? '',
        url: r.url ?? '',
        publishedDate: r.publishedDate,
        author: r.author,
        text: r.text ? r.text.slice(0, 2000) : undefined,
        score: r.score,
      }))
      return {
        query,
        results,
        costCents:
          typeof data.costDollars?.total === 'number'
            ? Math.round(data.costDollars.total * 100 * 100) / 100
            : undefined,
      }
    } catch (err) {
      return { query, results: [], error: (err as Error).message }
    }
  })
}

// ─── Biography sweep helpers ───────────────────────────────────────────────

export interface YearRange {
  start: number
  end: number
}

export const DEFAULT_BIOGRAPHY_RANGES: readonly YearRange[] = [
  { start: 2000, end: 2005 },
  { start: 2006, end: 2010 },
  { start: 2011, end: 2015 },
  { start: 2016, end: 2020 },
  { start: 2021, end: new Date().getFullYear() },
] as const

/**
 * Year-binned web-search sweep. Issues one query per range and merges
 * the results, deduping by URL. Used by Stage 2 of the journalist
 * pipeline for `kind: 'biography'` assignments so the sparkline and
 * narrative actually span the subject's full public career rather
 * than just whatever sits in the local press snapshot.
 *
 * Each per-range query is itself cached via the `webSearch` dispatcher,
 * so re-running an assignment within a session never re-hits the
 * backend for the same range.
 */
export async function webSearchYears(
  name: string,
  ranges: readonly YearRange[] = DEFAULT_BIOGRAPHY_RANGES,
  opts: { resultsPerRange?: number; siteHint?: string } = {},
): Promise<{ query: string; results: ExaResult[]; rangeCount: number }> {
  const perRange = Math.min(opts.resultsPerRange ?? 5, 8)
  const seenUrls = new Set<string>()
  const merged: ExaResult[] = []
  for (const r of ranges) {
    const yearQ = `${r.start}..${r.end}`
    const siteQ = opts.siteHint ? ` site:${opts.siteHint}` : ''
    const q = `"${name}" ${yearQ}${siteQ}`
    const res = await webSearch(q, { numResults: perRange, includeText: true })
    for (const item of res.results) {
      if (!item.url || seenUrls.has(item.url)) continue
      seenUrls.add(item.url)
      merged.push(item)
    }
  }
  return {
    query: `${name} (year-binned across ${ranges.length} ranges)`,
    results: merged,
    rangeCount: ranges.length,
  }
}

/**
 * Fetch full body for the top-N web-search results that look
 * trustworthy (whitelist hostnames OR explicit allow-list). Returns
 * UrlFetchResult[] so callers can promote them into SourceCitation
 * rows with rich excerpts (vs. the ~200-char SearXNG snippet).
 *
 * Hostname allow-list keeps the agent from spending fetches on
 * low-trust SEO farms or Facebook walls. Override via the `allow`
 * option.
 */
const DEFAULT_FETCH_ALLOW = [
  'ribarroja.es',
  'www.ribarroja.es',
  'boe.es',
  'www.boe.es',
  'dogv.gva.es',
  'gva.es',
  'es.wikipedia.org',
  'ca.wikipedia.org',
  'transparentia.newtral.es',
  'newtral.es',
  'levante-emv.com',
  'lasprovincias.es',
  'valenciaplaza.com',
  'eldiario.es',
  'cadenaser.com',
  // Phase A additions — soul.md enrichment
  'dialnet.unirioja.es',
  'hemeroteca.lavanguardia.com',
  'hemeroteca.abc.es',
] as const

// Hosts that should be fetched via Playwright (SPA / JS-rendered).
// `fetchUrlHeadless()` rejects anything not in this allowlist to keep
// the agent from spawning a browser per random URL.
const HEADLESS_FETCH_ALLOW = new Set([
  'transparentia.newtral.es',
  'newtral.es',
  'linkedin.com',
  'www.linkedin.com',
  'es.linkedin.com',
])

/**
 * Cheap suffix-only PDF detector. Strips query string + fragment, then
 * checks the pathname for a `.pdf` (case-insensitive) ending. Catches
 * the common case — official transparency PDFs, BOE rulings, PSOE
 * candidate flyers — without burning a HEAD round-trip per URL.
 *
 * False negatives (PDF served from a non-`.pdf` URL) fall back to the
 * HTML route, which is exactly what `fetchUrl` did before this fix,
 * so the change is upside-only.
 */
function looksLikePdf(url: string): boolean {
  try {
    const u = new URL(url)
    return /\.pdf$/i.test(u.pathname)
  } catch {
    return false
  }
}

export async function fetchTopUrls(
  results: ReadonlyArray<{ url: string; title?: string }>,
  opts: { max?: number; allow?: readonly string[] } = {},
): Promise<UrlFetchResult[]> {
  const max = Math.min(opts.max ?? 5, 10)
  const allow = new Set([...(opts.allow ?? DEFAULT_FETCH_ALLOW)])
  const out: UrlFetchResult[] = []
  const seen = new Set<string>()
  for (const r of results) {
    if (out.length >= max) break
    if (!r.url || !/^https?:\/\//.test(r.url)) continue
    if (seen.has(r.url)) continue
    seen.add(r.url)
    let host: string
    try {
      host = new URL(r.url).hostname.replace(/^www\./, '')
    } catch {
      continue
    }
    if (!allow.has(host) && !allow.has(`www.${host}`)) continue
    // Route PDFs through pdf-parse; everything else through the plain
    // HTML fetcher. Both return the same UrlFetchResult shape, so the
    // caller is none the wiser.
    const fetched = looksLikePdf(r.url) ? await fetchPdfUrl(r.url) : await fetchUrl(r.url)
    if (fetched.ok && fetched.bodyExcerpt) out.push(fetched)
  }
  return out
}

// ─── Phase A: deeper soul.md enrichment tools ─────────────────────────────

/**
 * Fetch a PDF from a URL and extract its text via pdf-parse v2.
 * Returns a UrlFetchResult-shaped object so callers can promote it
 * the same way they treat plain HTML fetches. Used for things like
 * official PSOE candidate flyers, court rulings, and government PDFs
 * whose body text contains educational and career detail the synth
 * stage needs to populate identity/education/career-* sections.
 */
export async function fetchPdfUrl(url: string, timeoutMs = 20_000): Promise<UrlFetchResult> {
  return cached('fetchPdfUrl', { url }, async () => {
    const retrievedAt = nowIso()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let status: number | null = null
    let ok = false
    let contentType: string | null = null
    let bodyExcerpt: string | null = null
    let error: string | undefined
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': UA, Accept: 'application/pdf,*/*' },
        redirect: 'follow',
        signal: controller.signal,
      })
      status = res.status
      ok = res.ok
      contentType = res.headers.get('content-type')
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer())
        // Lazy-load pdf-parse so its pdfjs-dist dep is only paid by
        // agents that actually fetch a PDF (most assignments don't).
        // v1 API: default export is `pdf(buffer) → { text, numpages, info }`.
        const mod = (await import('pdf-parse')) as unknown as {
          default: (buf: Buffer) => Promise<{ text: string }>
        }
        const result = await mod.default(buf)
        bodyExcerpt = (result.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 12_000)
      }
    } catch (err) {
      error = (err as Error).message
    } finally {
      clearTimeout(timer)
    }
    // Wayback lookup is best-effort and applies to PDF URLs too.
    let archiveUrl: string | null = null
    let archivedAt: string | null = null
    try {
      const wb = await findExistingSnapshot(url)
      if (wb.ok) {
        archiveUrl = wb.archivedUrl
        archivedAt = wb.archivedAt
      }
    } catch {
      /* best-effort */
    }
    return {
      url,
      status,
      ok,
      contentType,
      bodyExcerpt,
      archiveUrl,
      archivedAt,
      retrievedAt,
      ...(error ? { error } : {}),
    }
  })
}

/**
 * Render an SPA via Playwright and dump body innerText. Strict hostname
 * allowlist — calling this on a random URL is a no-op. Caches the
 * extracted text in `.research-cache/` so repeat runs don't re-spawn
 * a browser. Cap 16 KB; SPAs we care about (transparentia.newtral.es,
 * linkedin.com profile pages) easily fit.
 */
export async function fetchUrlHeadless(url: string, timeoutMs = 20_000): Promise<UrlFetchResult> {
  return cached('fetchUrlHeadless', { url }, async () => {
    const retrievedAt = nowIso()
    let host: string
    try {
      host = new URL(url).hostname.replace(/^www\./, '')
    } catch {
      return {
        url,
        status: null,
        ok: false,
        contentType: null,
        bodyExcerpt: null,
        archiveUrl: null,
        archivedAt: null,
        retrievedAt,
        error: 'invalid URL',
      }
    }
    if (!HEADLESS_FETCH_ALLOW.has(host) && !HEADLESS_FETCH_ALLOW.has(`www.${host}`)) {
      return {
        url,
        status: null,
        ok: false,
        contentType: null,
        bodyExcerpt: null,
        archiveUrl: null,
        archivedAt: null,
        retrievedAt,
        error: `host ${host} not in HEADLESS_FETCH_ALLOW`,
      }
    }
    let status: number | null = null
    let ok = false
    let bodyExcerpt: string | null = null
    let error: string | undefined
    try {
      // Lazy-load Playwright so the dev-dep doesn't get evaluated on
      // every agent run (it's slow to import).
      const { chromium } = (await import('@playwright/test')) as typeof import('@playwright/test')
      const browser = await chromium.launch({ headless: true })
      try {
        const ctx = await browser.newContext({ userAgent: UA })
        const page = await ctx.newPage()
        const response = await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs })
        status = response?.status() ?? null
        ok = (status ?? 0) >= 200 && (status ?? 0) < 400
        if (ok) {
          const innerText = await page.evaluate(() => document.body?.innerText ?? '')
          bodyExcerpt = innerText.replace(/\s+/g, ' ').trim().slice(0, 16_000)
        }
      } finally {
        await browser.close().catch(() => undefined)
      }
    } catch (err) {
      error = (err as Error).message
    }
    let archiveUrl: string | null = null
    let archivedAt: string | null = null
    try {
      const wb = await findExistingSnapshot(url)
      if (wb.ok) {
        archiveUrl = wb.archivedUrl
        archivedAt = wb.archivedAt
      }
    } catch {
      /* best-effort */
    }
    return {
      url,
      status,
      ok,
      contentType: 'text/html (rendered)',
      bodyExcerpt,
      archiveUrl,
      archivedAt,
      retrievedAt,
      ...(error ? { error } : {}),
    }
  })
}

/**
 * Deep BOE search by person name. BOE's `/buscar/legislacion.php` JSON
 * endpoint accepts a `titulo` query and returns dated entries
 * (nombramientos, ceses, condecoraciones, sanciones, resoluciones
 * mentioning the person). Used to surface official-gazette mentions
 * with verbatim titles + ISO dates.
 */
export interface GazetteHit {
  date: string
  title: string
  url: string
  ref?: string
}

export async function fetchBoeForSubject(name: string, limit = 8): Promise<GazetteHit[]> {
  return cached('fetchBoeForSubject', { name, limit }, async () => {
    const params = new URLSearchParams({ campo: 'titulo', valor: name, num_buscar: String(limit) })
    const url = `https://www.boe.es/buscar/legislacion.php?${params.toString()}`
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' } })
      if (!res.ok) return []
      const html = await res.text()
      const hits: GazetteHit[] = []
      // BOE renders matches in <li class="resultado-busqueda"> or anchors
      // pointing to /diario_boe/txt.php?id=BOE-A-... — parse defensively.
      const linkRx = /<a[^>]+href="(\/diario_boe\/txt\.php\?id=BOE-[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
      const dateRx =
        /(\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+de\s+\d{4})/i
      let m: RegExpExecArray | null
      while ((m = linkRx.exec(html)) && hits.length < limit) {
        const path = m[1]
        const title = m[2]
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        if (!title) continue
        const dateMatch = title.match(dateRx)
        const date = dateMatch ? parseSpanishDate(dateMatch[1]) : ''
        const refMatch = path.match(/id=(BOE-[A-Z0-9-]+)/)
        hits.push({
          date,
          title,
          url: `https://www.boe.es${path}`,
          ...(refMatch ? { ref: refMatch[1] } : {}),
        })
      }
      return hits
    } catch {
      return []
    }
  })
}

/**
 * Same idea for DOGV (Generalitat Valenciana gazette). Catches
 * autonomic-level nombramientos a regidor, mancomunidad appointments,
 * commission memberships, etc.
 */
export async function fetchDogvForSubject(name: string, limit = 8): Promise<GazetteHit[]> {
  return cached('fetchDogvForSubject', { name, limit }, async () => {
    const params = new URLSearchParams({ texto: name, numero_lista: String(limit) })
    const url = `https://dogv.gva.es/portal/ficha_buscador_dogv?${params.toString()}`
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' } })
      if (!res.ok) return []
      const html = await res.text()
      const hits: GazetteHit[] = []
      const linkRx =
        /<a[^>]+href="(\/portal\/[^"]+(?:dogv|datos\.gva\.es)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
      const dateRx = /(\d{2}\/\d{2}\/\d{4})/
      let m: RegExpExecArray | null
      while ((m = linkRx.exec(html)) && hits.length < limit) {
        const path = m[1]
        const title = m[2]
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        if (!title) continue
        if (!title.toLowerCase().includes(name.toLowerCase().split(/\s+/)[0])) continue
        const dateMatch = title.match(dateRx)
        const date = dateMatch ? toIsoFromEsSlash(dateMatch[1]) : ''
        hits.push({
          date,
          title,
          url: path.startsWith('http') ? path : `https://dogv.gva.es${path}`,
        })
      }
      return hits
    } catch {
      return []
    }
  })
}

/**
 * Dialnet author search — the canonical index for Spanish academic
 * publications, theses, and book chapters. Useful for any subject who
 * has written for an academic venue (op-eds excluded; dialnet is
 * strictly scholarly).
 */
export interface DialnetEntry {
  title: string
  year?: number
  venue?: string
  url: string
}

export async function fetchDialnet(name: string, limit = 8): Promise<DialnetEntry[]> {
  return cached('fetchDialnet', { name, limit }, async () => {
    const params = new URLSearchParams({ querysomero: name })
    const url = `https://dialnet.unirioja.es/buscar/autor?${params.toString()}`
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' } })
      if (!res.ok) return []
      const html = await res.text()
      const out: DialnetEntry[] = []
      const docRx =
        /<a[^>]+href="(\/servlet\/(?:articulo|libro|tesis)\?codigo=\d+)"[^>]*>([\s\S]*?)<\/a>/gi
      const yearRx = /(?:^|[^0-9])(19[5-9]\d|20[0-3]\d)(?:[^0-9]|$)/
      let m: RegExpExecArray | null
      while ((m = docRx.exec(html)) && out.length < limit) {
        const path = m[1]
        const title = m[2]
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        if (!title) continue
        const y = title.match(yearRx)
        out.push({
          title,
          ...(y ? { year: Number(y[1]) } : {}),
          url: `https://dialnet.unirioja.es${path}`,
        })
      }
      return out
    } catch {
      return []
    }
  })
}

/**
 * Best-effort historical press query against Lavanguardia's free
 * hemeroteca preview. Many requests are blocked by the publisher's
 * anti-scrape layer; we degrade gracefully (empty array on any error)
 * so the agent never crashes here.
 */
export interface HemerotecaHit {
  date: string
  title: string
  url: string
}

export async function fetchHemerotecaQuery(name: string, year: number): Promise<HemerotecaHit[]> {
  return cached('fetchHemerotecaQuery', { name, year }, async () => {
    const params = new URLSearchParams({ q: `${name} ${year}` })
    const url = `https://hemeroteca.lavanguardia.com/preview?${params.toString()}`
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' } })
      if (!res.ok) return []
      const html = await res.text()
      const out: HemerotecaHit[] = []
      const linkRx = /<a[^>]+href="([^"]+\/preview\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
      const dateRx = /\/preview\/(\d{4})\/(\d{2})\/(\d{2})\//
      let m: RegExpExecArray | null
      while ((m = linkRx.exec(html)) && out.length < 6) {
        const href = m[1]
        const title = m[2]
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        const d = href.match(dateRx)
        if (!title || !d) continue
        out.push({
          date: `${d[1]}-${d[2]}-${d[3]}`,
          title,
          url: href.startsWith('http') ? href : `https://hemeroteca.lavanguardia.com${href}`,
        })
      }
      return out
    } catch {
      return []
    }
  })
}

/**
 * Spanish-aware regex extractor for biographical entities. Pure code,
 * no LLM. Surfaces the obvious candidates from a fetched body so the
 * later bio-extract LLM stage has structured starting points to
 * promote into identity / education / career-* section payloads.
 *
 * False positives are acceptable — the LLM stage and the validator
 * filter again. False negatives are common; this tool is "first pass"
 * only.
 */
export interface BioEntityExtraction {
  dateOfBirth?: string
  birthplace?: string
  degrees: Array<{ degree: string; institution?: string; startYear?: number; endYear?: number }>
  careerSpans: Array<{ role: string; org?: string; startYear?: number; endYear?: number }>
  judicialRefs: Array<{ caseRef: string; verbatim: string }>
}

const SPANISH_MONTHS: Record<string, string> = {
  enero: '01',
  febrero: '02',
  marzo: '03',
  abril: '04',
  mayo: '05',
  junio: '06',
  julio: '07',
  agosto: '08',
  septiembre: '09',
  octubre: '10',
  noviembre: '11',
  diciembre: '12',
}

function parseSpanishDate(s: string): string {
  const m = s.toLowerCase().match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/)
  if (!m) return ''
  const mo = SPANISH_MONTHS[m[2]]
  if (!mo) return ''
  return `${m[3]}-${mo}-${m[1].padStart(2, '0')}`
}

function toIsoFromEsSlash(s: string): string {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return ''
  return `${m[3]}-${m[2]}-${m[1]}`
}

export function extractBioEntities(bodyText: string, subjectName: string): BioEntityExtraction {
  const out: BioEntityExtraction = { degrees: [], careerSpans: [], judicialRefs: [] }
  const text = bodyText.replace(/\s+/g, ' ').trim()

  // ─── DOB ────────────────────────────────────────────────────────────────
  // Prose: "nació el 14 de marzo de 1968"
  const dobMatch = text.match(/naci(?:ó|do|da)\s+(?:el\s+)?(\d{1,2}\s+de\s+\w+\s+de\s+\d{4})/i)
  if (dobMatch) {
    const iso = parseSpanishDate(dobMatch[1])
    if (iso) out.dateOfBirth = iso
  }
  // CV: "9 ABRIL 1966" or "9 abril 1966" (no "de") — accept a bare
  // day-month-year with optional "de".
  if (!out.dateOfBirth) {
    const bare = text.match(
      /\b(\d{1,2})\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(\d{4})\b/i,
    )
    if (bare) {
      const mo = SPANISH_MONTHS[bare[2].toLowerCase()]
      if (mo) out.dateOfBirth = `${bare[3]}-${mo}-${bare[1].padStart(2, '0')}`
    }
  }

  // ─── Birthplace ─────────────────────────────────────────────────────────
  // Prose: "nacido en X" / "natural de X"
  const placeMatch =
    text.match(/naci(?:ó|do|da)\s+en\s+([A-ZÁÉÍÓÚÑ][\w\s,.\-áéíóúñ]{2,60}?)(?:,| el| en |[.;])/) ||
    text.match(/natural\s+de\s+([A-ZÁÉÍÓÚÑ][\w\s,.\-áéíóúñ]{2,60}?)(?:,|[.;])/i)
  if (placeMatch) out.birthplace = placeMatch[1].trim()
  // CV: place appears on a line just after the DOB. After a bare DOB
  // match we look for the next ALL-CAPS proper-noun-ish run (often
  // "RIBA-ROJA DE TÚRIA", "VALENCIA", "MADRID").
  if (!out.birthplace && out.dateOfBirth) {
    const after = text.slice(text.search(/\b\d{1,2}\s+(?:de\s+)?[A-Z]/i))
    const placeCv = after.match(
      /(?:\d{4})\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\-]+(?:\s+(?:DE|DEL|LA|EL|LOS|LAS)\s+)?(?:[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\-]+\s*)*)/,
    )
    if (placeCv) out.birthplace = placeCv[1].replace(/\s+/g, ' ').trim()
  }

  // ─── Degrees / education ────────────────────────────────────────────────
  // Prose: "Licenciado en X por la Universidad de Y" / "Doctor en X"
  const degreeRx =
    /(Licenciad[oa]|Diplomad[oa]|Graduad[oa]|Doctor|Doctora|Máster|Máster en|Ingenier[oa]|Arquitect[oa])\s+(?:en\s+)?([A-ZÁÉÍÓÚÑ][\w\s,.\-áéíóúñ]{2,80}?)(?:\s+por\s+(la\s+[A-ZÁÉÍÓÚÑ][\w\s,.\-áéíóúñ]{2,80}?))?(?:[.,;]|\bdesde\b|\bentre\b)/g
  let dm: RegExpExecArray | null
  while ((dm = degreeRx.exec(text))) {
    const entry: { degree: string; institution?: string; startYear?: number; endYear?: number } = {
      degree: `${dm[1]} en ${dm[2].trim()}`.replace(/\s+/g, ' '),
    }
    if (dm[3]) entry.institution = dm[3].replace(/^la\s+/i, '').trim()
    out.degrees.push(entry)
    if (out.degrees.length >= 6) break
  }
  // CV: bullet-formatted education entries — pick up bare institution
  // names + matriculation keywords. Catches the PSOE-flyer pattern:
  // "COLEGIO PÚBLICO MIGUEL CERVANTES• Matriculación en magisterio EGB"
  const eduInstRx =
    /(COLEGIO\s+PÚBLICO[\w\s-]+|UNIVERSIDAD\s+(?:DE|POLITÉCNICA|AUTÓNOMA|COMPLUTENSE|CARLOS\s+III)[\w\s-]*|UNIVERSITAT[\w\s-]+|IES\s+[\w\s-]+|ESCUELA\s+(?:TÉCNICA|SUPERIOR|UNIVERSITARIA)[\w\s-]*)/g
  let edm: RegExpExecArray | null
  while ((edm = eduInstRx.exec(text)) && out.degrees.length < 8) {
    const inst = edm[1].replace(/\s+/g, ' ').trim()
    // Pull a short program description that often follows the bullet "•"
    const tail = text.slice(edm.index + edm[0].length, edm.index + edm[0].length + 120)
    const programMatch = tail.match(
      /[•·]\s*([A-ZÁÉÍÓÚÑa-záéíóúñ][\w\s,.\-áéíóúñ]{3,60}?)(?:[.•·]|$|\s{2,})/,
    )
    out.degrees.push({
      degree: programMatch ? programMatch[1].trim() : 'Estudios cursados',
      institution: inst,
    })
  }
  // CV: standalone qualification keywords (MAGISTERIO, EGB, BACHILLER, …)
  const qualRx =
    /\b(MAGISTERIO|BACHILLERATO|BACHILLER|EGB|FP\s+(?:I+|SUPERIOR)|ACCESO\s+A\s+UNIVERSIDAD\s+MAYORES\s+DE\s+\d{2}\s+AÑOS|DOCTORADO|LICENCIATURA|MÁSTER|GRADO\s+EN\s+\w+)\b/g
  let qm: RegExpExecArray | null
  while ((qm = qualRx.exec(text)) && out.degrees.length < 12) {
    out.degrees.push({ degree: qm[1].replace(/\s+/g, ' ').trim() })
  }

  // ─── Career spans ───────────────────────────────────────────────────────
  // Prose: "1991-2003 economista en X" or "entre 1991 y 2003"
  const careerRx =
    /(\d{4})\s*[-–—]\s*(\d{4}|presente|actualidad)\s*[:,]?\s+([\w\sÁÉÍÓÚÑáéíóúñ.,\-]{3,80}?)(?:\s+en\s+([\w\sÁÉÍÓÚÑáéíóúñ.,\-]{2,80}?))?(?:[.;]|$)/g
  let cm: RegExpExecArray | null
  while ((cm = careerRx.exec(text))) {
    const startYear = Number(cm[1])
    const endRaw = cm[2]
    const endYear = /^\d{4}$/.test(endRaw) ? Number(endRaw) : undefined
    out.careerSpans.push({
      role: cm[3].trim(),
      ...(cm[4] ? { org: cm[4].trim() } : {}),
      startYear,
      ...(endYear !== undefined ? { endYear } : {}),
    })
    if (out.careerSpans.length >= 10) break
  }
  // CV-bullet career: "ASESOR • 2011 - 2015• DIPUTACIÓ DE VALÈNCIA"
  const careerCvRx =
    /([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ\s]{2,40}?)\s*[•·]\s*(\d{4})\s*[-–—]\s*(\d{4}|ACTUAL|ACTUALIDAD|PRESENTE)\s*[•·]\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ\s.,\-]{2,80})/g
  let ccm: RegExpExecArray | null
  while ((ccm = careerCvRx.exec(text)) && out.careerSpans.length < 18) {
    const startYear = Number(ccm[2])
    const endRaw = ccm[3].toUpperCase()
    const endYear = /^\d{4}$/.test(endRaw) ? Number(endRaw) : undefined
    out.careerSpans.push({
      role: ccm[1].replace(/\s+/g, ' ').trim(),
      org: ccm[4].replace(/\s+/g, ' ').replace(/[•·]+/g, '').trim(),
      startYear,
      ...(endYear !== undefined ? { endYear } : {}),
    })
  }

  // ─── Judicial refs ──────────────────────────────────────────────────────
  // PA NNNN/YYYY (or DP/RC/PO) anywhere in text containing the subject's first name nearby
  const judicialRx = /\b(PA|DP|RC|PO)\s*\d+\s*\/\s*\d{2,4}\b/gi
  const subjectFirstName = subjectName.split(/\s+/)[0]
  let jm: RegExpExecArray | null
  while ((jm = judicialRx.exec(text))) {
    const idx = jm.index ?? 0
    const window = text.slice(Math.max(0, idx - 120), Math.min(text.length, idx + 180))
    if (!new RegExp(subjectFirstName, 'i').test(window)) continue
    out.judicialRefs.push({ caseRef: jm[0], verbatim: window.replace(/\s+/g, ' ').trim() })
    if (out.judicialRefs.length >= 4) break
  }

  return out
}

export interface AuditResult {
  url: string
  alive: boolean
  status: number | null
  archiveUrl: string | null
  archivedAt: string | null
  checkedAt: string
  error?: string
}

/**
 * Equivalent of `audit-press-links.ts` for a single URL. HEAD-check
 * the URL; if dead and the caller asked for archival, push a Save
 * Page Now. Default is "look up existing snapshot only" — explicit
 * archival is opt-in (saveIfDead=true).
 */
export async function audit(
  url: string,
  opts: { saveIfDead?: boolean } = {},
): Promise<AuditResult> {
  const checkedAt = nowIso()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  let alive = false
  let status: number | null = null
  let error: string | undefined
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': UA, Accept: '*/*' },
      redirect: 'follow',
      signal: controller.signal,
    })
    status = res.status
    alive = res.status >= 200 && res.status < 400
  } catch (err) {
    error = (err as Error).message
  } finally {
    clearTimeout(timer)
  }
  let archiveUrl: string | null = null
  let archivedAt: string | null = null
  try {
    const existing = await findExistingSnapshot(url)
    if (existing.ok) {
      archiveUrl = existing.archivedUrl
      archivedAt = existing.archivedAt
    } else if (!alive && opts.saveIfDead) {
      const saved = await archiveOnWayback(url)
      if (saved.ok) {
        archiveUrl = saved.archivedUrl
        archivedAt = saved.archivedAt
      }
    }
  } catch {
    /* best-effort archive */
  }
  return { url, alive, status, archiveUrl, archivedAt, checkedAt, ...(error ? { error } : {}) }
}

// ─── Citation builders ─────────────────────────────────────────────────────

let citationCounter = 0
function nextCitationId(): string {
  citationCounter += 1
  return `src-${String(citationCounter).padStart(3, '0')}`
}

export function resetCitationCounter(): void {
  citationCounter = 0
}

export function buildLocalCitation(opts: {
  localPath: string
  title: string
  excerpt?: string
}): SourceCitation {
  return {
    id: nextCitationId(),
    kind: 'local-snapshot' as CitationKind,
    title: opts.title,
    retrievedAt: nowIso(),
    localPath: opts.localPath,
    trust: 'high' as CitationTrust,
    ...(opts.excerpt ? { excerpt: opts.excerpt.slice(0, 500) } : {}),
  }
}

export function buildWebCitation(opts: {
  url: string
  title: string
  publisher?: string
  publishedAt?: string
  excerpt?: string
  archiveUrl?: string | null
  trust?: CitationTrust
}): SourceCitation {
  return {
    id: nextCitationId(),
    kind: 'web' as CitationKind,
    url: opts.url,
    title: opts.title,
    retrievedAt: nowIso(),
    trust: opts.trust ?? ('medium' as CitationTrust),
    ...(opts.publisher ? { publisher: opts.publisher } : {}),
    ...(opts.publishedAt ? { publishedAt: opts.publishedAt } : {}),
    ...(opts.excerpt ? { excerpt: opts.excerpt.slice(0, 500) } : {}),
    ...(opts.archiveUrl ? { archiveUrl: opts.archiveUrl } : {}),
  }
}

export function buildWikidataCitation(payload: WikidataPayload, lang = 'es'): SourceCitation {
  const label = payload.labels[lang] ?? payload.labels.en ?? payload.qid
  const description = payload.descriptions[lang] ?? payload.descriptions.en ?? ''
  return {
    id: nextCitationId(),
    kind: 'wikidata' as CitationKind,
    url: payload.url,
    title: `Wikidata: ${label}`,
    retrievedAt: nowIso(),
    trust: 'high' as CitationTrust,
    publisher: 'Wikidata',
    ...(description ? { excerpt: description.slice(0, 500) } : {}),
  }
}

export function buildWikipediaCitation(summary: WikipediaSummary): SourceCitation {
  return {
    id: nextCitationId(),
    kind: 'wikipedia' as CitationKind,
    url: summary.url,
    title: `Wikipedia (${summary.lang}): ${summary.title}`,
    retrievedAt: nowIso(),
    trust: 'high' as CitationTrust,
    publisher: `Wikipedia ${summary.lang}`,
    ...(summary.extract ? { excerpt: summary.extract.slice(0, 500) } : {}),
  }
}

// Re-exports for callers/tests
export { CACHE_DIR }
