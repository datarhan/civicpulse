/**
 * Retry-with-backoff for scraper fetches. A single transient blip (timeout,
 * 429, 5xx) on one upstream feed shouldn't thin that day's snapshot — e.g. one
 * Google News fetch timeout used to drop ~96 press items for a whole day until
 * the next nightly. Pure + injectable `sleep` so the backoff is instant in
 * tests.
 */
export interface RetryOptions {
  /** Extra attempts after the first (total attempts = retries + 1). */
  retries?: number
  /** First backoff delay in ms; doubles each retry (base, 2·base, 4·base…). */
  baseDelayMs?: number
  /** Return false to give up immediately on a given error (e.g. a 404). */
  shouldRetry?: (err: unknown) => boolean
  /** Observability hook fired just before each backoff sleep. */
  onRetry?: (err: unknown, attempt: number) => void
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 2
  const base = opts.baseDelayMs ?? 800
  const shouldRetry = opts.shouldRetry ?? (() => true)
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))

  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt === retries || !shouldRetry(err)) break
      opts.onRetry?.(err, attempt)
      await sleep(base * 2 ** attempt)
    }
  }
  throw lastErr
}

/**
 * Retry policy for HTTP fetches: transient = timeouts, network-layer errors,
 * HTTP 429 (rate-limit) and 5xx (server). Permanent 4xx (404/403/…) are NOT
 * retried — they won't succeed on a retry and would only waste the backoff.
 * Couples to `fetchXml`'s `HTTP <status> fetching …` error message shape.
 */
export function isTransientFetchError(err: unknown): boolean {
  if (!(err instanceof Error)) return true
  if (err.name === 'TimeoutError' || err.name === 'AbortError') return true
  const httpMatch = err.message.match(/HTTP (\d{3})/)
  if (httpMatch) {
    const code = Number(httpMatch[1])
    return code === 429 || code >= 500
  }
  // Network-layer errors (TypeError 'fetch failed', ECONNRESET, DNS…) → transient.
  return true
}
