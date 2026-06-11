#!/usr/bin/env tsx
/**
 * Fetch 7 Spain-wide government / department data feeds and write
 * public/data/spain-ticker.json. Each source is fetched with its own
 * try/catch so an upstream outage never breaks the nightly scrape.
 *
 * Usage: npm run scrape:spain-ticker
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parsePvpc,
  parseCarburantesMunicipio,
  parseEcbSdmxObservations,
  parseInIpc,
  parseAemetAvisosHtml,
  parseDgtDatex2,
} from '../src/scraper/spain-ticker'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const OUT = join(PROJECT_ROOT, 'public/data/spain-ticker.json')

const UA = 'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) civic-tech ingestion'

// Riba-roja Minetur ID and province road codes for DGT filter.
const MINETUR_RIBA_ROJA = '7177'
const VALENCIA_ROADS = ['A-3', 'A-7', 'CV-35', 'V-30', 'V-31', 'V-11']

function todayMadrid(offsetDays = 0): string {
  // Build a Madrid-local YYYY-MM-DD using a deterministic format.
  const d = new Date(Date.now() + offsetDays * 86_400_000)
  const s = d.toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' })
  return s.slice(0, 10)
}

async function safeFetch(label: string, url: string, accept = 'application/json'): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: accept },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`)
  return res.text()
}

async function withSource<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T | { ok: false; error: string }> {
  try {
    return await fn()
  } catch (e: any) {
    console.warn(`[${label}] failed:`, e?.message || e)
    return { ok: false, error: String(e?.message || e) }
  }
}

async function fetchPvpc() {
  const today = todayMadrid()
  const yesterday = todayMadrid(-1)
  const mk = (d: string) =>
    `https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real?start_date=${d}T00:00&end_date=${d}T23:59&time_trunc=hour&geo_limit=peninsular&geo_ids=8741`
  const [raw, prevRaw] = await Promise.all([
    safeFetch('pvpc', mk(today)),
    safeFetch('pvpc-prev', mk(yesterday)).catch((e) => {
      // Degraded, not fatal: today's price still renders, but the
      // day-over-day delta will be null. Leave a trace in the nightly log.
      console.warn('[pvpc-prev] fetch failed — delta will be null:', e?.message || e)
      return ''
    }),
  ])
  return parsePvpc(raw, { previousDayRaw: prevRaw || undefined })
}

async function fetchCarburantes() {
  const raw = await safeFetch(
    'carburantes',
    `https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/FiltroMunicipio/${MINETUR_RIBA_ROJA}`,
  )
  return parseCarburantesMunicipio(raw)
}

async function fetchEuribor() {
  const raw = await safeFetch(
    'euribor',
    'https://data-api.ecb.europa.eu/service/data/FM/M.U2.EUR.RT.MM.EURIBOR1YD_.HSTA?lastNObservations=24',
    'application/vnd.sdmx.data+json;version=1.0.0-wd',
  )
  return parseEcbSdmxObservations(raw)
}

async function fetchBceMro() {
  const raw = await safeFetch(
    'bce-mro',
    'https://data-api.ecb.europa.eu/service/data/FM/D.U2.EUR.4F.KR.MRR_FR.LEV?lastNObservations=12',
    'application/vnd.sdmx.data+json;version=1.0.0-wd',
  )
  return parseEcbSdmxObservations(raw)
}

async function fetchIpc() {
  const raw = await safeFetch(
    'ipc',
    'https://servicios.ine.es/wstempus/js/ES/DATOS_SERIE/IPC251856?nult=12',
  )
  return parseInIpc(raw)
}

async function fetchAemet() {
  const raw = await safeFetch(
    'aemet',
    'https://www.aemet.es/es/eltiempo/prediccion/avisos?w=rss&p=46',
    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  )
  return parseAemetAvisosHtml(raw)
}

async function fetchDgt() {
  const raw = await safeFetch(
    'dgt',
    'https://nap.dgt.es/datex2/v3/dgt/SituationPublication/datex2_v36.xml',
    'application/xml,text/xml,*/*',
  )
  return parseDgtDatex2(raw, { roads: VALENCIA_ROADS })
}

async function main() {
  console.log('[spain-ticker] fetching 7 sources in parallel…')
  const [luz, gas, euribor12m, bceMRO, ipc, aemet, dgt] = await Promise.all([
    withSource('luz', fetchPvpc),
    withSource('gas', fetchCarburantes),
    withSource('euribor12m', fetchEuribor),
    withSource('bceMRO', fetchBceMro),
    withSource('ipc', fetchIpc),
    withSource('aemet', fetchAemet),
    withSource('dgt', fetchDgt),
  ])

  const payload = {
    generatedAt: new Date().toISOString(),
    sources: {
      luz,
      gasolina: gas, // exposes both gasolina95 + diesel fields
      euribor12m,
      bceMRO,
      ipc,
      aemet,
      dgt,
    },
  }

  const okCount = Object.values(payload.sources).filter((s: any) => s?.ok).length
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
  console.log(`[spain-ticker] wrote ${OUT}`)
  console.log(`[spain-ticker] ${okCount}/7 sources OK`)
}

main().catch((err) => {
  console.error('[spain-ticker] fatal:', err)
  process.exit(1)
})
