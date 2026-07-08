// @ts-check
import { useJsonFetch } from './useJsonFetch'

// Municipal association register (civil-society directory). Ships empty until
// the first scrape; a 404 resolves to the empty shape.
const EMPTY = { fechaRegistro: null, asociaciones: [] }

export function useAsociaciones() {
  return useJsonFetch('/data/asociaciones.json', EMPTY)
}
