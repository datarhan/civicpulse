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

/**
 * Decode the HTML entities that server-rendered Spanish/Valencian pages
 * actually emit — named Latin-1 letters plus numeric refs in both decimal
 * and hex form.
 *
 * It lives here rather than beside its first caller because five scrapers
 * already grew their own copy, and they have drifted: `sindicatura.ts`'s
 * private version DELETES numeric refs (`.replace(/&#\d+;/g, '')`) instead of
 * decoding them, so a `&#241;` silently eats the ñ. New call sites import this
 * one; the existing copies are left alone here on purpose, because changing
 * what they produce is a data change and belongs in its own commit with its
 * own fixtures.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  Aacute: 'Á',
  Eacute: 'É',
  Iacute: 'Í',
  Oacute: 'Ó',
  Uacute: 'Ú',
  agrave: 'à',
  egrave: 'è',
  ograve: 'ò',
  Agrave: 'À',
  Egrave: 'È',
  Ograve: 'Ò',
  ntilde: 'ñ',
  Ntilde: 'Ñ',
  ccedil: 'ç',
  Ccedil: 'Ç',
  uuml: 'ü',
  Uuml: 'Ü',
  iuml: 'ï',
  Iuml: 'Ï',
  ordm: 'º',
  ordf: 'ª',
  deg: '°',
  euro: '€',
  laquo: '«',
  raquo: '»',
  hellip: '…',
  ndash: '–',
  mdash: '—',
  rsquo: '’',
  lsquo: '‘',
  middot: '·',
}

export function decodeHtmlEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const cp =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10)
      // An unparseable or out-of-range ref stays verbatim rather than turning
      // into a replacement char: a visible `&#99999999;` is debuggable, a `�`
      // is a silent corruption of a quote we may later have to prove verbatim.
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : whole
    }
    return NAMED_ENTITIES[body] ?? whole
  })
}
