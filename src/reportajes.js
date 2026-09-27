// @ts-check

// Registry of long-form data reportajes, NEWEST FIRST. Single shared source:
// the /reportajes index page AND the landing teaser block (ReportajeBlockD)
// both render from this list, so a pieza added here appears in both and the
// two surfaces can never drift (same discipline as src/nav.js).
//
// Each slug must have a frozen snapshot at public/data/reportajes/<slug>.json;
// a pieza is only ever LISTED when its meta.estado === 'publicado' — the
// honesty gate every consumer of this list must keep. Its own route still
// renders a draft, under a «Borrador editorial» banner: unlisted is not private.
export const REPORTAJE_SLUGS = [
  'conteo-visitantes',
  'coste-efectivo',
  'basuras',
  'inteligencia-turistica',
  'reconstruccion-dana',
]
