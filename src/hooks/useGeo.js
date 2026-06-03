// @ts-check
import { useJsonFetch } from './useJsonFetch'

export function useGeo() {
  return useJsonFetch('/data/geo.json')
}
