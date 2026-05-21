#!/usr/bin/env tsx
/**
 * Pull third-party fact-checks that touch Riba-roja from the Google
 * Fact Check Tools API and write public/data/factcheck.json.
 *
 * Auth: requires GOOGLE_FACT_CHECK_API_KEY env var (free tier). When
 * the key is absent, writes an empty snapshot with a note so the
 * /laboratorio page shows an honest empty-state and the nightly chain
 * keeps moving.
 *
 * Usage:
 *   npm run scrape:factcheck                   # default query
 *   npm run scrape:factcheck -- --max-pages 2  # cap pagination
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  fetchFactChecks,
  parseFactCheckResponse,
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

function emptySnapshot(reason: string): FactCheckSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    source: {
      url: API_BASE,
      query: QUERY,
      description: `Google Fact Check Tools API · ${reason}`,
    },
    stats: { total: 0, reviewers: 0, byVerdict: {} },
    items: [],
  }
}

async function write(payload: FactCheckSnapshot): Promise<void> {
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
}

async function main() {
  const apiKey = process.env.GOOGLE_FACT_CHECK_API_KEY
  if (!apiKey) {
    console.warn(
      '[scrape:factcheck] GOOGLE_FACT_CHECK_API_KEY not set; writing empty snapshot ' +
        'and continuing. Add the key to .env to enable the third-party fact-check feed.',
    )
    await write(emptySnapshot('GOOGLE_FACT_CHECK_API_KEY not set'))
    return
  }

  const maxPages = Number(getFlag('--max-pages')) || 5
  console.log(`[scrape:factcheck] fetching up to ${maxPages} page(s) for query ${QUERY}`)

  let rows: Awaited<ReturnType<typeof parseFactCheckResponse>> = []
  try {
    const pages = await fetchFactChecks({
      apiKey,
      query: QUERY,
      languageCode: 'es',
      maxPages,
    })
    rows = parseFactCheckResponse(pages)
  } catch (err) {
    console.warn(
      `[scrape:factcheck] API error — writing empty snapshot. Reason: ${(err as Error).message}`,
    )
    await write(emptySnapshot(`API error: ${(err as Error).message.slice(0, 200)}`))
    return
  }

  const byVerdict: Record<string, number> = {}
  const reviewers = new Set<string>()
  for (const row of rows) {
    byVerdict[row.normalizedVerdict] = (byVerdict[row.normalizedVerdict] || 0) + 1
    reviewers.add(row.reviewerName)
  }

  const snap: FactCheckSnapshot = {
    generatedAt: new Date().toISOString(),
    source: {
      url: API_BASE,
      query: QUERY,
      description: 'Google Fact Check Tools API · indexed third-party reviews',
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
      `(${Array.from(reviewers).slice(0, 4).join(', ')}${reviewers.size > 4 ? '…' : ''})`,
  )
}

main().catch((err) => {
  console.error('[scrape:factcheck] failed:', err)
  process.exit(1)
})
