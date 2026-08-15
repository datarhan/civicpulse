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
 * Las anotaciones que dejan los verificadores que NO son deterministas.
 *
 * `llm-second-pass` y `verdict-engine` son los dos pasos de modelo: el segundo
 * repasa los veredictos del primero con gpt-5.4-mini y sólo se le hace caso
 * cuando RETRACTA (ver scripts/verify-pleno-claims-engine.ts). Llamar
 * «determinista» a cualquiera de los dos es la misma mentira que este fichero
 * existe para no contar, sólo que con otro nombre.
 */
const VERIFICADORES_LLM = ['llm-second-pass', 'verdict-engine']

/** Lo que anota `downgrade-verdict` cuando una persona corrige un veredicto. */
const CORRECCION_DE_CURADOR = 'curator-downgrade'

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
  // El curador va ANTES que los demás: si una persona ha corregido el veredicto,
  // eso es lo que hay que decir, y no en qué se apoyó la máquina a la que
  // corrigió.
  if (checkedAgainst.includes(CORRECCION_DE_CURADOR)) return 'corregido por un curador'
  if (checkedAgainst.some((c) => VERIFICADORES_LLM.includes(c))) return 'verificador LLM'
  return 'verificador determinista'
}
