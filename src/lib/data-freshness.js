// @ts-check
/**
 * Pure freshness helpers for snapshot-driven pages.
 *
 * The dashboard runs entirely off static JSON files refreshed nightly.
 * When a scraper silently breaks the SPA happily renders the previous
 * snapshot — the reader has no way to know they're looking at stale
 * data. These helpers map a `generatedAt` ISO string onto a tone
 * (matching the existing <Pill> enum) and a numeric age, so the
 * <DataAsOf> chip + /lab-health page can show staleness consistently.
 *
 * Boundaries chosen so a daily scraper that ran ~12h ago is still
 * `ok`, a weekly job is `civic` (notable but expected), a month is
 * `warn` (action item for the curator), and >30d is `crit` (something
 * is genuinely broken).
 */

/** Hours since the given ISO date. Returns +Infinity for missing/invalid input. */
export function ageHours(iso, now = Date.now()) {
  if (!iso || typeof iso !== 'string') return Number.POSITIVE_INFINITY
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY
  return Math.max(0, (now - t) / (1000 * 60 * 60))
}

/**
 * Maps freshness onto the <Pill> tone enum:
 *   < 36 h   → 'ok'    (fresh — well within a nightly cadence)
 *   < 7 d    → 'civic' (recent — weekly job, expected)
 *   < 30 d   → 'warn'  (stale — curator should check)
 *   >= 30 d  → 'crit'  (dead — likely broken)
 * Missing/invalid ISO → 'crit' (we treat absence as broken signal,
 * not as "unknown"; the page renders something either way).
 */
export function freshnessTone(iso, now = Date.now()) {
  const h = ageHours(iso, now)
  if (h < 36) return 'ok'
  if (h < 24 * 7) return 'civic'
  if (h < 24 * 30) return 'warn'
  return 'crit'
}

/** i18n key for the freshness bucket. The actual label lives in i18n.jsx. */
export function freshnessLabelKey(iso, now = Date.now()) {
  const tone = freshnessTone(iso, now)
  if (tone === 'ok') return 'freshness.fresh'
  if (tone === 'civic') return 'freshness.recent'
  if (tone === 'warn') return 'freshness.stale'
  return 'freshness.dead'
}
