// @ts-check
/**
 * The period an accumulated figure actually covers, measured from the rows
 * behind it.
 *
 * Every accumulated total on this site sits somewhere near a one-year budget,
 * and without its own period a reader compares the two: the landing page
 * published «698 contratos · 67.996.704 €» under a «Gobierno municipal · 2025»
 * heading beside a €41,6M annual budget, which reads as a town awarding more
 * than it budgets. It does not — the contracts span nine exercises.
 *
 * Always DERIVE the span from the counted rows; never type it. A literal
 * «2017–2026» is correct only until the next scraper run, and it goes stale
 * silently — nothing fails, the page just starts lying. `department-stats.js`
 * computes `contratacionYears` the same way and for the same reason.
 *
 * Pass the dates of exactly the rows the number counts. A span measured over a
 * wider set than the figure describes is the same defect one level down.
 *
 * @param {Array<string|null|undefined>} dates ISO-ish date strings; anything
 *   whose first four characters are not a year is ignored.
 * @returns {string|null} «2017–2026», or «2019» when every row shares a year,
 *   or null when no row carries a usable date — callers must render nothing
 *   rather than an invented period.
 */
export function yearSpan(dates) {
  const years = (dates ?? [])
    .map((d) => String(d ?? '').slice(0, 4))
    .filter((y) => /^\d{4}$/.test(y))
    .sort()
  if (years.length === 0) return null
  const first = years[0]
  const last = years[years.length - 1]
  // En dash, matching /departamentos' `${from}–${to}`.
  return first === last ? first : `${first}–${last}`
}
