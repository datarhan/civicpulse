// @ts-check
import { useJsonFetch } from './useJsonFetch'

export function useBdns() {
  return useJsonFetch('/data/bdns.json')
}
