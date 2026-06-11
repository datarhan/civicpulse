// @ts-check
import { useJsonFetch } from './useJsonFetch'

export function usePadron() {
  return useJsonFetch('/data/padron.json')
}
