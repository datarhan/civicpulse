import { useJsonFetch } from './useJsonFetch'

// 404-fallback (module-level constant → stable ref).
const EMPTY_BOP = {
  generatedAt: null,
  source: null,
  stats: { total: 0, daysCovered: 0, latestDate: null },
  anuncios: [],
}

/**
 * Riba-roja anuncios from the Boletín Oficial de la Provincia de València
 * (public/data/bop.json) — the canonical legal-notices channel, produced by
 * scrape-bop.ts.
 */
export function useBop() {
  return useJsonFetch('/data/bop.json', EMPTY_BOP)
}

/** "16 jun 2026" from an ISO date. */
export function formatBopDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return iso
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}
