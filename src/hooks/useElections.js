// @ts-check
import { useJsonFetch } from './useJsonFetch'

/**
 * Municipal election results, 1979→2023 (GVA/ICV WFS, via scrape:elections).
 *
 * Scraped nightly since the feature shipped but read by nothing until now —
 * the ballot labels (PSPV-PSOE, Podem) never reconciled with the roster labels
 * (PSOE, Otro), so a councillor's own electoral mandate was invisible.
 * See src/lib/party-alias.js for the bridge.
 */
export function useElections() {
  return useJsonFetch('/data/elections.json')
}
