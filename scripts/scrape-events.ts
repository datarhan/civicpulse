#!/usr/bin/env tsx
/**
 * Fetch the Ayuntamiento's events / agenda feed
 * (ribarroja.es/es/eventos/rss.xml) and write public/data/events.json.
 *
 * The feed carries the real per-event datetime (machine + human) which
 * parseEventsRss lifts; we also precompute the "upcoming" slice (eventDate in
 * the future) so the landing surface reads one number, not a filter.
 *
 * Usage: npm run scrape:events
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEventsRss } from '../src/scraper/events'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const OUT = join(PROJECT_ROOT, 'public/data/events.json')

const FEED_URL = 'https://www.ribarroja.es/es/eventos/rss.xml'
// ribarroja.es sits behind a WAF that TLS-resets any User-Agent not leading
// with a Mozilla/ token.
const UA = 'Mozilla/5.0 (compatible; CivicPulse/0.1; +https://github.com/datarhan/civicpulse)'

async function main() {
  console.log('[events] fetching', FEED_URL)
  const res = await fetch(FEED_URL, {
    headers: { 'User-Agent': UA, Accept: 'application/rss+xml,application/xml,text/xml,*/*' },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${FEED_URL}`)
  const xml = await res.text()
  const events = parseEventsRss(xml)

  // Silent-failure guard: a feed/markup change that yields 0 events must not
  // clobber the last good snapshot with an empty one.
  if (events.length === 0) {
    console.error('[events] parsed 0 events — refusing to overwrite events.json')
    process.exit(1)
  }

  const nowIso = new Date().toISOString()
  const upcoming = events.filter((e) => e.eventDate && e.eventDate >= nowIso)

  const payload = {
    generatedAt: nowIso,
    source: { url: FEED_URL, platform: 'Drupal RSS (oficial)' },
    stats: {
      total: events.length,
      upcoming: upcoming.length,
      nextDate: upcoming[0]?.eventDate ?? null,
    },
    events,
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
  console.log(`[events] wrote ${OUT} — ${events.length} events (${upcoming.length} upcoming)`)
}

main().catch((err) => {
  console.error('[events] failed:', err)
  process.exit(1)
})
