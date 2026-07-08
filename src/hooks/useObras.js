// @ts-check
import { useJsonFetch } from './useJsonFetch'

// Municipal "obras en curso" (flagship infrastructure works). Ships empty until
// the first scrape; a 404 resolves to the empty shape.
const EMPTY = { obras: [] }

export function useObras() {
  return useJsonFetch('/data/obras.json', EMPTY)
}
