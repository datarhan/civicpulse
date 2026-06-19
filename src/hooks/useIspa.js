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

/**
 * Salary-growth % for the alcalde over each requested window (years back from
 * the latest ISPA year). Returns { years, pct } with pct === null when that
 * base year isn't in the (clean) ISPA series — so the UI can render "—" rather
 * than invent a figure. Only the alcalde has a continuous per-year series;
 * councillors' dedicación dates from the 2023 acuerdo (no prior history).
 */
export function alcaldeGrowth(data, windows = [1, 3, 5, 10]) {
  const trend = data?.alcaldeTrend || []
  if (trend.length < 2) return []
  const latest = trend[trend.length - 1]
  return windows.map((years) => {
    const base = trend.find((t) => t.year === latest.year - years)
    return {
      years,
      pct: base && base.amountEuros ? (latest.amountEuros / base.amountEuros - 1) * 100 : null,
    }
  })
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
