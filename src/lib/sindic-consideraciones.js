/**
 * Cuántas resoluciones de «consideraciones a la Administración» CONSTAN.
 *
 * No es lo mismo que cuántas lista hoy el buscador del Síndic, y la diferencia
 * se publicó dos veces en /quejas en tres días:
 *
 *  · 18-09-2026, 06:56. El Síndic reindexaba tres expedientes y su buscador
 *    declaraba 47 resultados en vez de 50. La tarjeta dijo «11 que terminaron en
 *    consideraciones» junto a «13 fichas, una por cada resolución». Trece de once.
 *  · Desde las 09:34 de ese día. Los tres volvieron, pero el 202600533 volvió sin
 *    sus consideraciones —el buscador sólo lista ya su cierre—. La tarjeta pasó a
 *    decir 13 resoluciones, una de ellas para la Conselleria, y 13 fichas
 *    dirigidas al Ayuntamiento. Quien reste obtiene 12.
 *
 * Las dos cifras venían de fuentes distintas puestas en la misma frase: el
 * bloque `stats` del índice raspado y el registro curado de fichas. Un índice
 * raspado es un SUELO de lo que existe, no un techo: lo que deja de listar no ha
 * dejado de existir. Y una ficha firmada es conocimiento más fuerte que una fila
 * del índice —enlaza su PDF y `check:sindic-fichas` la coteja literal contra él
 * cada noche—, así que el índice no puede restarla.
 *
 * De ahí la unión, por PDF: lo que el buscador lista más lo que una ficha cita y
 * el buscador ya no. Y `fueraDelIndice` sale aparte porque la página tiene que
 * DECIRLO: sumar en silencio una resolución que el lector no va a encontrar en el
 * buscador del Síndic rompería el contrato de enseñar el trabajo.
 *
 * Qué NO hace: no juzga si el PDF sigue vivo. Eso es de `check:sindic-fichas`,
 * que pone el parte en rojo si una ficha deja de ser literal o su PDF cae.
 */

/**
 * El rótulo del propio Síndic. `tests/sindic-consideraciones.test.js` comprueba
 * que sigue en `TIPOS_RESOLUCION_CONOCIDOS` del parser, importado y no copiado:
 * no se importa aquí para no meter el parser entero en el bundle de la página.
 */
export const TIPO_CONSIDERACIONES = 'Resolución de consideraciones a la Administración'

/**
 * @param {Array<{expediente: string, resoluciones?: Array<{tipo: string, urlPdf?: string}>}>} [contra]
 *   `contraAyuntamiento` de sindic-expedientes.json.
 * @param {Array<{expediente: string, urlPdf?: string}>} [fichas]
 *   `items` de sindic.json: cada ficha firmada sale de una resolución de consideraciones.
 * @returns {{ enIndice: number, fueraDelIndice: Array<object>, total: number }}
 */
export function contarConsideraciones(contra, fichas) {
  const listadas = new Set()
  for (const e of contra ?? []) {
    for (const r of e?.resoluciones ?? []) {
      if (r?.tipo === TIPO_CONSIDERACIONES && r.urlPdf) listadas.add(r.urlPdf)
    }
  }

  // Por PDF y sin repetir: dos fichas sobre la misma resolución son una.
  const vistas = new Set()
  const fueraDelIndice = []
  for (const f of fichas ?? []) {
    if (!f?.urlPdf || listadas.has(f.urlPdf) || vistas.has(f.urlPdf)) continue
    vistas.add(f.urlPdf)
    fueraDelIndice.push(f)
  }

  return {
    enIndice: listadas.size,
    fueraDelIndice,
    total: listadas.size + fueraDelIndice.length,
  }
}
