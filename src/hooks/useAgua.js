// @ts-check
import { useJsonFetch } from './useJsonFetch'

// Archivo de boletines de SINAC (`npm run scrape:agua`). Lo consume el catálogo
// de /datos; el bloque de resultado de /eficiencia lee la copia validada que
// compute:indicadores incrusta.
const EMPTY = { municipio: null, redes: [], boletines: [], fuente: null, stats: null }

export function useAgua() {
  return useJsonFetch('/data/agua.json', EMPTY)
}

// La misma fuente leída en los municipios de la banda (`scrape:agua-pares`).
const EMPTY_PARES = { municipios: [], fallidos: [], stats: null }

export function useAguaPares() {
  return useJsonFetch('/data/agua-pares.json', EMPTY_PARES)
}
