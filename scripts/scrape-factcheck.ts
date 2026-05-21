#!/usr/bin/env tsx
/**
 * Pull third-party fact-checks that touch Riba-roja from:
 *   · the Google Fact Check Tools API (ClaimReview-indexed), and
 *   · Maldita.es / Newtral RSS feeds (direct publisher feeds, used
 *     as a fallback for items that don't emit ClaimReview JSON-LD).
 * Writes the merged result to public/data/factcheck.json.
 *
 * Auth: GOOGLE_FACT_CHECK_API_KEY env var (free tier) is OPTIONAL.
 * When the key is absent the API call is skipped but the RSS feeds
 * still run, so the snapshot stays non-empty without a paid quota.
 *
 * Usage:
 *   npm run scrape:factcheck                   # API + both RSS feeds
 *   npm run scrape:factcheck -- --max-pages 2  # cap API pagination
 *   npm run scrape:factcheck -- --no-rss       # API only
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  fetchFactChecks,
  mergeFactCheckRows,
  parseFactCheckResponse,
  parseFactcheckRss,
  type FactCheckRow,
  type FactCheckSnapshot,
} from '../src/scraper/factcheck'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const OUT = join(PROJECT_ROOT, 'public/data/factcheck.json')

const QUERY = '"Riba-roja de Túria"'
const API_BASE = 'https://factchecktools.googleapis.com/v1alpha1/claims:search'

function getFlag(name: string): string | null {
  const i = process.argv.indexOf(name)
  if (i < 0) return null
  return process.argv[i + 1] ?? null
}

const UA = 'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) civic-tech ingestion'

const RSS_FEEDS = [
  {
    url: 'https://maldita.es/feed/',
    reviewerName: 'Maldita.es',
    reviewerSite: 'maldita.es',
  },
  {
    url: 'https://www.newtral.es/feed/',
    reviewerName: 'Newtral',
    reviewerSite: 'newtral.es',
  },
] as const

async function write(payload: FactCheckSnapshot): Promise<void> {
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
}

async function fetchApiRows(maxPages: number): Promise<FactCheckRow[]> {
  const apiKey = process.env.GOOGLE_FACT_CHECK_API_KEY
  if (!apiKey) {
    console.warn(
      '[scrape:factcheck] GOOGLE_FACT_CHECK_API_KEY not set — skipping API call ' +
        '(RSS feeds still run). Set the key in .env to enable ClaimReview indexing.',
    )
    return []
  }
  try {
    const pages = await fetchFactChecks({ apiKey, query: QUERY, languageCode: 'es', maxPages })
    return parseFactCheckResponse(pages)
  } catch (err) {
    console.warn(`[scrape:factcheck] API error: ${(err as Error).message.slice(0, 200)}`)
    return []
  }
}

async function fetchRssRows(): Promise<FactCheckRow[]> {
  const results = await Promise.all(
    RSS_FEEDS.map(async (feed) => {
      try {
        const res = await fetch(feed.url, {
          headers: { 'User-Agent': UA, Accept: 'application/rss+xml,application/xml;q=0.9' },
          redirect: 'follow',
        })
        if (!res.ok) {
          console.warn(`[scrape:factcheck] ${feed.reviewerName} RSS ${res.status} — skipping`)
          return []
        }
        const xml = await res.text()
        const rows = parseFactcheckRss(xml, {
          reviewerName: feed.reviewerName,
          reviewerSite: feed.reviewerSite,
        })
        if (rows.length > 0) {
          console.log(`[scrape:factcheck] ${feed.reviewerName} RSS · ${rows.length} matching rows`)
        }
        return rows
      } catch (err) {
        console.warn(
          `[scrape:factcheck] ${feed.reviewerName} RSS error: ${(err as Error).message}`,
        )
        return []
      }
    }),
  )
  return results.flat()
}

async function main() {
  const maxPages = Number(getFlag('--max-pages')) || 5
  const skipRss = process.argv.includes('--no-rss')
  console.log(
    `[scrape:factcheck] fetching API (up to ${maxPages} page(s)) for query ${QUERY}` +
      (skipRss ? ' · RSS skipped via --no-rss' : ' · plus Maldita + Newtral RSS feeds'),
  )

  const [apiRows, rssRows] = await Promise.all([
    fetchApiRows(maxPages),
    skipRss ? Promise.resolve([] as FactCheckRow[]) : fetchRssRows(),
  ])
  // API rows win on dedup — they carry the ClaimReview structured rating
  // which is more authoritative than our RSS category heuristic.
  const rows = mergeFactCheckRows(apiRows, rssRows)

  const byVerdict: Record<string, number> = {}
  const reviewers = new Set<string>()
  for (const row of rows) {
    byVerdict[row.normalizedVerdict] = (byVerdict[row.normalizedVerdict] || 0) + 1
    reviewers.add(row.reviewerName)
  }

  const sourceLabels = [
    apiRows.length > 0 ? 'Google Fact Check Tools API' : null,
    rssRows.length > 0 ? 'Maldita + Newtral RSS' : null,
  ].filter(Boolean)

  const snap: FactCheckSnapshot = {
    generatedAt: new Date().toISOString(),
    source: {
      url: API_BASE,
      query: QUERY,
      description:
        sourceLabels.length > 0
          ? `Indexed third-party reviews · ${sourceLabels.join(' + ')}`
          : 'No sources active (API key missing AND RSS feeds returned nothing)',
    },
    stats: {
      total: rows.length,
      reviewers: reviewers.size,
      byVerdict,
    },
    items: rows,
  }

  await write(snap)
  console.log(
    `[scrape:factcheck] wrote ${OUT} · ${rows.length} reviews · ${reviewers.size} fact-checkers ` +
      `(${Array.from(reviewers).slice(0, 4).join(', ')}${reviewers.size > 4 ? '…' : ''}) · ` +
      `api=${apiRows.length} rss=${rssRows.length}`,
  )
}

main().catch((err) => {
  console.error('[scrape:factcheck] failed:', err)
  process.exit(1)
})
