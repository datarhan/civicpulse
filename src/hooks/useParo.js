// @ts-check
import { useJsonFetch } from './useJsonFetch'

export function useParo() {
  return useJsonFetch('/data/paro.json')
}
