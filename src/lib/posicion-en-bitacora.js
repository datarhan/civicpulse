/**
 * Qué cita —o qué documento cotejado— nombra hoy una fila de bitácora escrita
 * por su POSICIÓN: `quote.1.text`, `quote.0.speakerGroup`, `quote.3`.
 *
 * El índice de esas filas es el que tenía la cita cuando se escribió la fila, y
 * retirar una cita renumera las siguientes (bloque REMOVAL de
 * src/scraper/pleno-finding.ts: las retiradas de una ficha van de mayor a menor,
 * y repetir el registro en orden da el resultado). Así que el nombre del campo
 * no dice qué cita es, pero el registro sí: basta con seguir la posición por las
 * retiradas posteriores.
 *
 * Dos defectos de lectura salían de no hacerlo, y los dos los leyó la revisión
 * de superficies del 14-10-2026 en /hallazgos:
 *
 *   · La bitácora rotulaba `quote.1.text` una fila sobre la que la ficha llama
 *     «Cita 2», porque el campo cuenta desde 0 y la ficha desde 1. Al lado de
 *     «La cita 1 consta literalmente en la transcripción anterior y no en la
 *     vigente», un «quote.1.text · 2026-08-10 · Reanclaje a la transcripción
 *     vigente» se leía como su desmentido.
 *   · Una fila de cita rotulaba «Texto vigente» lo que puso aunque otra
 *     posterior hubiera vuelto a cambiar esa misma cita o la hubiera retirado
 *     (`sustitutas`, en BitacoraCorrecciones.jsx, las dejaba fuera por eso).
 *
 * Sin datos y SIN IMPORTS: lo leen la bitácora, que comparten varias páginas, y
 * la compilación de la copia servida (src/scraper/grupos-retenidos.ts).
 */

const RETIRADA = /^(quote|crossChecked)\.(\d+)$/
const DE_UNA = /^(quote|crossChecked)\.(\d+)(?:\.(.+))?$/

/** ¿Es la fila la retirada entera de una cita o de un documento cotejado? */
export const esRetirada = (fila) => RETIRADA.test(String(fila?.field ?? ''))

/**
 * Sigue la fila `i` por las filas posteriores del registro.
 *
 * Devuelve `null` si el campo no nombra una cita ni un documento cotejado por su
 * posición. Si no:
 *
 *   · `coleccion`: `quote` o `crossChecked`.
 *   · `hoy`: el índice que la cita tiene HOY en la ficha (desde 0), o `null` si
 *     se retiró después —o si la fila es ella misma la retirada—.
 *   · `posterior`: la primera fila posterior que dejó sin efecto lo que puso
 *     ésta —otra que vuelve a cambiar el mismo campo de la misma cita, o la que
 *     la retira—, o `null` si lo que puso sigue siendo lo que la ficha publica.
 *
 * @param {ReadonlyArray<{ field?: string }>} correcciones
 * @param {number} i
 */
export function seguirPosicion(correcciones, i) {
  const m = DE_UNA.exec(String(correcciones[i]?.field ?? ''))
  if (!m) return null
  const [, coleccion, , resto] = m
  if (resto === undefined) return { coleccion, hoy: null, posterior: null }
  let k = Number(m[2])
  let posterior = null
  for (const d of correcciones.slice(i + 1)) {
    const field = String(d?.field ?? '')
    const r = RETIRADA.exec(field)
    if (r && r[1] === coleccion) {
      const j = Number(r[2])
      if (j === k) return { coleccion, hoy: null, posterior: posterior ?? d }
      if (j < k) k -= 1
    } else if (posterior === null && field === `${coleccion}.${k}.${resto}`) {
      posterior = d
    }
  }
  return { coleccion, hoy: k, posterior }
}

/**
 * El índice que tenía, en el momento de la fila `hasta`, la cita que nombraba la
 * fila `i` (anterior a ella); `null` si se retiró entre medias o si la fila `i`
 * no nombra una cita por su posición.
 *
 * @param {ReadonlyArray<{ field?: string }>} correcciones
 * @param {number} i
 * @param {number} hasta
 */
export function indiceAlLlegarA(correcciones, i, hasta) {
  const m = DE_UNA.exec(String(correcciones[i]?.field ?? ''))
  if (!m || m[3] === undefined) return null
  const coleccion = m[1]
  let k = Number(m[2])
  for (const d of correcciones.slice(i + 1, hasta)) {
    const r = RETIRADA.exec(String(d?.field ?? ''))
    if (!r || r[1] !== coleccion) continue
    const j = Number(r[2])
    if (j === k) return null
    if (j < k) k -= 1
  }
  return k
}

/**
 * ¿Hablan las filas `a` y `b` de la misma cita? Lo dicen sus posiciones seguidas
 * por las retiradas que hubo entre las dos, no sus nombres de campo.
 *
 * @param {ReadonlyArray<{ field?: string }>} correcciones
 * @param {number} a
 * @param {number} b
 */
export function mismaCita(correcciones, a, b) {
  if (a === b) return true
  const [antes, despues] = a < b ? [a, b] : [b, a]
  const m = DE_UNA.exec(String(correcciones[despues]?.field ?? ''))
  const n = DE_UNA.exec(String(correcciones[antes]?.field ?? ''))
  if (!m || !n || m[1] !== 'quote' || n[1] !== 'quote' || m[3] === undefined) return false
  const k = indiceAlLlegarA(correcciones, antes, despues)
  return k !== null && k === Number(m[2])
}
