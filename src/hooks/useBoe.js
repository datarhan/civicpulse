// @ts-check
import { useJsonFetch } from './useJsonFetch'

/**
 * Boletín Oficial del Estado entries naming Riba-roja (last 30 days).
 *
 * State-level acts about the municipality — convenios, expropiaciones,
 * resoluciones de personal, subvenciones nominativas — that no municipal
 * source publishes. Scraped nightly and, until now, rendered nowhere: the
 * dataset existed only as a freshness probe on the lab-health page.
 */
export function useBoe() {
  return useJsonFetch('/data/boe.json')
}
