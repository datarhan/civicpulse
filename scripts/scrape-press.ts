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
 *
 * Items are merged + deduped by FNV title fingerprint (first-list wins),
 * which means an infoturia.com story that Google News also indexed keeps
 * its direct attribution. To add a future source, append another entry
 * to the fetch block — parseStandardRss handles any WordPress-style feed,
 * while Google News needs the dedicated parser due to its " - Pub" suffix.
 *
 * Usage: npm run scrape:press
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseGoogleNewsRss,
  parseStandardRss,
  mergeNewsItems,
  type NewsItem,
} from '../src/scraper/press'

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

const UA = 'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) civic-tech ingestion'

async function fetchXml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/rss+xml,application/xml,text/xml,*/*',
    },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
  return res.text()
}

async function safeFetch(label: string, url: string): Promise<string | null> {
  try {
    console.log(`[press] fetching ${label}: ${url}`)
    return await fetchXml(url)
  } catch (err) {
    // Local feeds occasionally 5xx — log and continue with the rest so we
    // never freeze press.json on a transient outage of one source.
    console.warn(`[press] WARN ${label} fetch failed:`, (err as Error).message)
    return null
  }
}

async function main() {
  const feedsMeta: Array<{ url: string; platform: string; ok: boolean; items: number }> = []

  let gnewsItems: NewsItem[] = []
  const gnewsXml = await safeFetch('Google News', GOOGLE_URL)
  if (gnewsXml) {
    gnewsItems = parseGoogleNewsRss(gnewsXml)
    feedsMeta.push({
      url: GOOGLE_URL,
      platform: 'Google News RSS',
      ok: true,
      items: gnewsItems.length,
    })
  } else {
    feedsMeta.push({ url: GOOGLE_URL, platform: 'Google News RSS', ok: false, items: 0 })
  }

  let infoturiaItems: NewsItem[] = []
  const infoturiaXml = await safeFetch('infoturia.com', INFOTURIA_URL)
  if (infoturiaXml) {
    infoturiaItems = parseStandardRss(infoturiaXml, {
      defaultSource: 'Periòdic del Camp de Túria',
      defaultHost: 'infoturia.com',
    })
    feedsMeta.push({
      url: INFOTURIA_URL,
      platform: 'WordPress RSS',
      ok: true,
      items: infoturiaItems.length,
    })
  } else {
    feedsMeta.push({ url: INFOTURIA_URL, platform: 'WordPress RSS', ok: false, items: 0 })
  }

  // Merge with infoturia first so its direct attribution wins when the
  // same story also appears via Google News (first-list-wins per the
  // mergeNewsItems contract).
  const items = mergeNewsItems(infoturiaItems, gnewsItems)
  const sources = Array.from(new Set(items.map((i) => i.source))).sort()

  const payload = {
    generatedAt: new Date().toISOString(),
    feeds: feedsMeta,
    stats: {
      total: items.length,
      sources: sources.length,
      latestDate: items[0]?.date ?? null,
    },
    sources,
    items,
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
  console.log(`[press] wrote ${OUT}`)
  console.log(
    `[press] ${items.length} items from ${sources.length} sources ` +
      `(google=${gnewsItems.length}, infoturia=${infoturiaItems.length})`,
  )
}

main().catch((err) => {
  console.error('[press] failed:', err)
  process.exit(1)
})
