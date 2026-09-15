// @ts-check
import { useJsonFetch } from './useJsonFetch'

/**
 * Load the full Metrovalencia network written by `scripts/scrape-metro-network.ts`.
 * Each track and station carries its `lineRefs: ["L1", "L2", …]` list so the map
 * can colour them by line. Brand colours live on the `lines` summary, and what the
 * script left out (other networks FGV operates) is counted in `ambito`.
 *
 * Heavier than our typical snapshot. It's loaded lazily by the landing-page map;
 * other pages should not import this hook.
 */
export function useMetroNetwork() {
  return useJsonFetch('/data/metro-network.json')
}

/**
 * Map helpers — given the network payload, return a { "L1": "#…" } lookup.
 *
 * @returns {Record<string, string>}
 */
export function indexLineColors(data) {
  /** @type {Record<string, string>} */
  const out = {}
  for (const l of data?.lines || []) out[l.ref] = l.color
  return out
}
