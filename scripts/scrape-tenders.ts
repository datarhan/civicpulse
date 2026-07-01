#!/usr/bin/env tsx
/**
 * Fetch Riba-roja's live tender and contract data from Gobierto's
 * SQL-over-HTTP API and write public/data/tenders.json.
 *
 * Usage: npm run scrape:tenders
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseRibalicitaContracts,
  parseRibalicitaTenders,
  type Contract,
  type Tender,
} from '../src/scraper/tenders'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const OUT = join(PROJECT_ROOT, 'public/data/tenders.json')

const CONTRACTS_URL =
  'https://ribalicita.ribarroja.es/api/v1/data/data.csv?sql=' +
  encodeURIComponent('select * from contratos')
const TENDERS_URL =
  'https://ribalicita.ribarroja.es/api/v1/data/data.csv?sql=' +
  encodeURIComponent('select * from licitaciones')

async function fetchCsv(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) civic-tech ingestion',
      Accept: 'text/csv',
    },
    // The full contratos CSV is a few MB — generous but bounded.
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
  return res.text()
}

function topOpenTenders(list: Tender[], n: number): Tender[] {
  return list.filter((t) => t.status === 'open').slice(0, n)
}

function topRecentAwardedContracts(list: Contract[], n: number): Contract[] {
  return [...list]
    .filter((c) => c.status === 'awarded' && c.finalAmount > 0)
    .sort((a, b) => {
      const ad = a.awardDate ? new Date(a.awardDate).getTime() : 0
      const bd = b.awardDate ? new Date(b.awardDate).getTime() : 0
      return bd - ad
    })
    .slice(0, n)
}

async function main() {
  console.log('[tenders] fetching contratos…')
  const contractsCsv = await fetchCsv(CONTRACTS_URL)
  console.log('[tenders] fetching licitaciones…')
  const tendersCsv = await fetchCsv(TENDERS_URL)

  const contracts = parseRibalicitaContracts(contractsCsv)
  const tenders = parseRibalicitaTenders(tendersCsv)

  // Sin IVA — matches the PLACSP "Importe de adjudicación" headline (the
  // tax-excluded figure) and Spanish valor-estimado convention. Falls back to
  // the tax-included finalAmount only when a row lacks the sin-IVA value.
  const awardedTotal = contracts
    .filter((c) => c.status === 'awarded')
    .reduce((s, c) => s + (c.finalAmountNoTaxes > 0 ? c.finalAmountNoTaxes : c.finalAmount || 0), 0)

  const payload = {
    generatedAt: new Date().toISOString(),
    source: {
      contracts: CONTRACTS_URL,
      tenders: TENDERS_URL,
      platform: 'Gobierto',
      host: 'https://ribalicita.ribarroja.es',
    },
    stats: {
      totalContracts: contracts.length,
      totalTenders: tenders.length,
      awardedContracts: contracts.filter((c) => c.status === 'awarded').length,
      openTenders: tenders.filter((t) => t.status === 'open').length,
      awardedTotalEuros: awardedTotal,
    },
    top: {
      recentAwarded: topRecentAwardedContracts(contracts, 12),
      openTenders: topOpenTenders(tenders, 12),
    },
    contracts,
    tenders,
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
  console.log(`[tenders] wrote ${OUT}`)
  console.log(
    `[tenders] ${contracts.length} contracts (${payload.stats.awardedContracts} awarded, € ${awardedTotal
      .toFixed(0)
      .replace(
        /\B(?=(\d{3})+(?!\d))/g,
        '.',
      )}), ${tenders.length} tenders (${payload.stats.openTenders} open)`,
  )
}

main().catch((err) => {
  console.error('[tenders] failed:', err)
  process.exit(1)
})
