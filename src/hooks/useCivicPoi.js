// @ts-check
import { useJsonFetch } from './useJsonFetch'

const EMPTY_CIVIC_POI = {
  generatedAt: null,
  source: null,
  pois: [],
  stats: { total: 0, byCategory: {} },
}

export function useCivicPoi() {
  return useJsonFetch('/data/civic-poi.json', EMPTY_CIVIC_POI)
}
