/**
 * Downloads every year's Consell de Transparència CV table, parses
 * it, filters for Riba-roja mentions, writes public/data/consell-cv.json.
 * Idempotent.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  buildSnapshot,
  CONSELL_CV_TABLES,
  DEFAULT_ALIASES,
  parseConsellTable,
  type ConsellEntry,
} from '../src/scraper/consell-cv.ts'
import { withRetry, isTransientFetchError } from '../src/scraper/retry.ts'

const UA = 'CivicPulse Riba-roja · contact: https://github.com/datarhan/civicpulse'
const OUT = resolve(process.cwd(), 'public/data/consell-cv.json')

async function fetchYearOnce({
  year,
  url,
}: {
  year: number
  url: string
}): Promise<ConsellEntry[]> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
  const buf = Buffer.from(await res.arrayBuffer())
  return parseConsellTable(buf, year)
}

/**
 * A year either yields its rows or is reported as unknown. A network-level
 * `TypeError: fetch failed` used to escape main() and exit(1), reddening the
 * whole nightly run on one flaky GVA request (2026-07-31), while an HTTP
 * error silently degraded to zero rows — two different outcomes for the same
 * condition. Both now retry, then report the year as failed.
 */
async function fetchYear(t: { year: number; url: string }): Promise<ConsellEntry[] | null> {
  console.log(`[consell-cv] fetching ${t.year} · ${t.url.slice(0, 80)}…`)
  try {
    return await withRetry(() => fetchYearOnce(t), {
      retries: 2,
      shouldRetry: isTransientFetchError,
      onRetry: (err, attempt) =>
        console.warn(
          `[consell-cv] ${t.year} attempt ${attempt + 1} failed (${(err as Error).message}) — retrying…`,
        ),
    })
  } catch (err) {
    console.warn(`[consell-cv] WARN ${t.year} unreachable after retries: ${(err as Error).message}`)
    return null
  }
}

async function main() {
  const all: ConsellEntry[] = []
  const failed: number[] = []

  for (const t of CONSELL_CV_TABLES) {
    const entries = await fetchYear(t)
    if (entries === null) {
      failed.push(t.year)
      continue
    }
    console.log(`[consell-cv] ${t.year}: ${entries.length} rows`)
    all.push(...entries)
  }

  // Writing a snapshot built from only the years that answered would delete
  // the missing year's resoluciones from the published file — the same
  // silent data loss that blanked the press feed on 2026-07-30. The tables
  // are historical and near-static, so skipping a refresh costs nothing
  // while a truncated write costs real rows.
  if (failed.length > 0) {
    console.error(
      `[consell-cv] ${failed.length}/${CONSELL_CV_TABLES.length} year(s) unreachable ` +
        `(${failed.join(', ')}) — keeping the previous snapshot rather than publishing a partial one.`,
    )
    process.exit(1)
  }

  const snap = buildSnapshot(all, DEFAULT_ALIASES)
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(snap, null, 2))
  console.log(
    `[consell-cv] total=${snap.stats.totalEntries} matched=${snap.stats.matchedEntries} years=${snap.stats.years.length} → ${OUT}`,
  )
}

main().catch((err) => {
  console.error('[consell-cv] fatal:', err)
  process.exit(1)
})
