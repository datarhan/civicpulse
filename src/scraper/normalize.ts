/**
 * Shared text-normalization primitives.
 *
 * Several scrapers and components need to fold accented Spanish/Catalan
 * characters down to ASCII before matching or slugifying. They all used
 * to inline the same two-line NFD-strip idiom; this module extracts the
 * common stem once so future call sites can't drift.
 *
 * What lives here:
 *   - stripDiacritics(s)  — NFD-decompose + drop combining marks.
 *                           No case changes, no whitespace changes.
 *                           The exact common denominator across 8+ call
 *                           sites in this repo.
 *   - slugify(s)          — stripDiacritics → lowercase → non-alnum→"-"
 *                           → trim leading/trailing hyphens. Identical
 *                           to the previous inlined versions in
 *                           src/scraper/geo.ts and src/scraper/corporacion.ts
 *                           so those call sites can import this.
 *
 * Each scraper's downstream normalizer (queja-router preserves ñ, paro
 * uppercases for XLS headers, ctbg collapses non-alnum to empty, press
 * uses the normalized form to build a word-fingerprint) stays local —
 * the behavioral differences matter. Those local wrappers can still
 * call stripDiacritics to avoid duplicating the NFD dance.
 */

const COMBINING_MARK_RANGE = /[̀-ͯ]/g

export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(COMBINING_MARK_RANGE, '')
}

export function slugify(s: string): string {
  return stripDiacritics(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
