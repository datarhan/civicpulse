#!/usr/bin/env tsx
/**
 * Walk SEPE's monthly municipal XLS feeds (for 20-45k municipalities),
 * extract Riba-roja's registered-unemployment totals per month for the
 * last ~24 months, and write public/data/paro.json.
 *
 * The walk itself lives in src/scraper/paro-fetch.ts; this file only decides
 * whether to write and with what exit code.
 *
 * Usage: npm run scrape:paro
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { construirParo } from '../src/scraper/paro-fetch'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const OUT = join(PROJECT_ROOT, 'public/data/paro.json')

async function main() {
  const r = await construirParo()
  if (r.ok === false) {
    console.error(`[paro] ${r.motivo}`)
    process.exit(1)
  }
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(r.payload, null, 2) + '\n')
  console.log(`[paro] wrote ${OUT} — ${r.payload.series.length} months`)
}

main().catch((err) => {
  console.error('[paro] failed:', err)
  process.exit(1)
})
