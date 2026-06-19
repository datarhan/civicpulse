import { useJsonFetch } from './useJsonFetch'

// 404-fallback (module-level constant → stable ref).
const EMPTY_ISPA = {
  generatedAt: null,
  source: null,
  municipality: null,
  latestYear: null,
  alcaldeTrend: [],
  years: [],
}

/**
 * ISPA elected-official retribuciones (public/data/ispa.json) — the official
 * Ministerio de Hacienda dataset, multi-year. Councillor rows are anonymised
 * (dedicación + amount, no name); only the alcalde is identifiable.
 */
export function useIspa() {
  return useJsonFetch('/data/ispa.json', EMPTY_ISPA)
}

/** The latest year's block (alcalde + concejales distribution + summary). */
export function ispaLatest(data) {
  const years = data?.years || []
  return years.find((y) => y.year === data?.latestYear) || years[years.length - 1] || null
}

/** "48.648 €" — euros, no decimals. */
export function formatEuros(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return ''
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n)
}
