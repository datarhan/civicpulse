// @ts-check
import { useJsonFetch } from './useJsonFetch'

const EMPTY_SINDICATURA = {
  generatedAt: null,
  note: '',
  source: null,
  query: '',
  dedicated: [],
  sectoral: [],
  stats: { dedicated: 0, sectoral: 0, sectoralRelevant: 0, sectoralTotal: 0 },
}

/**
 * Sindicatura de Comptes de la Comunitat Valenciana — audit-court fiscalización
 * reports naming Riba-roja. The ex-post accountability card on /quejas next to
 * Síndic de Greuges + CTBG. `dedicated` = audits about the town; `sectoral` =
 * local-entity sweeps where it's a subject.
 */
export function useSindicatura() {
  return useJsonFetch('/data/sindicatura.json', EMPTY_SINDICATURA)
}
