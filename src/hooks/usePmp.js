// @ts-check
import { useJsonFetch } from './useJsonFetch'

// Serie del periodo medio de pago (`npm run scrape:pmp`, refresco manual).
// La consume el catálogo de /datos; el panel de /gestion lee la copia que
// compute:indicadores incrusta en indicadores.json, no este fichero.
const EMPTY = { serie: [], ultimo: null, stats: null }

export function usePmp() {
  return useJsonFetch('/data/pmp.json', EMPTY)
}
