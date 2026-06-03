// @ts-check
/**
 * Shared presentation formatters. Kept dependency-free (no React, no fetch)
 * so any hook, component, or page can import them.
 *
 * NOTE on scope: `formatEuros` (useBudget) and `formatDate` (useTenders) are
 * deliberately NOT centralised here. Despite sharing names with local copies
 * in ClaimLedger.jsx / Datos.jsx, those copies have genuinely different output
 * (suffix "M €" vs prefix "€…M"; "—" vs "" fallbacks), so they are distinct
 * formatters, not duplicates. Only the truly-duplicated `timeAgo` was unified.
 */

/**
 * Relative-time label in Spanish ("ahora", "hace 5 min", "hace 3 h",
 * "hace 12 d", then an absolute date past 30 days). This unifies the two
 * previously-divergent copies in usePress (floor / 48h / 14d) and useQuejas
 * (round / 24h / 30d); the useQuejas thresholds are the canonical choice.
 *
 * @param {string|null|undefined} iso  ISO timestamp
 * @returns {string}
 */
export function timeAgo(iso) {
  if (!iso) return ''
  const now = Date.now()
  const then = new Date(iso).getTime()
  const mins = Math.round((now - then) / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins} min`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.round(hours / 24)
  if (days < 30) return `hace ${days} d`
  return new Date(iso).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * Turn a slug ("santa-rosa", "l_oliveral") into a Title-Cased label.
 *
 * @param {string|null|undefined} slug
 * @returns {string}
 */
export function prettyNeighborhood(slug) {
  if (!slug) return ''
  return slug
    .split(/[-_\s]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
