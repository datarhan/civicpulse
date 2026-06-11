/**
 * TED network fetcher — the paginated POST loop that feeds
 * parseTedResponse. Split out of tenders-ted.ts so the parser module
 * stays pure (architecture contract: fetch lives in the CLI layer /
 * node-only siblings). Tests inject `fetchImpl` to pin pagination
 * behaviour without the network.
 */
import type { ApiResponse } from './tenders-ted'

const API_URL = 'https://api.ted.europa.eu/v3/notices/search'
const UA = 'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) civic-tech ingestion'

const REQUESTED_FIELDS = [
  'publication-number',
  'notice-title',
  'total-value',
  'contract-nature',
  'buyer-name',
  'publication-date',
  'place-of-performance',
  'classification-cpv',
  'links',
] as const

export interface FetchOptions {
  query?: string
  limit?: number
  maxPages?: number
  fetchImpl?: typeof fetch
}

/**
 * Paginated POST to TED's expert search. Default query targets buyers
 * whose name contains "Riba-roja".
 */
export async function fetchTedNotices(opts: FetchOptions = {}): Promise<ApiResponse[]> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const query = opts.query ?? 'buyer-name~"Riba-roja"'
  const limit = opts.limit ?? 100
  const maxPages = opts.maxPages ?? 3
  const pages: ApiResponse[] = []
  let iterationNextToken: string | null = null
  let pageCount = 0
  while (pageCount < maxPages) {
    const body: Record<string, unknown> = {
      query,
      fields: REQUESTED_FIELDS as unknown as string[],
      limit,
    }
    if (iterationNextToken) body.iterationNextToken = iterationNextToken
    const res = await fetchImpl(API_URL, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      // Per-page budget — a stalled TED API must not hang the nightly chain.
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`TED API ${res.status} on page ${pageCount + 1}: ${text.slice(0, 200)}`)
    }
    const json = (await res.json()) as ApiResponse
    pages.push(json)
    iterationNextToken = json.iterationNextToken ?? null
    pageCount += 1
    if (!iterationNextToken) break
  }
  return pages
}
