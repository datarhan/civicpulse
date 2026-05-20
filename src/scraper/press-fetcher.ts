/**
 * Press body fetcher with robots.txt respect, per-host rate limit,
 * content-addressed cache, and Google-News redirect resolution.
 *
 * Used by the press fact-check laboratory (src/scraper/press-claim-llm.ts)
 * to pull article bodies when the headline-triage stage flags a checkable
 * claim that needs more context than the title alone. Three guardrails
 * keep the fetcher polite:
 *
 *   1. robots.txt — checked once per host with 24h TTL. If the host
 *      disallows the URL path, return {robotsAllowed:false} and the
 *      caller falls back to headline-only extraction.
 *   2. Per-host rate limit — 1 request per `MIN_HOST_INTERVAL_MS`
 *      milliseconds (default 2s). Implemented as a per-host
 *      "next-allowed-at" timestamp in module-local state.
 *   3. Content-addressed cache — `.press-cache/<sha256>.html`,
 *      indexed by the *final* (post-redirect) URL. 7-day TTL.
 *      Cache hits skip both robots.txt and the rate limit.
 *
 * Google News links are opaque `news.google.com/rss/articles/<base64>`
 * redirectors. We follow them via fetch's redirect:follow and cache
 * against the resolved publisher URL — so subsequent extractions skip
 * the redirect dance.
 *
 * Cheerio (already in package.json) extracts the readable body; no new
 * dependency is added.
 */

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const DEFAULT_CACHE_DIR = '.press-cache'
const DEFAULT_BODY_TTL_MS = 7 * 24 * 60 * 60 * 1000
const DEFAULT_ROBOTS_TTL_MS = 24 * 60 * 60 * 1000
const MIN_HOST_INTERVAL_MS = 2_000
const MAX_BODY_BYTES = 50 * 1024
const FETCH_TIMEOUT_MS = 15_000
const UA = 'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) civic-tech ingestion'

const hostNextAllowedAt = new Map<string, number>()

export interface FetchResult {
  finalUrl: string
  body: string
  fetchedAt: string
  fromCache: boolean
  robotsAllowed: boolean
  contentType: string
}

export interface FetcherOptions {
  cacheDir?: string
  bodyTtlMs?: number
  robotsTtlMs?: number
  minHostIntervalMs?: number
  maxBodyBytes?: number
  fetchImpl?: typeof fetch
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

function pathOf(url: string): string {
  try {
    const u = new URL(url)
    return u.pathname + u.search
  } catch {
    return '/'
  }
}

/**
 * Tiny robots.txt parser — first-match rule, simpler than RFC 9309
 * specificity-by-length but matches what most outlets actually intend.
 */
export function parseRobotsTxt(raw: string): Array<{ allow: boolean; path: string }> {
  let inOurSection = false
  let inWildcardSection = false
  const wildcardRules: Array<{ allow: boolean; path: string }> = []
  const ourRules: Array<{ allow: boolean; path: string }> = []
  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.split('#')[0].trim()
    if (!line) continue
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const key = line.slice(0, colon).trim().toLowerCase()
    const val = line.slice(colon + 1).trim()
    if (key === 'user-agent') {
      inOurSection = val.toLowerCase() === 'civicpulse'
      inWildcardSection = val === '*'
      continue
    }
    if (key === 'allow' || key === 'disallow') {
      const target = inOurSection ? ourRules : inWildcardSection ? wildcardRules : null
      if (target) target.push({ allow: key === 'allow', path: val })
    }
  }
  return ourRules.length > 0 ? ourRules : wildcardRules
}

export function isPathAllowed(
  rules: Array<{ allow: boolean; path: string }>,
  path: string,
): boolean {
  for (const r of rules) {
    if (r.path === '') {
      if (r.allow) return true
      continue
    }
    if (path.startsWith(r.path)) return r.allow
  }
  return true
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`fetch timeout after ${ms}ms`)), ms),
    ),
  ])
}

async function readCachedFile(path: string, ttlMs: number, nowMs: number): Promise<string | null> {
  try {
    const st = await stat(path)
    if (nowMs - st.mtimeMs > ttlMs) return null
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

async function writeCacheFile(path: string, body: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, body, 'utf8')
}

async function fetchRobots(
  host: string,
  opts: Required<FetcherOptions>,
): Promise<Array<{ allow: boolean; path: string }>> {
  const cachePath = join(opts.cacheDir, 'robots', `${host}.txt`)
  const cached = await readCachedFile(cachePath, opts.robotsTtlMs, opts.now())
  if (cached !== null) return parseRobotsTxt(cached)
  try {
    const res = await withTimeout(
      opts.fetchImpl(`https://${host}/robots.txt`, {
        headers: { 'User-Agent': UA, Accept: 'text/plain,*/*' },
        redirect: 'follow',
      }),
      FETCH_TIMEOUT_MS,
    )
    if (!res.ok) {
      await writeCacheFile(cachePath, '')
      return []
    }
    const raw = await res.text()
    await writeCacheFile(cachePath, raw.slice(0, 100_000))
    return parseRobotsTxt(raw)
  } catch {
    return []
  }
}

export async function extractReadableBody(html: string, maxBytes: number): Promise<string> {
  const cheerio = await import('cheerio')
  const $ = cheerio.load(html)
  $(
    'script, style, noscript, nav, aside, header, footer, form, iframe, .ad, .ads, .advert, .related, .comments',
  ).remove()
  let bestText = ''
  $('article, main').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim()
    if (t.length > bestText.length) bestText = t
  })
  if (!bestText) {
    $('div').each((_, el) => {
      const $el = $(el)
      if ($el.find('p').length < 2) return
      const t = $el.text().replace(/\s+/g, ' ').trim()
      if (t.length > bestText.length) bestText = t
    })
  }
  if (!bestText) bestText = $('body').text().replace(/\s+/g, ' ').trim()
  const buf = Buffer.from(bestText, 'utf8').slice(0, maxBytes)
  return buf.toString('utf8')
}

