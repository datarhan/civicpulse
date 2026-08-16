// @ts-check
import { useJsonFetch } from './useJsonFetch'

// El gasto observado contra el esperado dada la población
// (`npm run compute:coste-esperado`, refresco manual con la entrega anual).
const EMPTY = { especificaciones: [], modelo: null, fuente: null, stats: null }

export function useCosteEsperado() {
  return useJsonFetch('/data/coste-esperado.json', EMPTY)
}
