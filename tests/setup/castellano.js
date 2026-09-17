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

/**
 * Lo que no se lee aunque sea texto del DOM: una hoja de estilo en un `<style>` —con
 * sus comentarios en castellano— o un script. /plenos monta la suya dentro de la
 * página, y sin esto la guarda le pedía traducir los comentarios del CSS.
 */
const NO_SE_LEE = new Set(['STYLE', 'SCRIPT', 'TEMPLATE', 'NOSCRIPT'])

/** Lo que el lector recibe de un nodo: sus textos y lo que sólo oye (`aria-label`). */
export function loQueSeLee(nodo, out = []) {
  if (nodo.nodeType === 3) {
    const s = nodo.textContent.trim()
    if (s) out.push(s)
    return out
  }
  if (nodo.nodeType !== 1 || NO_SE_LEE.has(nodo.tagName)) return out
  const aria = nodo.getAttribute('aria-label')
  if (aria) out.push(aria)
  for (const hijo of nodo.childNodes) loQueSeLee(hijo, out)
  return out
}

/**
 * Lo que el lector recibe de un contenedor: sus textos, lo que sólo oye
 * (`aria-label`) y lo que le sale al pasar por encima (`title`), en orden de
 * documento. Vivía dentro de `mapa-valencia.test.jsx`; la portada lee igual.
 */
export const lectura = (container) => [
  ...loQueSeLee(container),
  ...[...container.querySelectorAll('[title]')].map((el) => el.getAttribute('title')),
]

/** Primero las más largas: «hab.» se tiene que quitar antes que «ha». */
export const masLargasPrimero = (xs) =>
  [...new Set(xs.filter((x) => x != null && x !== '').map(String))].sort(
    (a, b) => b.length - a.length,
  )

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

// ─── Qué es dato y qué es rótulo (compartido por las guardas bilingües) ─────

/** Todas las cadenas de un valor JSON. */
export const cadenasDe = (valor, out = new Set()) => {
  if (typeof valor === 'string') out.add(valor)
  else if (valor && typeof valor === 'object')
    for (const v of Object.values(valor)) cadenasDe(v, out)
  return out
}

/**
 * Un token de máquina —«services», «awarded», «naranja»— nunca es un dato para el
 * lector: pintado tal cual, es un enum sin rótulo, y esta guarda lo tiene que ver.
 */
export const esToken = (s) => /^[a-z][a-z0-9_-]*$/.test(s)

/**
 * Lo que la lectura castellana pinta de las instantáneas servidas: dato, no rótulo.
 *
 * Una cadena corta cuenta sólo si es la pieza ENTERA: la categoría «Obras» de un
 * contrato no puede tapar un rótulo «Obras». Una larga cuenta también dentro de una
 * pieza, o recortada con «…», que es como se pintan los titulares.
 */
export const datosPintados = (piezas, cadenas) => {
  const enteras = new Set(piezas)
  const todo = piezas.join('\n')
  const recortadas = piezas
    .filter((p) => p.length >= 12 && p.endsWith('…'))
    .map((p) => p.slice(0, -1))
  const out = new Set()
  for (const bruta of cadenas) {
    const s = bruta.trim()
    if (s.length < 2 || !/\p{L}/u.test(s) || esToken(s)) continue
    if (enteras.has(s)) out.add(s)
    else if (s.length >= 12) {
      if (todo.includes(s)) out.add(s)
      for (const r of recortadas) if (s.startsWith(r)) out.add(r)
    }
  }
  return [...out]
}
