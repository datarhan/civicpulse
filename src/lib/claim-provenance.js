/**
 * Quién dice haber comprobado una cita, dicho de forma que no invente crédito.
 *
 * `/declaraciones` rotula cada bloque de evidencia con la procedencia de la
 * comprobación. Era un ternario de dos ramas dentro del JSX:
 *
 *     v.checkedAgainst?.includes('llm-second-pass')
 *       ? 'verificador LLM'
 *       : 'verificador determinista'
 *
 * y ahí está el defecto: un `checkedAgainst` vacío significa «no consta qué
 * comprobó esto» y caía por el `else`, saliendo publicado con la procedencia
 * más fuerte que esta página sabe dar. Contra el snapshot del 2026-08-14, de
 * las 24 citas que lucían «verificador determinista» sólo 4 lo eran: las otras
 * 20 no tenían nada anotado.
 *
 * Es la regla nº3 de docs/DATA_INTEGRITY.md, «un centinela no es un valor», en
 * una página que cita a grupos municipales con nombre y apellidos. La misma
 * avería que hacía que `Otro` significara a la vez «un partido» y «no se puede
 * saber».
 *
 * Vive fuera del JSX para que se pueda medir contra el corpus publicado en vez
 * de sólo contra un render.
 */

/** Lo que se dice cuando no consta quién comprobó la cita. */
export const SIN_VERIFICADOR = 'sin verificador anotado'

/**
 * @param {string[] | null | undefined} checkedAgainst  fuentes que el
 *   verificador dejó anotadas al emitir el veredicto.
 * @returns {string} la procedencia, en minúsculas, tal cual va a la página.
 */
export function etiquetaVerificador(checkedAgainst) {
  // Primero el caso vacío, y a propósito: es el que estaba mal. Ausente, nulo o
  // lista vacía son la misma cosa —nadie anotó nada— y ninguno puede heredar la
  // etiqueta de los que sí.
  if (!Array.isArray(checkedAgainst) || checkedAgainst.length === 0) return SIN_VERIFICADOR
  if (checkedAgainst.includes('llm-second-pass')) return 'verificador LLM'
  return 'verificador determinista'
}
