/**
 * BOE network fetcher — the day-walking loop that feeds parseBoeSumario.
 *
 * Split out of boe.ts so the parser module stays pure (the architecture
 * contract: fetch lives in the CLI layer / node-only siblings, parsers
 * take payloads). Tests inject `fetchImpl` to pin the day-walking
 * behaviour without the network.
 */
import { parseBoeSumario, type ApiSumarioResponse, type BoeRow } from './boe'

const SUMARIO_URL = (yyyymmdd: string) =>
  `https://www.boe.es/datosabiertos/api/boe/sumario/${yyyymmdd}`
const UA = 'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) civic-tech ingestion'

export interface FetchOptions {
  /** Days back from today (default 30). */
  days?: number
  /** Override clock — used by tests. */
  now?: Date
  /** Override fetch — used by tests. */
  fetchImpl?: typeof fetch
  /** Politeness delay between requests, ms. Default 600. */
  delayMs?: number
}

function yyyymmdd(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

async function delay(ms: number): Promise<void> {
  if (ms <= 0) return
  await new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Walk the last N days, fetch each sumario, and collect matching rows.
 * Days with no sumario (weekends, festivos) return 404 / non-200 and
 * are quietly skipped.
 */
export async function fetchBoeRows(opts: FetchOptions = {}): Promise<{
  rows: BoeRow[]
  daysFetched: number
  daysWithMatches: number
  /** Days whose fetch failed at the network level — NOT the same as a 404 on a Sunday. */
  daysFailed: number
  /** Size of the requested window, so `daysFetched` has a denominator. */
  daysRequested: number
}> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const days = opts.days ?? 30
  const now = opts.now ?? new Date()
  const delayMs = opts.delayMs ?? 600
  const rows: BoeRow[] = []
  let daysFetched = 0
  let daysWithMatches = 0
  let daysFailed = 0
  for (let i = 0; i < days; i += 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i))
    const stamp = yyyymmdd(d)
    let payload: ApiSumarioResponse | null = null
    try {
      const res = await fetchImpl(SUMARIO_URL(stamp), {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        // Per-day budget — 30 sequential requests; one stall must not hang all.
        signal: AbortSignal.timeout(30_000),
      })
      if (!res.ok) {
        // 404/non-200 on weekends and festivos is the normal no-sumario case.
        await delay(delayMs)
        continue
      }
      payload = (await res.json()) as ApiSumarioResponse
    } catch (err) {
      // Network-level failure is NOT the weekend case — leave a trace so a
      // full BOE outage doesn't masquerade as "30 quiet days".
      daysFailed += 1
      console.warn(`[boe] ${stamp} fetch failed: ${(err as Error).message}`)
      await delay(delayMs)
      continue
    }
    if (payload?.status?.code !== '200') {
      await delay(delayMs)
      continue
    }
    daysFetched += 1
    const dayRows = parseBoeSumario(payload)
    if (dayRows.length > 0) {
      daysWithMatches += 1
      rows.push(...dayRows)
    }
    await delay(delayMs)
  }
  if (daysFailed > 0) {
    console.warn(`[boe] ${daysFailed}/${days} days failed at the network level`)
  }
  rows.sort((a, b) => b.publicacionDate.localeCompare(a.publicacionDate))
  // `daysFailed` is returned, not just logged. A real BOE outage otherwise
  // showed up only as a lower `daysFetched`, indistinguishable from the
  // Sundays and festivos when the BOE legitimately publishes nothing.
  return { rows, daysFetched, daysWithMatches, daysFailed, daysRequested: days }
}
