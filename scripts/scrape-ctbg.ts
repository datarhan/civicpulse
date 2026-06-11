/**
 * Downloads the CTBG Resoluciones de ámbito estatal XLSX, scans for any
 * resolución that mentions Riba-roja / Ribarroja (either orthography)
 * and writes public/data/ctbg.json.
 *
 * Idempotent, no state. Safe to re-run.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  buildSnapshot,
  CTBG_XLSX_URL,
  DEFAULT_ALIASES,
  parseCtbgWorkbook,
} from '../src/scraper/ctbg.ts'

const UA = 'CivicPulse Riba-roja · contact: https://github.com/datarhan/civicpulse'
const OUT = resolve(process.cwd(), 'public/data/ctbg.json')

async function main() {
  console.log(`[ctbg] fetching ${CTBG_XLSX_URL}`)
  // ~10 MB workbook — generous but bounded so a stall can't hang the chain.
  const res = await fetch(CTBG_XLSX_URL, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(120_000),
  })
  if (!res.ok) {
    throw new Error(`CTBG XLSX fetch failed: ${res.status} ${res.statusText}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  const entries = parseCtbgWorkbook(buf)
  const snap = buildSnapshot(entries, DEFAULT_ALIASES)
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(snap, null, 2))
  console.log(
    `[ctbg] total=${snap.stats.totalEntries} matched=${snap.stats.matchedEntries} years=${snap.stats.years.length} → ${OUT}`,
  )
}

main().catch((err) => {
  console.error('[ctbg] fatal:', err)
  process.exit(1)
})
