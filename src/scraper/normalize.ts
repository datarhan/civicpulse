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

/**
 * Aggressive matcher fold: lowercase, strip accents, drop every
 * non-alphanumeric char — so "Riba-roja", "riba roja", "ribarroja" and
 * "Ribarroja" all collapse to the same token. Previously duplicated
 * verbatim in ctbg.ts and consell-cv.ts.
 */
export function normalizeAlphanumeric(s: string): string {
  return stripDiacritics(s.toLowerCase()).replace(/[^a-z0-9]/g, '')
}

/**
 * The four orthographic variants of the municipality in administrative
 * texts — Catalán (Riba-roja / Túria) × Castilian (Ribarroja / Turia).
 * Every alias keeps the "de Túria / del Turia" disambiguator so the
 * Ebro-river dam "embalse de Riba-roja" (Aragón/Cataluña) never matches.
 * This is shared POLICY for the CTBG + Consell CV filters, not an
 * incidental constant — change it in one place only.
 */
export const RIBA_ROJA_ALIASES = [
  'Riba-roja de Túria',
  'Riba-roja del Turia',
  'Ribarroja de Túria',
  'Ribarroja del Turia',
]
