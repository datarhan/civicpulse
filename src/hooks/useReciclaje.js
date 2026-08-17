// @ts-check
import { useJsonFetch } from './useJsonFetch'

// Corte 2022 de recogida selectiva (`npm run scrape:reciclaje`, edición única
// del ICV). Lo consume el catálogo de /datos; el bloque de resultado de
// /eficiencia lee la copia validada que compute:indicadores incrusta.
const EMPTY = { municipio: null, pares: null, fuente: null, stats: null }

export function useReciclaje() {
  return useJsonFetch('/data/reciclaje.json', EMPTY)
}
