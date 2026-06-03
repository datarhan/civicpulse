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

const UA = 'CivicPulse Riba-roja · contact: https://github.com/datarhan/civicpulse'
const OUT = resolve(process.cwd(), 'public/data/consell-cv.json')

async function fetchYear({ year, url }: { year: number; url: string }): Promise<ConsellEntry[]> {
  console.log(`[consell-cv] fetching ${year} · ${url.slice(0, 80)}…`)
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) {
    console.warn(`[consell-cv] ${year} fetch failed: ${res.status} ${res.statusText}`)
    return []
  }
  const buf = Buffer.from(await res.arrayBuffer())
  return parseConsellTable(buf, year)
}

async function main() {
  const all: ConsellEntry[] = []
  for (const t of CONSELL_CV_TABLES) {
    const entries = await fetchYear(t)
    console.log(`[consell-cv] ${t.year}: ${entries.length} rows`)
    all.push(...entries)
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
