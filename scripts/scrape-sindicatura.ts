#!/usr/bin/env tsx
/**
 * Sindicatura de Comptes de la Comunitat Valenciana — the regional audit court's
 * fiscalización reports that name Riba-roja de Túria. The ex-post accountability
 * pillar next to Síndic de Greuges + CTBG on /quejas.
 *
 * Fetches the `/informes` search (indexes PDF content), keeps the reports whose
 * TITLE names the town (dedicated audits) + the local-entity sector sweeps where
 * it's a genuine subject, and records the rest as a count. Idempotent;
 * best-effort in scrape-all.
 *
 * Usage: npm run scrape:sindicatura
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseSindicaturaSearch,
  isLocalEntityReport,
  type SindicaturaReport,
} from '../src/scraper/sindicatura'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')
const OUT = join(PROJECT_ROOT, 'public/data/sindicatura.json')

const QUERY = 'Riba-roja de Túria'
const SEARCH_URL = `https://www.sindicom.gva.es/informes?text=${encodeURIComponent(QUERY)}&type=full`
const UA =
  'Mozilla/5.0 (Macintosh) CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) civic-tech'
const SECTORAL_CAP = 15

const byYearDesc = (a: SindicaturaReport, b: SindicaturaReport) => b.year - a.year

async function main() {
  const res = await fetch(SEARCH_URL, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`${SEARCH_URL} -> HTTP ${res.status}`)
  const html = await res.text()

  const all = parseSindicaturaSearch(html)
  const dedicated = all.filter((r) => r.scope === 'dedicated').sort(byYearDesc)
  const sectoralAll = all.filter((r) => r.scope === 'sectoral')
  const sectoral = sectoralAll.filter((r) => isLocalEntityReport(r.title)).sort(byYearDesc)

  const payload = {
    generatedAt: new Date().toISOString(),
    note: 'Informes de fiscalización de la Sindicatura de Comptes de la Comunitat Valenciana que nombran a Riba-roja de Túria. «dedicated» = auditoría específica del ayuntamiento; «sectoral» = barridos de entidades locales donde el municipio es sujeto auditado.',
    source: {
      platform: 'Sindicatura de Comptes de la Comunitat Valenciana',
      portal: 'https://www.sindicom.gva.es',
      search: SEARCH_URL,
    },
    query: QUERY,
    dedicated,
    sectoral: sectoral.slice(0, SECTORAL_CAP),
    stats: {
      dedicated: dedicated.length,
      sectoral: Math.min(sectoral.length, SECTORAL_CAP),
      sectoralRelevant: sectoral.length,
      sectoralTotal: sectoralAll.length,
    },
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
  console.log(
    `[sindicatura] wrote ${dedicated.length} dedicated + ${payload.sectoral.length}/${sectoral.length} sectoral (of ${sectoralAll.length} total mentions) → ${OUT}`,
  )
  for (const d of dedicated) console.log(`  · [${d.year}] ${d.title.slice(0, 80)}`)
}

main().catch((err) => {
  console.error('[sindicatura] failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
