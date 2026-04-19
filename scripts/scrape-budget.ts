#!/usr/bin/env tsx
/**
 * Scrape the latest CONPREL budget XLS for Comunitat Valenciana and
 * extract Riba-roja's snapshot.
 *
 *   Output: public/data/budget.json
 *
 * CONPREL publishes annual budget XLS files; the latest definitively
 * published year is requested first. On a 404 we fall back to the
 * previous year and mark the JSON's `year` accordingly.
 *
 * Usage: npm run scrape:budget
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseConprelBudget, type BudgetSnapshot } from '../src/scraper/budget'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')

const INE_CODE = '46214' // Riba-roja de Túria
const CCAA_ID = 17 // Comunitat Valenciana
const OUT = join(PROJECT_ROOT, 'public/data/budget.json')

const CANDIDATE_YEARS = [2025, 2024, 2023]

function conprelUrl(year: number): string {
  return (
    'https://serviciostelematicosext.hacienda.gob.es/SGFAL/CONPREL/Consulta/DescargaFichero' +
    `?CCAA=${CCAA_ID}&TipoDato=Presupuestos&Ejercicio=${year}&TipoPublicacion=Definitiva`
  )
}

async function tryYear(year: number): Promise<BudgetSnapshot | null> {
  const url = conprelUrl(year)
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) civic-tech ingestion',
      Accept: 'application/vnd.ms-excel,application/octet-stream,*/*',
    },
  })
  if (!res.ok) {
    console.warn(`[budget] ${year}: HTTP ${res.status}, skipping`)
    return null
  }
  const buf = Buffer.from(await res.arrayBuffer())
  // MinHac returns an HTML error page with 200 when the requested year
  // hasn't been published yet. Detect by sniffing the magic bytes.
  if (!buf.slice(0, 4).includes(0xd0) && !buf.slice(0, 4).toString().startsWith('PK')) {
    if (buf.slice(0, 15).toString().includes('<!DOCTYPE')) {
      console.warn(`[budget] ${year}: server returned HTML (not yet published)`)
      return null
    }
  }
  const snapshot = parseConprelBudget(buf, { ineCode: INE_CODE, year })
  if (!snapshot) {
    console.warn(`[budget] ${year}: INE ${INE_CODE} not found in XLS`)
    return null
  }
  return snapshot
}

async function main() {
  let latest: BudgetSnapshot | null = null
  for (const year of CANDIDATE_YEARS) {
    console.log(`[budget] trying year ${year}…`)
    latest = await tryYear(year)
    if (latest) break
  }
  if (!latest) {
    throw new Error('No CONPREL year returned data for INE ' + INE_CODE)
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: latest.source,
    kind: 'presupuesto-inicial',
    snapshot: latest,
  }
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
  console.log(`[budget] wrote ${OUT}`)
  console.log(
    `[budget] ${latest.year} total: €${latest.totalRevenue.toLocaleString('es-ES')} ingresos / ` +
      `€${latest.totalExpense.toLocaleString('es-ES')} gastos`
  )
}

main().catch((err) => {
  console.error('[budget] failed:', err)
  process.exit(1)
})
