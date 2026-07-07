// @ts-check
import { useJsonFetch } from './useJsonFetch'

/**
 * Loads a long-form data reportaje snapshot from
 * /public/data/reportajes/<slug>.json. The figures are FROZEN at publication
 * time (not recomputed from the live scrapers) so the prose and the charts
 * never drift apart as nightly data moves. 404 → null (route renders a
 * not-found state rather than erroring).
 */
export function useReportaje(slug) {
  return useJsonFetch(`/data/reportajes/${slug}.json`, null)
}
