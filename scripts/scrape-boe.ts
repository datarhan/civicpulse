#!/usr/bin/env tsx
/**
 * Pull BOE (Boletín Oficial del Estado) entries mentioning Riba-roja
 * over the last N days (default 30) and write public/data/boe.json.
 *
 * Free open-data API. The lab's verifier cross-references claims
 * citing "ordenanza" / "decreto" / "resolución" against this snapshot
 * — BOE is the authoritative gazette for municipal actos administrativos
 * that the regular tender feeds miss (expropiaciones, convenios,
 * subvenciones nominativas, sanciones, planes generales).
 *
 * Usage:
 *   npm run scrape:boe                # last 30 days
 *   npm run scrape:boe -- --days 60   # custom window
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { type BoeSnapshot } from '../src/scraper/boe'
import { fetchBoeRows } from '../src/scraper/boe-fetch'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const OUT = join(PROJECT_ROOT, 'public/data/boe.json')

function getFlag(name: string): string | null {
  const i = process.argv.indexOf(name)
  if (i < 0) return null
  return process.argv[i + 1] ?? null
}

async function main() {
  const days = Number(getFlag('--days')) || 30
  console.log(`[scrape:boe] walking last ${days} day(s) of BOE for Riba-roja matches`)
  const { rows, daysFetched, daysWithMatches, daysFailed, daysRequested } = await fetchBoeRows({
    days,
  })

  const byDepartamento: Record<string, number> = {}
  for (const r of rows) {
    const key = r.departamento || 'desconocido'
    byDepartamento[key] = (byDepartamento[key] || 0) + 1
  }

  const snap: BoeSnapshot = {
    generatedAt: new Date().toISOString(),
    source: {
      url: 'https://www.boe.es/datosabiertos/api/boe/sumario/{YYYYMMDD}',
      matchPattern: 'riba-roja | ribarroja | ribaroja (case-insensitive)',
      description:
        'BOE official daily gazette — open-data JSON. Matches Ayuntamiento + tribunal + GVA references to the municipality.',
    },
    stats: {
      daysFetched,
      daysWithMatches,
      daysFailed,
      daysRequested,
      total: rows.length,
      byDepartamento,
    },
    items: rows,
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(snap, null, 2) + '\n')

  console.log(
    `[scrape:boe] wrote ${OUT} · daysFetched=${daysFetched}` +
      ` · daysWithMatches=${daysWithMatches}` +
      ` · total=${rows.length}` +
      (rows.length > 0 ? ` · latest=${rows[0].publicacionDate.slice(0, 10)}` : ''),
  )
}

main().catch((err) => {
  console.error('[scrape:boe] failed:', err)
  process.exit(1)
})
