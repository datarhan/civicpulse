// @ts-check
import { useJsonFetch } from './useJsonFetch'

const EMPTY_ENTITIES = {
  companies: [],
  people: [],
  stats: { companies: 0, people: 0, variantsMerged: 0, contractRefs: 0 },
}

/**
 * Canonical entity registry (companies + people) built nightly by
 * `npm run compute:entities` from tenders + officials + the curated
 * entity-overrides. 404 → empty registry (fresh clone before the first
 * compute), so consumers degrade to raw-name behavior.
 */
export function useEntities() {
  return useJsonFetch('/data/entities.json', EMPTY_ENTITIES)
}
