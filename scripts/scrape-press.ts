#!/usr/bin/env tsx
/**
 * Fetch press headlines about Riba-roja de Túria from multiple feeds and
 * write the merged result to public/data/press.json.
 *
 * Feeds (each one is an independent fetch; one failure does not block the
 * others — the CLI just logs and continues):
 *
 *  1. Google News RSS, query "Riba-roja de Túria" — aggregator covering
 *     national + regional Spanish outlets that index the municipality.
 *  2. infoturia.com /riba-roja-de-turia/feed/ — direct WordPress feed of
 *     the local Camp de Túria comarcal paper. Catches stories the Google
 *     News indexer misses (small-outlet recency lag).
 *  3. ribarroja.es /es/noticias/rss.xml — the Ayuntamiento's OWN Drupal
 *     news feed (primary source, official:true + Sección taxonomy). Needs a
 *     Mozilla-leading UA to clear the ribarroja.es WAF.
 *
 * Items are merged + deduped by FNV title fingerprint (first-list wins): the
 * official feed is passed first so the town hall's attribution wins when the
 * same story also surfaces via press aggregation. To add a future source,
 * append another entry to the fetch block — parseStandardRss handles any
 * WordPress-style feed, parseOfficialNewsRss the official Drupal feed, while
 * Google News needs its dedicated parser for the " - Pub" suffix.
 *
 * Usage: npm run scrape:press
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseGoogleNewsRss,
  parseStandardRss,
  parseOfficialNewsRss,
  mergeWithCarryForward,
  type NewsItem,
  type FeedOutcome,
} from '../src/scraper/press'
import { withRetry, isTransientFetchError } from '../src/scraper/retry'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const OUT = join(PROJECT_ROOT, 'public/data/press.json')

const GOOGLE_QUERY = '"Riba-roja de Túria"'
const GOOGLE_URL =
  'https://news.google.com/rss/search?q=' +
  encodeURIComponent(GOOGLE_QUERY) +
  '&hl=es&gl=ES&ceid=ES:es'

const INFOTURIA_URL = 'https://www.infoturia.com/riba-roja-de-turia/feed/'
const OFICIAL_URL = 'https://www.ribarroja.es/es/noticias/rss.xml'

const UA = 'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) civic-tech ingestion'
// ribarroja.es sits behind a WAF that TLS-resets any User-Agent not leading
// with a Mozilla/ token, so the official feed must announce itself like this.
const MOZILLA_UA =
  'Mozilla/5.0 (compatible; CivicPulse/0.1; +https://github.com/datarhan/civicpulse)'

async function fetchXml(url: string, ua: string = UA): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': ua,
      Accept: 'application/rss+xml,application/xml,text/xml,*/*',
    },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
  return res.text()
}

/**
 * The ribarroja.es WAF answers 403 (not a 5xx) when it dislikes a caller's
 * IP reputation — which is how a GitHub runner gets turned away while the
 * same request from a laptop succeeds. `isTransientFetchError` classes 4xx
 * as permanent and skips the retry, so a WAF block used to burn the feed on
 * the first attempt. Gateway-block statuses are worth one more try.
 */
function isTransientOrBlocked(err: unknown): boolean {
  if (err instanceof Error) {
    const code = Number(err.message.match(/HTTP (\d{3})/)?.[1])
    if (code === 401 || code === 403 || code === 451) return true
  }
  return isTransientFetchError(err)
}

/**
 * Last published snapshot, used to carry a failed feed forward. A missing or
 * corrupt file is not fatal — it just means nothing to recover.
 */
async function readPreviousItems(): Promise<NewsItem[]> {
  try {
    const prev = JSON.parse(await readFile(OUT, 'utf8')) as { items?: unknown }
    return Array.isArray(prev.items) ? (prev.items as NewsItem[]) : []
  } catch {
    return []
  }
}

