// @ts-check
/**
 * Shared presentation formatters. Kept dependency-free (no React, no fetch)
 * so any hook, component, or page can import them.
 *
 * NOTE on scope: `formatEuros` (useBudget) stays deliberately NOT centralised
 * here — its local copies (ClaimLedger.jsx etc.) have genuinely different
 * output (suffix "M €" vs prefix "€…M"). `useTenders.formatDate` remains the
 * import path pages historically use, but it now delegates to fmtDateShort;
 * the "—"-fallback variants (Datos/Laboratorio/QuejaDetail) compose it as
 * `fmtDateShort(iso) || '—'`.
 */

/**
 * The two canonical Spanish absolute-date formats. Previously ~21 inline
 * `.toLocaleDateString('es-ES', …)` copies across pages had already drifted
 * (some omitted the year); pages should import these instead. The deliberate
 * exceptions that stay local: the landing topbar's weekday-long banner
 * (tokens.jsx) and the day+month-no-year KPI chips (KpiStrip/EditorialColumn).
 *
 * @param {string|null|undefined} iso
 * @returns {string} e.g. "3 jun 2026" — empty string when iso is falsy
 */
export function fmtDateShort(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * @param {string|null|undefined} iso
 * @returns {string} e.g. "3 de junio de 2026" — empty string when iso is falsy
 */
export function fmtDateLong(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

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
