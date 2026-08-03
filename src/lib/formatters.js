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

/**
 * Shorten a summary to fit a teaser slot WITHOUT slicing a word in half.
 *
 * The column's list rows truncate headlines with a naive `.slice()`, which is
 * tolerable for a title you are meant to click. A summary is meant to be READ,
 * and "…comportamiento de los visi…" reads as a rendering bug rather than an
 * abridgement. So: cut at the last space inside the budget, drop the dangling
 * punctuation that cut would strand ("visitantes,…"), and append one ellipsis.
 *
 * Two deliberate edge behaviours:
 *   · a word-boundary further back than 40% of the budget is ignored (a single
 *     very long token would otherwise return almost nothing) — hard-cut instead;
 *   · text already within budget comes back untouched, with NO ellipsis, so a
 *     short summary never pretends there is more to read.
 *
 * @param {string|null|undefined} text
 * @param {number} max  budget for the visible text; output is at most max + 1
 *                      characters (the ellipsis).
 * @returns {string}
 */
export function truncateAtWord(text, max) {
  if (!text) return ''
  const t = String(text).trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  const body = lastSpace > max * 0.4 ? cut.slice(0, lastSpace) : cut
  return body.replace(/[\s,;:.·—–-]+$/u, '') + '…'
}

/**
 * Render a date that may arrive EITHER as ISO or as hand-written Spanish prose.
 *
 * The reportaje snapshots carry both shapes — `publicadoEl: "15 de julio de
 * 2026"` next to `fechaDatos: "2026-07-06"` — and every surface that falls back
 * from one to the other has been printing the raw ISO string next to prose.
 * Anything non-ISO passes through verbatim rather than being guessed at.
 *
 * ISO date-only values are parsed as LOCAL midnight on purpose: `new
 * Date('2026-07-06')` is UTC midnight, which renders as the 5th for any reader
 * west of Greenwich. A publication date has no time zone.
 *
 * @param {string|null|undefined} value
 * @returns {string}
 */
export function fmtDateHuman(value) {
  if (!value) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!m) return value
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Return the URL only when it uses a safe web scheme (http/https), else null.
 * Guards against javascript:/data: hrefs from scraped external data (XSS).
 * @param {string|null|undefined} url
 * @returns {string|null}
 */
export function safeHref(url) {
  if (!url) return null
  try {
    const p = new URL(url)
    return p.protocol === 'http:' || p.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}