async function safeFetch(label: string, url: string, ua: string = UA): Promise<string | null> {
  try {
    console.log(`[press] fetching ${label}: ${url}`)
    // Retry transient blips (timeout / 429 / 5xx) before giving up — one Google
    // News timeout used to drop ~96 items for a whole day. Permanent 4xx aren't
    // retried (isTransientFetchError).
    return await withRetry(() => fetchXml(url, ua), {
      retries: 2,
      shouldRetry: isTransientOrBlocked,
      onRetry: (err, attempt) =>
        console.warn(
          `[press] ${label} attempt ${attempt + 1} failed (${(err as Error).message}) — retrying…`,
        ),
    })
  } catch (err) {
    // Still failing after retries — log and continue with the rest so we never
    // freeze press.json on a sustained outage of one source.
    console.warn(`[press] WARN ${label} fetch failed after retries:`, (err as Error).message)
    return null
  }
}

async function main() {
  const previousItems = await readPreviousItems()

  const gnewsXml = await safeFetch('Google News', GOOGLE_URL)
  const infoturiaXml = await safeFetch('infoturia.com', INFOTURIA_URL)
  // The Ayuntamiento's OWN news feed (Drupal). Primary source — stamped
  // official:true + a Sección taxonomy by parseOfficialNewsRss. Needs the
  // Mozilla UA to clear the ribarroja.es WAF.
  const officialXml = await safeFetch('ribarroja.es (oficial)', OFICIAL_URL, MOZILLA_UA)

  // Ordered by trust: official first (the town hall's primary-source voice),
  // then infoturia (direct local outlet), then Google News aggregation — so
  // the higher-trust attribution wins on a fingerprint collision.
  //
  // `owns` locates each feed's rows in the PREVIOUS snapshot, which is what
  // lets a failed fetch carry forward instead of deleting published items.
  // The predicates must stay mutually exclusive and cover every row.
  const feeds: Array<FeedOutcome & { url: string; platform: string }> = [
    {
      url: OFICIAL_URL,
      platform: 'Drupal RSS (oficial)',
      ok: officialXml !== null,
      items: officialXml ? parseOfficialNewsRss(officialXml) : [],
      owns: (i) => i.official === true,
    },
    {
      url: INFOTURIA_URL,
      platform: 'WordPress RSS',
      ok: infoturiaXml !== null,
      items: infoturiaXml
        ? parseStandardRss(infoturiaXml, {
            defaultSource: 'Periòdic del Camp de Túria',
            defaultHost: 'infoturia.com',
          })
        : [],
      owns: (i) => i.official !== true && i.sourceHost === 'infoturia.com',
    },
    {
      url: GOOGLE_URL,
      platform: 'Google News RSS',
      ok: gnewsXml !== null,
      items: gnewsXml ? parseGoogleNewsRss(gnewsXml) : [],
      owns: (i) => i.official !== true && i.sourceHost !== 'infoturia.com',
    },
  ]

  const { items, carriedForward } = mergeWithCarryForward(feeds, previousItems)
  const sources = Array.from(new Set(items.map((i) => i.source))).sort()

  // Feed health stays honest: a carried-forward feed still reports ok:false,
  // and `carriedForward` says how many rows are being held over rather than
  // freshly fetched.
  const feedsMeta = feeds.map((f) => {
    const recovered = f.ok ? 0 : previousItems.filter(f.owns).length
    return {
      url: f.url,
      platform: f.platform,
      ok: f.ok,
      items: f.ok ? f.items.length : recovered,
      ...(f.ok ? {} : { carriedForward: recovered }),
    }
  })

  const payload = {
    generatedAt: new Date().toISOString(),
    feeds: feedsMeta,
    stats: {
      total: items.length,
      sources: sources.length,
      latestDate: items[0]?.date ?? null,
      carriedForward,
    },
    sources,
    items,
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
  console.log(`[press] wrote ${OUT}`)
  console.log(
    `[press] ${items.length} items from ${sources.length} sources ` +
      feedsMeta.map((f) => `${f.platform.split(' ')[0]}=${f.items}`).join(', '),
  )
  for (const f of feedsMeta) {
    if (!f.ok) {
      console.warn(
        `[press] WARN ${f.platform} unreachable — carried ${f.carriedForward} item(s) ` +
          `forward from the previous snapshot instead of dropping them.`,
      )
    }
  }
}

main().catch((err) => {
  console.error('[press] failed:', err)
  process.exit(1)
})
