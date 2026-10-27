#!/usr/bin/env tsx
/**
 * Walk SEPE's monthly municipal XLS feeds (for 20-45k municipalities),
 * extract Riba-roja's registered-unemployment totals per month for the
 * last ~24 months, and write public/data/paro.json.
 *
 * The walk itself lives in src/scraper/paro-fetch.ts; this file only reads
 * the published snapshot (a month the walk cannot read keeps its row from it)
 * and decides whether to write and with what exit code.
 *
 * Usage: npm run scrape:paro
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ParoSnapshot } from '../src/scraper/paro'
import { construirParo } from '../src/scraper/paro-fetch'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const OUT = join(PROJECT_ROOT, 'public/data/paro.json')

async function leerPrevio(): Promise<ParoSnapshot[] | null> {
  let texto: string
  try {
    texto = await readFile(OUT, 'utf8')
  } catch {
    return null // no snapshot yet: nothing to keep a month from
  }
  try {
    const prev = JSON.parse(texto) as { series?: unknown }
    if (Array.isArray(prev.series)) return prev.series as ParoSnapshot[]
  } catch {
    /* falls through to the warning */
  }
  // Said out loud: without it, a month this run cannot read drops out again.
  console.warn(`[paro] ${OUT} has no readable series — a month not read this run will be missing`)
  return null
}

async function main() {
  const r = await construirParo({ previo: await leerPrevio() })
  if (r.ok === false) {
    console.error(`[paro] ${r.motivo}`)
    process.exit(1)
  }
  const s = r.payload.stats
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(r.payload, null, 2) + '\n')
  console.log(
    `[paro] wrote ${OUT} — ${r.payload.series.length} months ` +
      `(${s.leidos}/${s.mesesRecorridos} read this run, ${s.arrastrados.length} kept from the ` +
      `previous snapshot, ${s.fueraDeLaSerie.length} without a row)`,
  )
}

main().catch((err) => {
  console.error('[paro] failed:', err)
  process.exit(1)
})
