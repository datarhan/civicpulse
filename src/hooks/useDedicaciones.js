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

/**
 * The acuerdo's salary bands — what the pleno FIXED, by cargo.
 *
 * A different series from ISPA's, and the distinction is the whole point: the
 * acuerdo sets an annual figure per cargo, the payroll pays what it pays. The
 * alcalde's two numbers (48.234,08 € fixed, 48.647,50 € received in 2024) sat
 * three hundred pixels apart on this page with nothing saying they measure
 * different things, so a reader could only read them as a contradiction.
 *
 * Roles come through VERBATIM from the acuerdo. They name the cargo, not the
 * person, and rewriting one to fit a column would be paraphrasing a legal act.
 *
 * @returns {{tramos: Array<{amountEuros: number, count: number, roles: string[]}>, sum: number, count: number}|null}
 */
export function fijadoTramos(data) {
  const rows = data?.byOfficial || []
  if (rows.length === 0) return null
  const porImporte = new Map()
  for (const r of rows) {
    const key = r.amountEuros
    if (!porImporte.has(key)) porImporte.set(key, { amountEuros: key, count: 0, roles: [] })
    const t = porImporte.get(key)
    t.count += 1
    if (r.role) t.roles.push(r.role)
  }
  const tramos = [...porImporte.values()].sort((a, b) => b.amountEuros - a.amountEuros)
  return {
    tramos,
    sum: rows.reduce((a, r) => a + (r.amountEuros || 0), 0),
    count: rows.length,
  }
}
