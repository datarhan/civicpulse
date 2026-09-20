/**
 * Wayback Machine (Internet Archive) archival helper.
 *
 * Wraps the Save Page Now endpoint at `https://web.archive.org/save/`,
 * which freezes a copy of any URL the Archive's crawler can reach.
 * The frozen snapshot lives at
 *   `https://web.archive.org/web/<14-digit-timestamp>/<original-url>`
 * — that URL is what we cite in press findings so the source survives
 * if the publisher deletes the page later (GIJN's "always archive
 * before you cite" rule).
 *
 * Anonymous rate limit: ~6 requests/min (verified empirically against
 * the public endpoint). With an Internet Archive S3-style API key the
 * limit rises to ~100/min — gated behind WAYBACK_ACCESS_KEY +
 * WAYBACK_SECRET_KEY env vars when needed (we do NOT require them).
 *
 * Politeness: callers should rate-limit themselves at <1 req/8s when
 * batching. The helper itself does NOT sleep — that decision belongs
 * to the caller, who has context.
 */

const SAVE_BASE = 'https://web.archive.org/save'
const SNAPSHOT_BASE = 'https://web.archive.org/web'
const CDX_BASE = 'https://web.archive.org/cdx/search/cdx'
const UA = 'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) civic-tech ingestion'
/** The CDX index is slow even when healthy: 9 s with `fastLatest`, 25 s on a miss (2026-09-20). */
const CDX_TIMEOUT_MS = 45_000

/**
 * What a LOOKUP established. Three outcomes, not two: «there is no copy» and
 * «I was not allowed to look» used to be the same `ok:false`, and a caller that
 * saves when there is no copy spent a Save Page Now request on every refused
 * lookup (2026-09-20: 23 of them, all refused too, each one extending the block).
 */
export type SnapshotLookup = 'found' | 'none' | 'failed'

export interface WaybackResult {
  ok: boolean
  /**
   * Canonical Wayback snapshot URL when the archive succeeded:
   *   https://web.archive.org/web/<timestamp>/<original-url>
   */
  archivedUrl: string | null
  /** 14-digit Wayback timestamp (e.g. "20260521120000"), or null. */
  timestamp: string | null
  /** ISO 8601 wall-clock when the archive request was issued. */
  archivedAt: string
  /** Reason for failure when ok=false. */
  error: string | null
  /** Set by `findExistingSnapshot` only. `none` is an answer; `failed` is not. */
  lookup?: SnapshotLookup
  /** Why the CDX fallback failed, when it was tried and did. `error` keeps the first failure. */
  cdxError?: string
}

export interface ArchiveOptions {
  /** Override the fetch implementation (used by tests). */
  fetchImpl?: typeof fetch
  /** Internet Archive S3-style key pair (raises rate limit). Both required when used. */
  accessKey?: string
  secretKey?: string
  /** Hard timeout in ms. Default 30000. */
  timeoutMs?: number
  /**
   * `findExistingSnapshot` only. When the Availability API does not produce a
   * copy — it FAILED, or it answered «none», which it sometimes does for URLs
   * that have one — ask the CDX index too, a different service.
   * Off unless asked for: the index takes 9 s on a hit and 25 s on a miss, which
   * a best-effort caller (the agent's fetches, the daily audit of 170-odd press
   * links) must not pay for a link that is a courtesy there. The caller that
   * OWES the reader a copy — `journalist:archive-sources` — turns it on.
   */
  cdxFallback?: boolean
}

