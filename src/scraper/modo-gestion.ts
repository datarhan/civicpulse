/**
 * El modo de gestión de un servicio en CESEL: la clase con la que se compara
 * y las preguntas que se le hacen a la cadena literal del ministerio.
 *
 * Vive aparte del parser porque la página lo necesita: indicador-lectura.ts se
 * sirve al navegador, y coste-efectivo.ts arrastra SheetJS. Sin red, sin
 * ficheros, sin dependencias.
 */

/**
 * How the service is run, which decides what the cost figure even means.
 *
 * `otra` and `sin-clasificar` are NOT the same state and must never be folded.
 * `otra` is the source saying «Otro tipo de gestión (**)» — that is data, and
 * it can be any share of an entrega. `sin-clasificar` is this classifier
 * failing to recognise a string — that is a defect, and its share is what the
 * test ceiling is aimed at. Collapsing them would make the ceiling
 * unfalsifiable, which is failure mode 1 of docs/DATA_INTEGRITY.md.
 */
export const MODOS_GESTION = [
  'directa',
  'concesion',
  'mancomunada',
  'consorciada',
  'convenio',
  'mixta',
  'otra',
  'sin-clasificar',
  'no-se-presta',
] as const
export type ModoGestion = (typeof MODOS_GESTION)[number]

/** Lowercase and strip diacritics, so a re-encoded entrega cannot break matching. */
function norm(s: string): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Map the ministry's CodGestion vocabulary onto the comparability classes.
 *
 * The 2021 Comunitat Valenciana entrega publishes fourteen distinct strings.
 * The grouping follows the ministry's own top-level word (directa / indirecta)
 * because that is what determines whether the council bears the cost:
 *
 *  - the four «Gestión directa por …» variants (entidad local, organismo
 *    autónomo, entidad pública empresarial, sociedad mercantil local) all mean
 *    the cost lands in the council's accounts → `directa`
 *  - «Gestión indirecta por sociedad de economía mixta» → `mixta`: the
 *    council co-owns the operator, so it is neither its own service nor a
 *    third party's, and it forms its own peer group
 *  - the other three «Gestión indirecta …» variants (concesión a riesgo y
 *    ventura, concierto, interesada) → `concesion`. The class groups them for
 *    COMPARISON; it does not make them the same thing. Only the first is a
 *    concession in the strict sense — see `esGestionPorConcesion`.
 *  - anything carrying «+ otra forma de gestión (*)» is a hybrid: part of the
 *    cost sits elsewhere, which makes it exactly as uncomparable as a
 *    concession, so it joins `otra` and never enters a peer pool.
 *
 * ORDER MATTERS, twice. The hybrid marker is checked before the family words
 * it is appended to, and `mixta` before the generic `indirecta`: the mixed
 * company's string STARTS with «Gestión indirecta», and until 2026-10-19 the
 * generic test ran first, so `mixta` was unreachable and Calp's water and
 * sewerage (2014, 2015, 2024) sat in Riba-roja's concession pool.
 */
export function clasificarGestion(codGestion: string): ModoGestion {
  const s = norm(codGestion)
  if (!s) return 'sin-clasificar'
  if (s.includes('no se presta')) return 'no-se-presta'
  // Check the hybrid marker BEFORE the family words it is appended to.
  if (s.includes('otra forma de gestion')) return 'otra'
  if (s.includes('otro tipo de gestion')) return 'otra'
  // And the specific indirect form BEFORE the generic word it begins with.
  if (s.includes('mixta')) return 'mixta'
  if (s.includes('indirecta')) return 'concesion'
  if (s.includes('mancomunada') || s.includes('comarcal') || s.includes('diputacion')) {
    return 'mancomunada'
  }
  if (s.includes('consorciada')) return 'consorciada'
  if (s.includes('convenio')) return 'convenio'
  if (s.includes('directa')) return 'directa'
  return 'sin-clasificar'
}

/**
 * ¿Es una concesión propiamente dicha —«Gestión indirecta mediante concesión,
 * gestionando el concesionario el servicio a su riesgo y ventura»—, y no sólo
 * algo de la clase `concesion`?
 *
 * La clase junta tres formas indirectas para COMPARARLAS entre sí, y eso es
 * todo lo que dice. Lo que la página afirma de una concesión —que el coste lo
 * cobra el concesionario del recibo y no sale del presupuesto— no es cierto de
 * un concierto, en el que el ayuntamiento paga a la empresa por prestarlo, ni
 * hay por qué darlo por cierto de la gestión interesada. Toda frase que diga
 * «concesionario» pregunta aquí, por la cadena del ministerio, y no por la clase.
 */
export function esGestionPorConcesion(codGestionRaw: string): boolean {
  const s = norm(codGestionRaw)
  if (s.includes('otra forma de gestion')) return false
  return s.includes('indirecta mediante concesion')
}
