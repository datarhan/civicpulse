// @ts-check
import { useJsonFetch } from './useJsonFetch'

/**
 * Which transcript each published verbatim on `/hallazgos` actually comes from.
 *
 * Derived nightly by `npm run compute:finding-quote-provenance` from the
 * findings snapshot and the transcript corpus — ~15 KB, keyed by finding id and
 * quote index. The alternative was fetching 300 KB of transcript per session
 * into the browser to answer the same question, which is the trade
 * `/departamentos` already makes with its cross-tab.
 *
 * A 404 resolves to an empty snapshot: on a checkout where the pass has not run
 * yet, quotes render with no marker rather than the page erroring. That is the
 * safe direction only because `check:finding-quotes` refuses to pass when the
 * committed file disagrees with the transcripts, so an empty one cannot sit on
 * `main` unnoticed.
 */
const EMPTY_PROVENANCE = { quotes: {}, sessions: {}, stats: null }

export function useFindingQuoteProvenance() {
  return useJsonFetch('/data/finding-quote-provenance.json', EMPTY_PROVENANCE)
}

/**
 * The entries for one finding, in its own quote order. Never `undefined`, so a
 * caller cannot accidentally branch on a loading state as if it were a verdict.
 * @param {any} data
 * @param {string} findingId
 * @returns {Array<{status: string, reason?: string}>}
 */
export function provenanceFor(data, findingId) {
  const rows = data?.quotes?.[findingId]
  return Array.isArray(rows) ? rows : []
}
