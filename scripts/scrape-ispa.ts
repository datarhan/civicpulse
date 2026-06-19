#!/usr/bin/env tsx
/**
 * Build public/data/ispa.json — the Riba-roja de Túria elected-official
 * retribuciones from ISPA (Ministerio de Hacienda y Función Pública), across
 * every published year, for the salary distribution + the year-to-year trend.
 *
 * ISPA publishes one Excel per cargo type per edition (ispaYYYY covers data for
 * the prior year). Councillor rows are ANONYMISED (dedicación + amount, no
 * name) — see src/scraper/ispa.ts. We download the alcaldes + concejales sheets
 * for each year, extract Riba-roja, and summarise.
 *
 * Usage: npm run scrape:ispa
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'
import { extractMunicipioEntries, summarize, type IspaEntry } from '../src/scraper/ispa'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const OUT = join(__dirname, '..', 'public/data/ispa.json')

const UA = 'Mozilla/5.0 (compatible; CivicPulse/0.1; +https://github.com/datarhan/civicpulse)'
const ROOT = 'https://digital.gob.es/content/dam/portal-mtdfp/funcion-publica/dgfp/ispa'
const MUNI = 'Riba-roja de Túria'
const RETRIB_YEARS = [2019, 2020, 2021, 2022, 2023, 2024]

async function fetchRows(year: number, file: string): Promise<Record<string, unknown>[] | null> {
  // ISPA edition naming flips between `ispa_<ed>` and `ispa<ed>` across years.
  const ed = year + 1
  for (const dir of [`ispa${ed}`, `ispa_${ed}`]) {
    const url = `${ROOT}/${dir}/retrib_${year}/${file}`
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(60_000),
      })
      if (!res.ok) continue
      const wb = XLSX.read(Buffer.from(await res.arrayBuffer()), { type: 'buffer' })
      return XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], {
        defval: '',
      })
    } catch {
      /* try next convention */
    }
  }
  return null
}

async function main() {
  const years: Array<{
    year: number
    alcalde: IspaEntry | null
    concejales: IspaEntry[]
    summary: ReturnType<typeof summarize>
  }> = []

  for (const year of RETRIB_YEARS) {
    const [alcRows, conRows] = await Promise.all([
      fetchRows(year, 'retribuciones_alcaldes.xlsx'),
      fetchRows(year, 'retribuciones_concejales.xlsx'),
    ])
    if (!alcRows && !conRows) {
      console.warn(`[ispa] ${year}: no files`)
      continue
    }
    const alcalde = alcRows ? (extractMunicipioEntries(alcRows, MUNI)[0] ?? null) : null
    const concejales = conRows ? extractMunicipioEntries(conRows, MUNI) : []
    // Election years (2019, 2023) publish BOTH the outgoing and incoming
    // corporation in one sheet → ~40 anonymous councillor rows + a split/odd
    // alcalde figure. The 21-seat corporation has ~20 concejal rows in a clean
    // year; anything well outside that is the doubled election-year data, which
    // we drop rather than mis-report a halved/averaged salary.
    if (concejales.length < 12 || concejales.length > 26) {
      console.warn(
        `[ispa] ${year}: ${concejales.length} concejal rows (election-year/anomalous) — skipped`,
      )
      continue
    }
    const summary = summarize([...(alcalde ? [alcalde] : []), ...concejales])
    years.push({ year, alcalde, concejales, summary })
    console.log(
      `[ispa] ${year}: alcalde=${alcalde?.amountEuros ?? '—'} · ${concejales.length} concejales · total=${summary.totalAnnualEuros}`,
    )
  }

  if (years.length === 0) {
    console.error('[ispa] no ISPA years resolved — refusing to overwrite ispa.json')
    process.exit(1)
  }

  years.sort((a, b) => a.year - b.year)
  const latestYear = years[years.length - 1].year
  const alcaldeTrend = years
    .filter((y) => y.alcalde)
    .map((y) => ({ year: y.year, amountEuros: y.alcalde!.amountEuros }))

  const payload = {
    generatedAt: new Date().toISOString(),
    source: {
      name: 'ISPA · Ministerio de Hacienda y Función Pública',
      home: 'https://funcionpublica.digital.gob.es/funcion-publica/ispa.html',
      note: 'Retribuciones de cargos electos de las Entidades Locales. Las filas de concejales son anónimas (dedicación + importe, sin nombre); solo el alcalde es identificable como titular del cargo.',
    },
    municipality: MUNI,
    latestYear,
    alcaldeTrend,
    years,
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
  console.log(`[ispa] wrote ${OUT} — ${years.length} year(s), latest ${latestYear}`)
}

main().catch((err) => {
  console.error('[ispa] failed:', err)
  process.exit(1)
})
