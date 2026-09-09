// @ts-check

// Registry of long-form data reportajes, NEWEST FIRST. Single shared source:
// the /reportajes index page AND the landing teaser block (ReportajeBlockD)
// both render from this list, so a pieza added here appears in both and the
// two surfaces can never drift (same discipline as src/nav.js).
//
// Each slug must have a frozen snapshot at public/data/reportajes/<slug>.json;
// a pieza only ever renders when its meta.estado === 'publicado' — the
// honesty gate every consumer of this list must keep.
export const REPORTAJE_SLUGS = [
  'conteo-visitantes',
  'coste-efectivo',
  'basuras',
  'inteligencia-turistica',
  'reconstruccion-dana',
]
