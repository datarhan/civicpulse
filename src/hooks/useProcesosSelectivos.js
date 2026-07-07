// @ts-check
import { useJsonFetch } from './useJsonFetch'

// Municipal hiring processes (the town's own oposiciones / bolsas). Ships empty
// until the first scrape; a 404 resolves to the empty shape.
const EMPTY = { procesos: [] }

export function useProcesosSelectivos() {
  return useJsonFetch('/data/procesos-selectivos.json', EMPTY)
}
