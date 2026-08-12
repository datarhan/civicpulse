// @ts-check
import { useJsonFetch } from './useJsonFetch'

// Panel de coste unitario por servicio (`npm run compute:indicadores`).
// Ships empty until the first compute pass; a 404 resolves to the empty shape
// rather than erroring. Module-level constant, not a fresh literal — the
// snapshot store compares by reference.
const EMPTY = { indicadores: [], universe: null, cobertura: null }

export function useIndicadores() {
  return useJsonFetch('/data/indicadores.json', EMPTY)
}
