// @ts-check
/**
 * Display config + grouping for the civic-POI map layer. Category keys match the
 * scraper's PoiCategory enum (src/scraper/civic-poi.ts) — keep the two in sync.
 * Pure, unit-tested; no React.
 */

/** Label + marker colour per civic category. Order = legend order. */
// §02: «Un acento de marca. Cinco veredictos. El cromo es gris. Si un color no
// emite un juicio, es gris.»
//
// Esto era un arcoíris de seis, y tres de sus colores estaban PRESTADOS de los
// veredictos: Salud iba en el rojo de «contradicho», Zonas verdes en el verde
// de «corroborado» y Cultura en el morado que en este sistema significa «esto
// lo ha escrito una máquina». Un colegio no es un veredicto, y esto se pinta en
// la primera pantalla que ve un vecino. (Educación llevaba además #2563EB, a un
// dígito del hexadecimal del PP.)
//
// Los puntos de interés son CONTEXTO —dónde están las cosas—, no una
// afirmación: son el fondo sobre el que se leen las capas que sí afirman
// (dinero, quejas, obras). Van en una rampa de pizarra, que se distingue paso a
// paso, no toma el croma de ningún juicio y no compite con el petróleo del
// dinero. La leyenda pone el nombre; el color sólo separa.
//
// La rampa está ACOTADA por abajo a que el paso más claro siga llegando a 3:1
// contra la tesela del mapa (WCAG 1.4.11, contraste de lo que no es texto). Una
// primera versión llegaba hasta #CBD5E1 y separaba mejor entre vecinos, pero
// sus dos últimos pasos quedaban a 2,16:1 y 1,25:1: dos de las seis categorías
// eran invisibles sobre el mapa. Separar mejor seis cosas que no se ven no es
// separarlas.
export const POI_CATEGORIES = {
  educacion: { label: 'Educación', color: '#0F172A' },
  salud: { label: 'Salud', color: '#243044' },
  verde: { label: 'Zonas verdes', color: '#38455C' },
  deporte: { label: 'Deporte', color: '#4C5A73' },
  cultura: { label: 'Cultura', color: '#5F6E88' },
  civico: { label: 'Servicios públicos', color: '#72819C' },
}

/**
 * Group POIs into a Map<category, {label, color, items[]}>, in POI_CATEGORIES
 * order, omitting categories with no POIs (so the legend never lists an empty
 * bucket).
 * @param {Array<{category:string}>} [pois]
 * @returns {Map<string, {label:string, color:string, items:any[]}>}
 */
export function groupPoiByCategory(pois) {
  const out = new Map()
  for (const key of Object.keys(POI_CATEGORIES)) {
    const items = (pois ?? []).filter((p) => p.category === key)
    if (items.length === 0) continue
    out.set(key, { label: POI_CATEGORIES[key].label, color: POI_CATEGORIES[key].color, items })
  }
  return out
}
