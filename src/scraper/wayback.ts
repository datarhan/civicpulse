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
const UA = 'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) civic-tech ingestion'

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
}

export interface ArchiveOptions {
  /** Override the fetch implementation (used by tests). */
  fetchImpl?: typeof fetch
  /** Internet Archive S3-style key pair (raises rate limit). Both required when used. */
  accessKey?: string
  secretKey?: string
  /** Hard timeout in ms. Default 30000. */
  timeoutMs?: number
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
 * Look up an existing archived snapshot without forcing a new save.
 * Uses Wayback's Availability API at `archive.org/wayback/available`.
 * Cheap (~50ms) and rate-limit-friendly — call this before deciding
 * to spend a Save Page Now request.
 */
export async function findExistingSnapshot(
  url: string,
  opts: ArchiveOptions = {},
): Promise<WaybackResult> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const archivedAt = new Date().toISOString()
  if (!url || !/^https?:\/\//.test(url)) {
    return { ok: false, archivedUrl: null, timestamp: null, archivedAt, error: 'invalid url' }
  }
  try {
    const apiUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`
    const res = await fetchImpl(apiUrl, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    })
    if (!res.ok) {
      return {
        ok: false,
        archivedUrl: null,
        timestamp: null,
        archivedAt,
        error: `HTTP ${res.status}`,
      }
    }
    const json = (await res.json()) as {
      archived_snapshots?: { closest?: { available?: boolean; url?: string; timestamp?: string } }
    }
    const closest = json.archived_snapshots?.closest
    if (!closest || closest.available !== true || !closest.url) {
      return {
        ok: false,
        archivedUrl: null,
        timestamp: null,
        archivedAt,
        error: 'no snapshot available',
      }
    }
    return {
      ok: true,
      archivedUrl: closest.url,
      timestamp: closest.timestamp ?? null,
      archivedAt,
      error: null,
    }
  } catch (err) {
    return {
      ok: false,
      archivedUrl: null,
      timestamp: null,
      archivedAt,
      error: (err as Error).message || 'network error',
    }
  }
}
