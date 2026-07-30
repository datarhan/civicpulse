/**
 * Journalist tools — the network layer: Wikidata/Wikipedia, raw URL fetch,
 * web search (SearXNG→Exa), the year-binned biography sweep, PDF + headless
 * SPA fetch, and the Wayback availability audit. Verbatim from the monolith.
 */
import { archiveOnWayback, findExistingSnapshot } from '../wayback'
import { UA, cached, nowIso } from './internal'

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
/**
 * Single source of truth for the backend selection — used by webSearch()
 * and by journalist-run's start-of-run banner, so an unconfigured
 * backend is loudly visible BEFORE a run silently skips every open-web
 * query (the 2026-07-29 v2 bio run only revealed webResults:0 in the
 * post-hoc research summary).
 */
export function describeWebSearchBackend(env: NodeJS.ProcessEnv = process.env): {
  backend: 'searxng' | 'exa' | 'none'
  detail: string
  url?: string
} {
  const searxngUrl = env.SEARXNG_URL?.trim()
  if (searxngUrl) {
    return { backend: 'searxng', detail: `searxng @ ${searxngUrl}`, url: searxngUrl }
  }
  if (env.EXA_API_KEY) return { backend: 'exa', detail: 'exa (paid REST)' }
  return {
    backend: 'none',
    detail:
      'NONE — open-web queries will be skipped (run `npm run searxng:up` + set SEARXNG_URL, or set EXA_API_KEY)',
  }
}

export async function webSearch(
  query: string,
  opts: { numResults?: number; includeText?: boolean } = {},
): Promise<ExaSearchPayload> {
  const numResults = Math.min(opts.numResults ?? 6, 8)
  const includeText = opts.includeText ?? true
  const backend = describeWebSearchBackend()
  if (backend.backend === 'searxng' && backend.url) {
    return webSearchSearxng(query, backend.url, { numResults, includeText })
  }
  if (backend.backend === 'exa' && process.env.EXA_API_KEY) {
    return webSearchExa(query, process.env.EXA_API_KEY, { numResults, includeText })
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
export function looksLikePdf(url: string): boolean {
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