function parseTimestampFromHeader(value: string | null): string | null {
  if (!value) return null
  // Wayback returns: /web/20260521120000/https://example.com/path
  // or sometimes:    https://web.archive.org/web/20260521120000/...
  const m = value.match(/\/web\/(\d{14})\//)
  return m ? m[1] : null
}

function parseTimestampFromBody(body: string): string | null {
  const m = body.match(/\/web\/(\d{14})\//)
  return m ? m[1] : null
}

/**
 * Archive a URL on the Wayback Machine. Returns a structured result
 * envelope — never throws on HTTP errors. The caller decides whether
 * to retry, log, or proceed without an archived copy.
 *
 * `ok: false` with `HTTP 500` is NOT proof that nothing was captured. The sync
 * endpoint captures the page and then tries to replay the new snapshot; when
 * the replay fails it answers 500 («This snapshot cannot be displayed due to an
 * internal error») with the capture already made. Measured on 2026-09-20: most
 * of the saves that «failed» that way were in the index minutes later. So a
 * caller should not retry a 500 straight away — look the URL up again after a
 * few minutes (`findExistingSnapshot`), and only then decide. A 429 is the
 * other way round: nothing was captured, and retrying extends the block.
 */
export async function archiveOnWayback(
  url: string,
  opts: ArchiveOptions = {},
): Promise<WaybackResult> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const archivedAt = new Date().toISOString()
  if (!url || !/^https?:\/\//.test(url)) {
    return {
      ok: false,
      archivedUrl: null,
      timestamp: null,
      archivedAt,
      error: 'invalid url',
    }
  }

  const headers: Record<string, string> = {
    'User-Agent': UA,
    Accept: 'application/json,text/html;q=0.9,*/*;q=0.5',
  }
  if (opts.accessKey && opts.secretKey) {
    headers.Authorization = `LOW ${opts.accessKey}:${opts.secretKey}`
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000)
  let res: Response
  try {
    res = await fetchImpl(`${SAVE_BASE}/${url}`, {
      method: 'GET',
      headers,
      redirect: 'follow',
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    return {
      ok: false,
      archivedUrl: null,
      timestamp: null,
      archivedAt,
      error: (err as Error).message || 'network error',
    }
  }
  clearTimeout(timer)

  if (!res.ok) {
    return {
      ok: false,
      archivedUrl: null,
      timestamp: null,
      archivedAt,
      error: `HTTP ${res.status}`,
    }
  }

  // Wayback's response shape varies by mode (sync vs spn2). Look for the
  // timestamp in: Content-Location header → Location header → response
  // URL → the response body (the page contains the snapshot link).
  const headerTs =
    parseTimestampFromHeader(res.headers.get('content-location')) ??
    parseTimestampFromHeader(res.headers.get('location')) ??
    parseTimestampFromHeader(res.url)
  let timestamp = headerTs
  if (!timestamp) {
    try {
      const body = await res.text()
      timestamp = parseTimestampFromBody(body)
    } catch {
      // ignore — fall through to no-timestamp
    }
  }
  if (!timestamp) {
    return {
      ok: false,
      archivedUrl: null,
      timestamp: null,
      archivedAt,
      error: 'no timestamp in response',
    }
  }
  return {
    ok: true,
    archivedUrl: `${SNAPSHOT_BASE}/${timestamp}/${url}`,
    timestamp,
    archivedAt,
    error: null,
  }
}

/**
 * The newest capture that answered 200, straight from the CDX index.
 *
 * `fastLatest=true` is not optional: without it `limit=-1` walks every capture
 * of the URL and the same query answered 504 after 60 s on 2026-09-20. An empty
 * array is an ANSWER (no capture); anything that is not the index's JSON — a
 * 5xx, or a 200 carrying a maintenance page — is a failure, never an empty.
 */
async function findViaCdx(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<{ timestamp: string } | { none: true } | { error: string }> {
  const q = new URLSearchParams({
    url,
    output: 'json',
    fl: 'timestamp,original,statuscode',
    filter: 'statuscode:200',
    limit: '-1',
    fastLatest: 'true',
  })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(`${CDX_BASE}?${q.toString()}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!res.ok) return { error: `HTTP ${res.status}` }
    let rows: unknown
    try {
      rows = JSON.parse(await res.text())
    } catch {
      return { error: 'CDX: la respuesta no es JSON' }
    }
    if (!Array.isArray(rows)) return { error: 'CDX: la respuesta no es una lista' }
    // With output=json the first row is the header; an empty list has none.
    const capturas = rows.filter(
      (r): r is string[] => Array.isArray(r) && typeof r[0] === 'string' && /^\d{14}$/.test(r[0]),
    )
    if (capturas.length === 0) return { none: true }
    return { timestamp: capturas[capturas.length - 1][0] }
  } catch (err) {
    return { error: `CDX: ${(err as Error).message || 'network error'}` }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Look up an existing archived snapshot without forcing a new save.
 *
 * Asks Wayback's Availability API (`archive.org/wayback/available`, ~50 ms)
 * and says which of THREE things it learned in `lookup`:
 *   · `found`  — a copy exists;
 *   · `none`   — the service answered and there is none;
 *   · `failed` — nobody answered. NOT the same as `none`: call this before
 *     deciding to spend a Save Page Now request, and do not spend it on `failed`.
 *
 * With `cdxFallback: true` the CDX index — a different service — is asked
 * whenever the API did not produce a copy, for either reason:
 *   · it FAILED (it answers 429 for hours at a stretch; the index was answering
 *     on the day the API refused everything);
 *   · it answered «none». That answer is not reliable: on 2026-09-20 it was a
 *     clean 200 with `archived_snapshots: {}` for three URLs whose 200 captures,
 *     hours old, were in the index — and one refused save was spent on them.
 * If the index does not answer either, the API's word stands: `failed` stays
 * `failed`, and «none» stays `none` (the index times out often, and its silence
 * must not veto every save) — `cdxError` says the second opinion was not had.
 */
export async function findExistingSnapshot(
  url: string,
  opts: ArchiveOptions = {},
): Promise<WaybackResult> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const archivedAt = new Date().toISOString()
  const base = { archivedUrl: null, timestamp: null, archivedAt }
  if (!url || !/^https?:\/\//.test(url)) {
    return { ok: false, ...base, error: 'invalid url', lookup: 'failed' }
  }

  // What the Availability API established, before any second opinion.
  let api: { lookup: 'none' | 'failed'; error: string }
  try {
    const apiUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`
    const res = await fetchImpl(apiUrl, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    })
    if (res.ok) {
      const json = (await res.json()) as {
        archived_snapshots?: { closest?: { available?: boolean; url?: string; timestamp?: string } }
      }
      const closest = json.archived_snapshots?.closest
      if (closest && closest.available === true && closest.url) {
        return {
          ok: true,
          archivedUrl: closest.url,
          timestamp: closest.timestamp ?? null,
          archivedAt,
          error: null,
          lookup: 'found',
        }
      }
      api = { lookup: 'none', error: 'no snapshot available' }
    } else {
      api = { lookup: 'failed', error: `HTTP ${res.status}` }
    }
  } catch (err) {
    api = { lookup: 'failed', error: (err as Error).message || 'network error' }
  }

  if (opts.cdxFallback !== true) return { ok: false, ...base, ...api }

  const cdx = await findViaCdx(url, fetchImpl, opts.timeoutMs ?? CDX_TIMEOUT_MS)
  if ('timestamp' in cdx) {
    return {
      ok: true,
      archivedUrl: `${SNAPSHOT_BASE}/${cdx.timestamp}/${url}`,
      timestamp: cdx.timestamp,
      archivedAt,
      error: null,
      lookup: 'found',
    }
  }
  if ('none' in cdx) return { ok: false, ...base, error: 'no snapshot available', lookup: 'none' }
  return { ok: false, ...base, ...api, cdxError: cdx.error }
}
