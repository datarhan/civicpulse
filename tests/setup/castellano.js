/**
 * El detector de castellano de las pruebas que leen una superficie en valencià.
 *
 * Nació dentro de `tests/components/vivo-portada.test.jsx` para el panel «Hoy»
 * (#19) y vive aquí desde que la portada tuvo otro bloque que leer en valencià:
 * copiarlo habría sido mantener dos veces la misma forma de mirar. Cada prueba
 * declara lo que en SU superficie no se traduce —siglas, nombres de feed,
 * unidades— y recibe los dos detectores atados a esa lista.
 *
 * No es una prueba (vitest sólo recoge `*.test.*`): lo importan las pruebas.
 */
import { CATALOGUE } from '../../src/i18n'

/** Lo que el lector recibe de un nodo: sus textos y lo que sólo oye (`aria-label`). */
export function loQueSeLee(nodo, out = []) {
  if (nodo.nodeType === 3) {
    const s = nodo.textContent.trim()
    if (s) out.push(s)
    return out
  }
  if (nodo.nodeType !== 1) return out
  const aria = nodo.getAttribute('aria-label')
  if (aria) out.push(aria)
  for (const hijo of nodo.childNodes) loQueSeLee(hijo, out)
  return out
}

/** Las palabras de un texto, en minúsculas. */
export const palabras = (s) => s.toLowerCase().match(/\p{L}+/gu) ?? []

/**
 * Lo que el catálogo escribe igual en los dos idiomas («Metro», «Aire»): eso sí
 * pasó por él.
 *
 * Y el límite que eso deja, dicho y medido: una traducción valenciana SIN hueco
 * copiada tal cual del castellano pasa por aquí como si fuera una palabra que
 * se escribe igual. Con hueco no: «{estacion} (terminus)» copiado se pinta
 * relleno, deja de ser el valor del catálogo y cae. Cerrarlo del todo pediría
 * una lista de las palabras que de verdad coinciden, escrita a mano.
 */
export const IGUALES_EN_EL_CATALOGO = new Set(
  Object.keys(CATALOGUE.es)
    .filter((k) => CATALOGUE.es[k] === CATALOGUE.ca[k])
    .map((k) => CATALOGUE.es[k]),
)

/**
 * Las palabras que sólo usa el castellano del catálogo: las de sus cadenas que
 * no aparecen en ninguna valenciana. Salen del catálogo, así que crecen con él
 * y nadie tiene que mantenerlas. Las que las dos lenguas comparten —«de»,
 * «no», «metro»— no están en ella.
 */
export const SOLO_CASTELLANO = (() => {
  const valencianas = new Set(Object.values(CATALOGUE.ca).flatMap((v) => palabras(String(v))))
  return new Set(
    Object.values(CATALOGUE.es)
      .flatMap((v) => palabras(String(v)))
      .filter((p) => !valencianas.has(p)),
  )
})()

/**
 * Los dos detectores, atados a lo que en ESA superficie no se traduce.
 *
 * - `sinTraducir(pares)`: lo que se lee igual en castellano y en valencià sin
 *   ser dato, comparando la misma estructura pintada en los dos idiomas.
 * - `castellanoEn(texto)`: las palabras castellanas que asoman en un texto,
 *   aunque vayan pegadas a otras traducidas, que la comparación entera no ve.
 *
 * @param {string[]} noSeTraduce
 */
export function detectorDeCastellano(noSeTraduce) {
  const sinDatos = (s) => noSeTraduce.reduce((r, dato) => r.split(dato).join(' '), s)
  return {
    sinTraducir: (pares) =>
      pares
        .filter(([es, ca]) => es === ca && !IGUALES_EN_EL_CATALOGO.has(es))
        .map(([es]) => es)
        .filter((s) => /\p{L}/u.test(sinDatos(s))),
    castellanoEn: (texto) => [
      ...new Set(palabras(sinDatos(texto)).filter((p) => SOLO_CASTELLANO.has(p))),
    ],
  }
}
