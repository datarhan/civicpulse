// @ts-check
import { useJsonFetch } from './useJsonFetch'

/**
 * EU-threshold notices for this ayuntamiento, from Tenders Electronic Daily.
 *
 * These are the contracts above the EU publication threshold (~€143k for
 * services in 2026) — the largest single awards the town makes, including
 * NextGenerationEU and DANA-recovery lines that PLACSP publishes late. The
 * snapshot was scraped nightly for months and reached no page.
 */
export function useTendersTed() {
  return useJsonFetch('/data/tenders-ted.json')
}
