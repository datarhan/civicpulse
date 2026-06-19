import { useJsonFetch } from './useJsonFetch'

// 404-fallback (module-level constant → stable ref).
const EMPTY_RETRIB = {
  generatedAt: null,
  mandate: null,
  source: null,
  note: null,
  corporation: null,
  byOfficial: [],
}

/**
 * Curated + cited councillor-retribuciones dataset
 * (public/data/retribuciones.json). Legally material — see
 * src/scraper/retribuciones.ts for the validation contract.
 */
export function useRetribuciones() {
  return useJsonFetch('/data/retribuciones.json', EMPTY_RETRIB)
}

/** The per-official figure, or null when none is attributable to that slug. */
export function retribucionForOfficial(data, slug) {
  return (data?.byOfficial || []).find((o) => o.slug === slug) || null
}

/** "48.234 €" — euros, no decimals. */
export function formatEuros(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return ''
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n)
}
