// @ts-check
import { useJsonFetch } from './useJsonFetch'

// Visitas y prestatarios de la biblioteca, con su banda de comparación
// (`npm run scrape:bibliotecas`). Lo consume el catálogo de /datos; el bloque de
// resultado de /eficiencia lee la copia validada que compute:indicadores incrusta.
const EMPTY = { municipio: null, pares: null, fuente: null, stats: null }

export function useBibliotecas() {
  return useJsonFetch('/data/bibliotecas.json', EMPTY)
}
