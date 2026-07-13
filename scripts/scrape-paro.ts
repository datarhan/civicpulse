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

// SEPE's sepe.es host intermittently drops the TLS handshake — undici's
// default 10s connectTimeout then fires as ConnectTimeoutError BEFORE the
// per-download AbortSignal below ever applies. A single such hiccup on any one
// of the 24 months used to throw straight up through main() → exit(1) and red
// the whole nightly (and skip that night's deploy). Retry transient network
// errors a few times with backoff so one slow handshake doesn't lose the
// month. The parser's "0/24 months → exit 1, keep yesterday's snapshot" guard
// in main() stays the real failure backstop, so a genuine SEPE outage still
// reds the run — it is never silently masked.
const FETCH_ATTEMPTS = 3
// Consecutive months failing at the NETWORK level (never an HTTP status —
// a not-yet-published month 404s and must not count) that abort the walk.
// When SEPE blackholes the caller's IP range (GitHub-runner IPs since
// 2026-07-11), all 24 months fail identically; retrying each one used to
// burn ~15 min of the nightly's 20-min budget, the job timed out CANCELLED,
// and the !cancelled() commit step threw away every other adapter's fresh
// data. Three same-shaped failures in a row are proof the host is
// unreachable, not that a month is missing — stop paying for the rest.
const MAX_CONSECUTIVE_NET_FAILURES = 3
async function fetchMonthXls(url: string): Promise<Response | null> {
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    try {
      return await fetch(url, {
        headers: {
          'User-Agent':
            'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) civic-tech ingestion',
          Accept: 'application/vnd.ms-excel,application/octet-stream,*/*',
        },
        // Per-attempt budget — a healthy SEPE serves the XLS in ~1-2 s; a
        // stalled/blackholed connection must fail fast, not hang the chain
        // (30 s × 3 attempts × 3 breaker months ≈ 5 min worst case).
        signal: AbortSignal.timeout(30_000),
      })
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      if (attempt === FETCH_ATTEMPTS) {
        console.warn(`[paro] ${url} — network error after ${FETCH_ATTEMPTS} attempts: ${detail}`)
        return null
      }
      const backoffMs = attempt * 2000
      console.warn(
        `[paro] transient fetch error (attempt ${attempt}/${FETCH_ATTEMPTS}), retrying in ${backoffMs}ms: ${detail}`,
      )
      await new Promise((r) => setTimeout(r, backoffMs))
    }
  }
  return null
}

// netFail distinguishes "the host never answered" (feeds the circuit
// breaker) from "answered but no data for that month" (404 / nav page —
// normal for the newest months, never counted against the breaker).
async function tryMonth(
  year: number,
  monthIdx: number,
): Promise<{ snap: ParoSnapshot | null; netFail: boolean }> {
  const url = candidateUrl(year, monthIdx)
  const res = await fetchMonthXls(url)
  if (!res) return { snap: null, netFail: true }
  if (!res.ok) return { snap: null, netFail: false }
  const ct = res.headers.get('content-type') || ''
  if (!/excel|octet|msword/.test(ct) && res.headers.get('content-length') === '0')
    return { snap: null, netFail: false }
  const buf = Buffer.from(await res.arrayBuffer())
  // SEPE XLS starts with D0 CF 11 E0 (CDFV2); anything else is the nav page
  if (buf[0] !== 0xd0 || buf[1] !== 0xcf) return { snap: null, netFail: false }
  const period = `${year}-${String(monthIdx + 1).padStart(2, '0')}`
  return { snap: parseSepeParoMonth(buf, { municipio: MUNI, period }), netFail: false }
}

async function main() {
  const now = new Date()
  const results: ParoSnapshot[] = []
  let consecutiveNetFailures = 0
  // Walk back 24 months from now.
  for (let back = 0; back < 24; back++) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1)
    // One month failing (network or parse) must never abort the 24-month walk —
    // the months that DID resolve still make a valid snapshot. Only a fully
    // empty walk is a real failure, handled by the 0/24 guard below. The one
    // exception: MAX_CONSECUTIVE_NET_FAILURES months in a row that never got
    // an answer from the host means WE are unreachable/blocked — walking the
    // remaining months would only burn the nightly's time budget.
    let snap: ParoSnapshot | null = null
    try {
      const attempt = await tryMonth(d.getFullYear(), d.getMonth())
      snap = attempt.snap
      consecutiveNetFailures = attempt.netFail ? consecutiveNetFailures + 1 : 0
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      console.warn(`[paro] ${d.getFullYear()}-${d.getMonth() + 1} skipped: ${detail}`)
    }
    if (snap) {
      results.push(snap)
      console.log(`[paro] ${snap.period}: ${snap.total} total (${snap.men}H / ${snap.women}M)`)
    }
    if (consecutiveNetFailures >= MAX_CONSECUTIVE_NET_FAILURES) {
      // Writing the partial walk would shrink the published series (same
      // reasoning as the 0/24 guard below: an unreachable host is not a
      // data state). Keep yesterday's snapshot and red the run.
      console.error(
        `[paro] ${consecutiveNetFailures} consecutive months unreachable at the network level — ` +
          `sepe.es is down or blocking this IP range; aborting the walk early ` +
          `(${results.length} months fetched, existing snapshot left untouched)`,
      )
      process.exit(1)
    }
  }
  results.sort((a, b) => a.period.localeCompare(b.period))

  // Zero months parsed across a 24-month walk is never a real data state —
  // it means SEPE moved/blocked the feed. Refuse to overwrite yesterday's
  // snapshot with an empty one (the silent-freeze failure mode).
  if (results.length === 0) {
    console.error('[paro] 0/24 months fetched — leaving the existing snapshot untouched')
    process.exit(1)
  }

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
