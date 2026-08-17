// @ts-check
import { useJsonFetch } from './useJsonFetch'

// Infracciones penales del municipio (`npm run scrape:criminalidad`, refresco
// manual anual). La consume el catálogo de /datos; el bloque de resultado de
// /eficiencia lee la copia validada que compute:indicadores incrusta en
// indicadores.json.
const EMPTY = { serie: [], ultimo: null, pares: null, stats: null }

export function useCriminalidad() {
  return useJsonFetch('/data/criminalidad.json', EMPTY)
}
