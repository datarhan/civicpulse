/**
 * Shared OSM Overpass fetcher — mirror rotation + 429/5xx retry with backoff.
 *
 * Both scrape-geo.ts and scrape-metro-network.ts hit Overpass, which routinely
 * load-sheds with HTTP 429 under contention. The primary (overpass-api.de) and
 * two mirrors run the same software against the same planet, so any one
 * answering suffices. This lives next to boe-fetch.ts / tenders-ted-fetch.ts as
 * a node-only network sibling — pure fetch, no parser logic — so the two
 * scrapers share one definition of "talk to Overpass" instead of drifting
 * copies. Uses only universal APIs (fetch / AbortSignal / setTimeout), so it is
 * safe wherever fetch exists.
 */

export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

const UA = 'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) civic-tech ingestion'

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export interface OverpassOptions {
  /** Log prefix, e.g. 'geo' or 'metro-network'. */
  label?: string
  /** Per-attempt client-side ceiling for Overpass queue + transfer time. */
  timeoutMs?: number
  /** Retries per endpoint before rotating to the next mirror. */
  maxAttempts?: number
}

/**
 * POST an Overpass QL query and return the raw response body. Rotates through
 * OVERPASS_ENDPOINTS; within each, retries 429 / 5xx (honoring Retry-After,
 * else exponential backoff). Other 4xx won't self-heal, so jumps straight to
 * the next mirror. Throws only when every mirror is exhausted.
 */
export async function fetchOverpass(ql: string, opts: OverpassOptions = {}): Promise<string> {
  const label = opts.label ?? 'overpass'
  const timeoutMs = opts.timeoutMs ?? 180_000
  const maxAttempts = opts.maxAttempts ?? 3
  const body = new URLSearchParams({ data: ql }).toString()
  const headers = {
    'User-Agent': UA,
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  }
  let lastErr = 'no attempt made'
  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let res: Response
      try {
        res = await fetch(endpoint, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(timeoutMs),
        })
      } catch (err) {
        // Network error / timeout — retryable on the same endpoint.
        lastErr = `${endpoint}: ${String(err).slice(0, 120)}`
        console.warn(`[${label}] ${lastErr} — attempt ${attempt}/${maxAttempts}`)
        if (attempt < maxAttempts) await sleep(attempt * 3_000)
        continue
      }
      if (res.ok) return res.text()
      lastErr = `${endpoint} -> HTTP ${res.status}`
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get('retry-after'))
        const waitMs =
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : attempt * 3_000
        console.warn(
          `[${label}] ${lastErr} — backoff ${Math.round(waitMs / 1_000)}s, attempt ${attempt}/${maxAttempts}`,
        )
        if (attempt < maxAttempts) await sleep(waitMs)
        continue
      }
      console.warn(`[${label}] ${lastErr} — non-retryable, trying next mirror`)
      break
    }
  }
  throw new Error(
    `Overpass [${label}]: all ${OVERPASS_ENDPOINTS.length} mirror(s) exhausted — last: ${lastErr}`,
  )
}
