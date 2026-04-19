#!/usr/bin/env tsx
/**
 * Fetch Google News RSS for "Riba-roja de Túria" and write
 * public/data/press.json.
 *
 * Usage: npm run scrape:press
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseGoogleNewsRss } from '../src/scraper/press'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const OUT = join(PROJECT_ROOT, 'public/data/press.json')

const QUERY = '"Riba-roja de Túria"'
const URL =
  'https://news.google.com/rss/search?q=' +
  encodeURIComponent(QUERY) +
  '&hl=es&gl=ES&ceid=ES:es'

async function main() {
  console.log('[press] fetching', URL)
  const res = await fetch(URL, {
    headers: {
      'User-Agent':
        'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) civic-tech ingestion',
      Accept: 'application/rss+xml,application/xml,text/xml,*/*',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const xml = await res.text()

  const items = parseGoogleNewsRss(xml)
  const sources = Array.from(new Set(items.map((i) => i.source))).sort()

  const payload = {
    generatedAt: new Date().toISOString(),
    source: { url: URL, query: QUERY, platform: 'Google News RSS' },
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
  console.log(`[press] ${items.length} items from ${sources.length} sources`)
}

main().catch((err) => {
  console.error('[press] failed:', err)
  process.exit(1)
})
