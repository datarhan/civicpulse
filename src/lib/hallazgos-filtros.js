// @ts-check
/**
 * Los filtros de /hallazgos y sus recuentos, juntos y puros.
 *
 * Están en el mismo fichero por la razón por la que se separaron del
 * componente: vivían en dos `useMemo` distintos y se les fue la unidad. El chip
 * de GRUPO contaba CITAS mientras los de severidad y pleno contaban HALLAZGOS,
 * y el filtro que el chip acciona selecciona hallazgos — así que la pastilla
 * decía «PSOE 48» y al pulsarla salían 27 filas. Medido sobre los 40
 * publicados: las pastillas de grupo sumaban 131, el triple del total, al lado
 * de las de pleno que suman exactamente 40. Dos unidades en el mismo bloque y
 * sin decirlo.
 *
 * Es la regla que `pleno-summary` ya escribe para los suyos —«un chip que
 * promete 7 y enseña 4 es peor que no tener filtro»— y que allí tiene prueba
 * desde el principio. Aquí no la tenía, y por eso el defecto duró: lo cazó la
 * revisión lectora del gancho de pre-push, no una prueba.
 *
 * Contar y filtrar salen del MISMO sitio para que no puedan volver a discrepar,
 * y `tests/hallazgos-filtros.test.js` afirma exactamente eso: cada recuento es
 * el número de filas que deja pasar su propio filtro.
 */

/** El sentinela de «sin atribuir». No es un grupo: es la ausencia de uno. */
export const SIN_ATRIBUIR = '—'

/**
 * Los grupos que aparecen en un hallazgo, sin repetir.
 *
 * Un hallazgo con cuatro citas del PSOE es UN hallazgo del PSOE, no cuatro.
 */
export function gruposDe(finding) {
  return new Set((finding?.quotes ?? []).map((q) => q.speakerGroup ?? SIN_ATRIBUIR))
}

/**
 * ¿Pasa este hallazgo los filtros activos? Un filtro vacío no filtra.
 *
 * El de área NO entra: depende del corpus de declaraciones, que es E/S, y
 * meterlo aquí obligaría a esta función a dejar de ser pura. El componente lo
 * aplica encima.
 */
export function pasaFiltros(finding, { severidad = null, grupo = null, pleno = null } = {}) {
  if (severidad && finding.severity !== severidad) return false
  if (grupo && !gruposDe(finding).has(grupo)) return false
  if (pleno && finding.plenoDate !== pleno) return false
  return true
}

/**
 * Cuántas FILAS deja pasar cada valor de cada filtro.
 *
 * Que la columna de grupo sume más que el total no es el defecto y no engaña:
 * un hallazgo con citas de dos grupos aparece en los dos, que es justo lo que
 * hace el filtro al pulsarlo. Lo que no puede pasar es que el número del chip
 * no sea el número de filas que enseña.
 */
export function contarHallazgos(items = []) {
  const bySeverity = {}
  const bySpeaker = {}
  const byPleno = {}
  for (const f of items) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1
    for (const g of gruposDe(f)) bySpeaker[g] = (bySpeaker[g] ?? 0) + 1
    byPleno[f.plenoDate] = (byPleno[f.plenoDate] ?? 0) + 1
  }
  return { bySeverity, bySpeaker, byPleno }
}
