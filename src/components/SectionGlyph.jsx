/**
 * Per-section glyphs — Detalles Gráficos v2 §03 ("Un glifo, una sección").
 *
 * The brand canon is typographic (Unicode), no icon-font: every section owns
 * one unique glyph. This replaces the old SVG `Ic.*` rail, which reused
 * `Ic.scale` for Plenos + Promesas and `Ic.warn` for Hallazgos + Quejas +
 * Declaraciones — the exact collisions §03 calls out.
 *
 * Colour follows the brandbook §02 rule "un color semántico jamás tiñe un
 * icono de navegación — eso es del azul cívico": civic glyphs inherit
 * `currentColor` so they ride the nav's own muted→active ramp. The single
 * documented exception is Laboratorio, the AI surface, which carries the intel
 * purple ◈ it shares with everything IA-generated — on purpose.
 */

// tone: 'civic' → inherits currentColor (nav state) · 'intel' → always purple.
export const SECTION_GLYPHS = {
  '/': { glyph: '◉', tone: 'civic' }, // el pulso: punto vivo
  '/cambios': { glyph: '✦', tone: 'civic' }, // lo nuevo
  '/cargos': { glyph: '◇', tone: 'civic' }, // la insignia
  '/presupuesto': { glyph: '€', tone: 'civic' }, // literal
  '/plenos': { glyph: '▤', tone: 'civic' }, // el acta
  '/promesas': { glyph: '▣', tone: 'civic' }, // la casilla marcada
  '/departamentos': { glyph: '▦', tone: 'civic' }, // el organigrama
  '/hallazgos': { glyph: '▲', tone: 'civic' }, // la señal
  '/declaraciones': { glyph: '❝', tone: 'civic' }, // la cita
  '/datos': { glyph: '▥', tone: 'civic' }, // la tabla
  '/quejas': { glyph: '◍', tone: 'civic' }, // el pin sobre el mapa
  '/empleo': { glyph: '◪', tone: 'civic' }, // la vacante · sección añadida tras §03
  '/empleo-publico': { glyph: '⊞', tone: 'civic' }, // la convocatoria pública
  '/laboratorio': { glyph: '◈', tone: 'intel' }, // comparte glifo con IA — a propósito
  // Sections outside the §03 grid — kept unique so the whole rail stays 1:1.
  '/metodologia': { glyph: '§', tone: 'civic' }, // el contrato editorial
  '/aviso-legal': { glyph: '¶', tone: 'civic' }, // el marginal legal (pareja de §)
  '/nosotros': { glyph: '❦', tone: 'civic' }, // el colofón: quién firma
  '/laboratorio/agentes': { glyph: '✎', tone: 'intel' }, // el periodista (familia IA)
  '/curator': { glyph: '⧉', tone: 'civic' }, // la mesa de curación (dev)
}

const FALLBACK = { glyph: '·', tone: 'civic' }

export function glyphFor(to) {
  return SECTION_GLYPHS[to] || FALLBACK
}

/**
 * @param {object} props
 * @param {string} props.to      route key into SECTION_GLYPHS
 * @param {number} [props.size]  box size in px (matches the old 18px SVG rail)
 * @param {object} [props.style] extra styles merged onto the glyph span
 */
export function SectionGlyph({ to, size = 18, style }) {
  const { glyph, tone } = glyphFor(to)
  return (
    <span
      data-section-glyph
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        flexShrink: 0,
        fontSize: Math.round(size * 0.94),
        lineHeight: 1,
        // §02: nav glyphs are never tinted by a semantic colour — civic rides
        // the nav's currentColor; only the AI surface keeps its intel purple.
        color: tone === 'intel' ? 'var(--intel)' : 'currentColor',
        ...style,
      }}
    >
      {glyph}
    </span>
  )
}
