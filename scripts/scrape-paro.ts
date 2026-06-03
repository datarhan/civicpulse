#!/usr/bin/env tsx
/**
 * Walk SEPE's monthly municipal XLS feeds (for 20-45k municipalities),
 * extract Riba-roja's registered-unemployment totals per month for the
 * last ~24 months, and write public/data/paro.json.
 *
 * Usage: npm run scrape:paro
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSepeParoMonth, type ParoSnapshot } from '../src/scraper/paro'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const OUT = join(PROJECT_ROOT, 'public/data/paro.json')

const MUNI = 'Riba-roja de Túria'
const MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

function candidateUrl(year: number, monthIdx: number): string {
  const m = MONTHS_ES[monthIdx]
  return (
    `https://sepe.es/SiteSepe/contenidos/que_es_el_sepe/estadisticas/` +
    `datos_estadisticos/municipios_20_45/${year}/${m}_${year}/` +
    `Muniacteco_20-45_COM.VALENCIANA.xls`
  )
}

async function tryMonth(year: number, monthIdx: number): Promise<ParoSnapshot | null> {
  const url = candidateUrl(year, monthIdx)
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) civic-tech ingestion',
      Accept: 'application/vnd.ms-excel,application/octet-stream,*/*',
    },
  })
  if (!res.ok) return null
  const ct = res.headers.get('content-type') || ''
  if (!/excel|octet|msword/.test(ct) && res.headers.get('content-length') === '0') return null
  const buf = Buffer.from(await res.arrayBuffer())
  // SEPE XLS starts with D0 CF 11 E0 (CDFV2); anything else is the nav page
  if (buf[0] !== 0xd0 || buf[1] !== 0xcf) return null
  const period = `${year}-${String(monthIdx + 1).padStart(2, '0')}`
  return parseSepeParoMonth(buf, { municipio: MUNI, period })
}

async function main() {
  const now = new Date()
  const results: ParoSnapshot[] = []
  // Walk back 24 months from now.
  for (let back = 0; back < 24; back++) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1)
    const snap = await tryMonth(d.getFullYear(), d.getMonth())
    if (snap) {
      results.push(snap)
      console.log(`[paro] ${snap.period}: ${snap.total} total (${snap.men}H / ${snap.women}M)`)
    }
  }
  results.sort((a, b) => a.period.localeCompare(b.period))

  const payload = {
    generatedAt: new Date().toISOString(),
    source: {
      platform: 'SEPE Muniacteco 20-45',
      pattern:
        'https://sepe.es/SiteSepe/…/municipios_20_45/<YEAR>/<MES>_<YEAR>/Muniacteco_20-45_COM.VALENCIANA.xls',
    },
    municipio: MUNI,
    latestPeriod: results[results.length - 1]?.period ?? null,
    latestTotal: results[results.length - 1]?.total ?? null,
    series: results,
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
  console.log(`[paro] wrote ${OUT} — ${results.length} months`)
}

main().catch((err) => {
  console.error('[paro] failed:', err)
  process.exit(1)
})
