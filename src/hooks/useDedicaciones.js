import { useJsonFetch } from './useJsonFetch'

// 404-fallback (module-level constant → stable ref).
const EMPTY_DEDIC = {
  generatedAt: null,
  mandate: null,
  source: null,
  brackets: [],
  sinDedicacionCount: null,
  byOfficial: [],
}

/**
 * Curated + cited per-councillor dedicaciones (public/data/dedicaciones.json):
 * the salary each cargo with dedicación exclusiva draws, from the pleno
 * acuerdo, mapped to the named councillor by delegated áreas. Legally material
 * — see src/scraper/dedicaciones.ts for the validation contract.
 */
export function useDedicaciones() {
  return useJsonFetch('/data/dedicaciones.json', EMPTY_DEDIC)
}

/** The per-official dedicación figure for a slug, or null (→ sin dedicación). */
export function dedicacionForSlug(data, slug) {
  return (data?.byOfficial || []).find((o) => o.slug === slug) || null
}
