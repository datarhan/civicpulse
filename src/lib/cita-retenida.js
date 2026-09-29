/**
 * La cita retenida: el predicado, el resultado de la puerta que lo decide y el
 * rótulo del hueco. Una sola definición para la página, la copia servida, las
 * comprobaciones y sus pruebas.
 *
 * El rótulo lo pinta `CitaRetenida` y lo nombra la nota de «acusación no
 * contrastada» (PlenoFindings.jsx), y la bitácora de correcciones rotula con él
 * las filas cuyo literal retiene la copia servida
 * (src/scraper/literales-retenidos.ts).
 *
 * El predicado vivía en PlenoFindings.jsx, y fuera de la página cada cual lo
 * reescribía a su manera —`gate === 'hidden'` en `check:summary-gate`,
 * `=== PUERTA_QUE_RETIENE` en la transformación de la copia servida y en su
 * relectura al compilar—: la regla 1 de docs/DATA_INTEGRITY.md otra vez, con un
 * predicado en vez de un enum. Desde el 29-09-2026 todos lo importan de aquí.
 *
 * Vive aparte, sin datos y SIN IMPORTS, porque la bitácora la comparten
 * /laboratorio, /eficiencia, /gestion y /promesas: importarlo de PlenoFindings
 * les colgaba a esas rutas los ficheros de hallazgos en el grafo de rutas, y
 * con ellos el mapa de prosa (`tests/stale-copy-paths.test.js` lo cazó). Por
 * eso `PUERTA_QUE_RETIENE` no se importa del enum de la puerta: lo comprueban
 * contra él el tipo de `literales-retenidos.ts` al compilar y
 * `tests/literales-retenidos.test.ts` al ejecutar.
 */
export const ROTULO_CITA_RETENIDA = 'Literal retenido'

/**
 * El resultado de `claim-public-gate.ts` (`CLAIM_VISIBILITIES`) que retiene el
 * literal: una acusación pública que el verificador no pudo contrastar con
 * ningún dato municipal, o un `contradicho` asignado por máquina.
 */
export const PUERTA_QUE_RETIENE = 'hidden'

/**
 * ¿La puerta editorial retiene el literal de esta cita?
 *
 * `claim-public-gate.ts` se llama a sí mismo «la única fuente de verdad sobre
 * lo que la salida del verificador puede enseñar al público», y falla del lado
 * seguro. `/plenos` y `/declaraciones` la obedecen; en /hallazgos se
 * CONSULTABA para marcar, pero el literal se publicaba igual.
 *
 * Decisión del operador, 2026-08-27: una sola política en las dos superficies.
 * El argumento que la había frenado —«borrar citas es un acto editorial mayor
 * hecho por el mismo tipo de proceso»— vale también al revés: publicarlas lo
 * es, y la puerta ya toma exactamente esta decisión una pantalla más allá. Dos
 * políticas para el mismo literal es lo que no se sostiene.
 *
 * Lo que se retiene es EL LITERAL, no la ficha: el hallazgo, su resumen, su
 * atribución y su derecho de réplica siguen enteros. Y se dice que falta, con
 * su motivo, en vez de dejar un hueco mudo.
 *
 * @param {{ gate?: string | null } | null | undefined} entry
 *   la fila de la cita en finding-quote-provenance.json (`provenanceFor`)
 * @param {{ text?: string; literalRetenido?: boolean } | null | undefined} [quote]
 *   la cita, del fichero del repositorio (con `text`) o de la copia servida
 * @returns {boolean}
 */
export function citaRetenida(entry, quote) {
  // La copia servida de pleno-findings.json ya no trae el literal de una
  // retenida, y lo dice (`literalRetenido`, src/scraper/literales-retenidos.ts):
  // sin procedencia, la cita se pintaría como «» vacía atribuida a un grupo.
  return entry?.gate === PUERTA_QUE_RETIENE || quote?.literalRetenido === true
}
