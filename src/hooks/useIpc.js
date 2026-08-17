// @ts-check
import { useJsonFetch } from './useJsonFetch'

// Índice de precios anual del INE (`npm run scrape:ipc`, refresco manual).
// La consume el catálogo de /datos; las series deflactadas de /eficiencia
// llevan sus euros constantes ya calculados en indicadores.json.
const EMPTY = { medias: {}, stats: null }

export function useIpc() {
  return useJsonFetch('/data/ipc.json', EMPTY)
}