export async function fetchArticleBody(
  url: string,
  options: FetcherOptions = {},
): Promise<FetchResult> {
  const opts: Required<FetcherOptions> = {
    cacheDir: options.cacheDir ?? DEFAULT_CACHE_DIR,
    bodyTtlMs: options.bodyTtlMs ?? DEFAULT_BODY_TTL_MS,
    robotsTtlMs: options.robotsTtlMs ?? DEFAULT_ROBOTS_TTL_MS,
    minHostIntervalMs: options.minHostIntervalMs ?? MIN_HOST_INTERVAL_MS,
    maxBodyBytes: options.maxBodyBytes ?? MAX_BODY_BYTES,
    fetchImpl: options.fetchImpl ?? fetch,
    now: options.now ?? Date.now,
    sleep: options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms))),
  }

  const cacheKey = sha256(url)
  const cachePath = join(opts.cacheDir, `${cacheKey}.html`)
  const cached = await readCachedFile(cachePath, opts.bodyTtlMs, opts.now())
  if (cached !== null) {
    return {
      finalUrl: url,
      body: cached,
      fetchedAt: new Date(opts.now()).toISOString(),
      fromCache: true,
      robotsAllowed: true,
      contentType: 'cached',
    }
  }

  const host = hostOf(url)
  if (!host) {
    return {
      finalUrl: url,
      body: '',
      fetchedAt: new Date(opts.now()).toISOString(),
      fromCache: false,
      robotsAllowed: false,
      contentType: 'invalid-url',
    }
  }

  const robotsRules = await fetchRobots(host, opts)
  if (!isPathAllowed(robotsRules, pathOf(url))) {
    return {
      finalUrl: url,
      body: '',
      fetchedAt: new Date(opts.now()).toISOString(),
      fromCache: false,
      robotsAllowed: false,
      contentType: 'denied',
    }
  }

  const nextAllowedMs = hostNextAllowedAt.get(host) ?? 0
  const nowMs = opts.now()
  if (nowMs < nextAllowedMs) {
    await opts.sleep(nextAllowedMs - nowMs)
  }
  hostNextAllowedAt.set(host, opts.now() + opts.minHostIntervalMs)

  let res: Response
  try {
    res = await withTimeout(
      opts.fetchImpl(url, {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml,*/*;q=0.9',
          'Accept-Language': 'es-ES,ca,en;q=0.7',
        },
        redirect: 'follow',
      }),
      FETCH_TIMEOUT_MS,
    )
  } catch (err) {
    return {
      finalUrl: url,
      body: '',
      fetchedAt: new Date(opts.now()).toISOString(),
      fromCache: false,
      robotsAllowed: true,
      contentType: `fetch-error:${(err as Error).message.slice(0, 80)}`,
    }
  }

  const finalUrl = res.url || url
  const finalHost = hostOf(finalUrl)
  if (finalHost && finalHost !== host) {
    const r2 = await fetchRobots(finalHost, opts)
    if (!isPathAllowed(r2, pathOf(finalUrl))) {
      return {
        finalUrl,
        body: '',
        fetchedAt: new Date(opts.now()).toISOString(),
        fromCache: false,
        robotsAllowed: false,
        contentType: 'denied-after-redirect',
      }
    }
  }

  if (!res.ok) {
    return {
      finalUrl,
      body: '',
      fetchedAt: new Date(opts.now()).toISOString(),
      fromCache: false,
      robotsAllowed: true,
      contentType: `http:${res.status}`,
    }
  }

  const html = await res.text()
  const body = await extractReadableBody(html, opts.maxBodyBytes)

  await writeCacheFile(cachePath, body)
  if (finalUrl !== url) {
    const finalCachePath = join(opts.cacheDir, `${sha256(finalUrl)}.html`)
    await writeCacheFile(finalCachePath, body)
  }

  return {
    finalUrl,
    body,
    fetchedAt: new Date(opts.now()).toISOString(),
    fromCache: false,
    robotsAllowed: true,
    contentType: res.headers.get('content-type') ?? 'unknown',
  }
}

/** Reset the per-host rate-limit state (test hook). */
export function _resetRateLimitState(): void {
  hostNextAllowedAt.clear()
}
