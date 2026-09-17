import { Fragment } from 'react'

/**
 * Una frase del catálogo con elementos dentro: cada `{hueco}` se pinta con el suyo,
 * donde la gramática de cada idioma lo pone. Un hueco sin elemento se queda escrito
 * y se ve, en vez de comerse el dato sin que se note, como en `partePorHueco`.
 *
 * Las claves van con sus llaves —`'{zona}'`—, que es lo que `i18n-catalogue.test.ts`
 * busca para dar un hueco por sustituido. Nació en la ficha de una queja; el índice
 * de plenos tiene frases así en cuatro tarjetas.
 *
 * @param {string} plantilla
 * @param {Record<string, import('react').ReactNode>} elementos
 * @returns {import('react').ReactNode[]}
 */
export function conHuecos(plantilla, elementos) {
  return plantilla
    .split(/(\{\w+\})/)
    .map((trozo, i) =>
      Object.hasOwn(elementos, trozo) ? <Fragment key={i}>{elementos[trozo]}</Fragment> : trozo,
    )
}
