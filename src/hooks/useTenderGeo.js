// @ts-check
import { useJsonFetch } from './useJsonFetch'
import { EMPTY_TENDER_GEO } from '../lib/tender-geo'

/** tender-geo.json may not exist before the first compute run → 404 → fallback. */
export function useTenderGeo() {
  return useJsonFetch('/data/tender-geo.json', EMPTY_TENDER_GEO)
}
