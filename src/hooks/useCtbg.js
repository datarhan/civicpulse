// @ts-check
import { useJsonFetch } from './useJsonFetch'

export function useCtbg() {
  return useJsonFetch('/data/ctbg.json')
}
