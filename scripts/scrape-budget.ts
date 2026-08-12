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
import {
  parseConprelBudget,
  parseConprelRoster,
  type BudgetSnapshot,
  type ConprelMunicipio,
} from '../src/scraper/budget'

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

/** Banda de comparación, el mismo conjunto committeado que usa /eficiencia. */
const CONJUNTO = 'cv-15k-40k'
const POP_MIN = 15_000
const POP_MAX = 40_000

let bandaDelUltimo: ConprelMunicipio[] = []

async function tryYear(year: number): Promise<BudgetSnapshot | null> {
  const url = conprelUrl(year)
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) civic-tech ingestion',
      Accept: 'application/vnd.ms-excel,application/octet-stream,*/*',
    },
    // CONPREL XLS download — generous but bounded.
    signal: AbortSignal.timeout(120_000),
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
  // Del mismo fichero sale la banda de municipios comparables: el gasto por
  // habitante no significa nada suelto, y descargarlo aparte sería pedir dos
  // veces lo mismo.
  bandaDelUltimo = parseConprelRoster(buf).filter(
    (m) => m.poblacion >= POP_MIN && m.poblacion <= POP_MAX && m.gastoTotal > 0,
  )
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
    pares: {
      conjunto: CONJUNTO,
      criterios: { ccaa: CCAA_ID, popMin: POP_MIN, popMax: POP_MAX },
      anio: latest.year,
      miembros: bandaDelUltimo
        .filter((m) => m.ine !== INE_CODE)
        .map((m) => ({
          ine: m.ine,
          nombre: m.nombre,
          poblacion: m.poblacion,
          gastoPorHabitante: m.gastoTotal / m.poblacion,
        }))
        .sort((a, b) => a.ine.localeCompare(b.ine)),
    },
  }
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
  console.log(`[budget] wrote ${OUT}`)
  console.log(`[budget] banda ${CONJUNTO}: ${payload.pares.miembros.length} municipios comparables`)
  console.log(
    `[budget] ${latest.year} total: €${latest.totalRevenue.toLocaleString('es-ES')} ingresos / ` +
      `€${latest.totalExpense.toLocaleString('es-ES')} gastos`,
  )
}

main().catch((err) => {
  console.error('[budget] failed:', err)
  process.exit(1)
})
