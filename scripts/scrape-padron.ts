#!/usr/bin/env tsx
/**
 * Fetch the INE Tempus3 Valencia population CSV (table 2903) and extract
 * Riba-roja's 30-year Padrón series into public/data/padron.json.
 *
 * Usage: npm run scrape:padron
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseInePadron } from '../src/scraper/padron'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const OUT = join(PROJECT_ROOT, 'public/data/padron.json')

const INE_CODE = '46214' // Riba-roja de Túria, province 46
const TABLE_ID = 2903 // Valencia province population by municipality
const SOURCE = `https://www.ine.es/jaxiT3/files/t/es/csv_bd/${TABLE_ID}.csv?nocab=1`

async function main() {
  console.log(`[padron] fetching ${SOURCE}`)
  const res = await fetch(SOURCE, {
    headers: {
      'User-Agent': 'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) civic-tech ingestion',
      Accept: 'text/csv,text/plain',
    },
  })
  if (!res.ok) throw new Error(`INE returned ${res.status} ${res.statusText}`)
  const csv = await res.text()

  const series = parseInePadron(csv, { ineCode: INE_CODE })
  if (!series) throw new Error(`INE code ${INE_CODE} not found in table ${TABLE_ID}`)

  // Derive convenience numbers.
  const firstYear = series.total[0]?.year
  const first = series.total[0]?.value ?? 0
  const latest = series.latestTotal
  const decadeIdx = series.total.findIndex((p) => p.year === series.latestYear - 10)
  const decadeAgo = decadeIdx >= 0 ? series.total[decadeIdx].value : first
  const growth10y = decadeAgo > 0 ? ((latest - decadeAgo) / decadeAgo) * 100 : 0

  const payload = {
    generatedAt: new Date().toISOString(),
    source: SOURCE,
    ineCode: INE_CODE,
    name: series.name,
    latestYear: series.latestYear,
    latestTotal: latest,
    coverage: { fromYear: firstYear, toYear: series.latestYear, years: series.total.length },
    growth: {
      decadePct: Number(growth10y.toFixed(2)),
      absSinceFirst: latest - first,
    },
    series,
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
  console.log(`[padron] wrote ${OUT}`)
  console.log(
    `[padron] ${series.name.trim()} ${series.latestYear}: ${latest.toLocaleString('es-ES')} hab. (+${growth10y.toFixed(1)}% 10y)`,
  )
}

main().catch((err) => {
  console.error('[padron] failed:', err)
  process.exit(1)
})
