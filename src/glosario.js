/**
 * El glosario: el único sitio donde una palabra llana se ata a una magnitud
 * oficial.
 *
 * La primera capa de las páginas densas («En breve») habla como un vecino —
 * «tope», «gastó», «lo que debe»— y cada una de esas palabras tiene que decir
 * a qué cifra oficial se refiere, o el resumen vuelve a mezclar lo que la
 * página de abajo separa. Por eso las definiciones viven aquí y no en cada
 * frase: «gastó» es SIEMPRE obligaciones reconocidas, en cualquier página que
 * lo use.
 *
 * Una frase del catálogo marca un término con `[[clave|texto]]`; `partesConTerminos`
 * lo parte y `TerminoGlosario` lo pinta como botón con su definición. Los
 * textos (término, definición) están en `src/i18n.jsx` bajo `glosario.<clave>.*`,
 * en los dos idiomas.
 */

/** Las claves del glosario. Un `[[clave|…]]` fuera de esta lista no se publica. */
export const GLOSARIO = ['creditoDefinitivo', 'obligacionesReconocidas', 'deudaViva']

const MARCA = /\[\[(\w+)\|([^\]]+)\]\]/g

/**
 * «Es un [[creditoDefinitivo|tope]], no un gasto.» →
 * ['Es un ', { clave: 'creditoDefinitivo', texto: 'tope' }, ', no un gasto.']
 *
 * Una clave que no está en el glosario se queda en su texto llano: un término
 * sin definición no se pinta como si la tuviera.
 *
 * @param {string} frase
 * @returns {(string | { clave: string, texto: string })[]}
 */
export function partesConTerminos(frase) {
  const out = []
  let desde = 0
  for (const m of String(frase).matchAll(MARCA)) {
    if (m.index > desde) out.push(frase.slice(desde, m.index))
    out.push(GLOSARIO.includes(m[1]) ? { clave: m[1], texto: m[2] } : m[2])
    desde = m.index + m[0].length
  }
  if (desde < String(frase).length) out.push(String(frase).slice(desde))
  return out
}

/** La frase sin marcas, tal como se lee. */
export function textoLlano(frase) {
  return partesConTerminos(frase)
    .map((p) => (typeof p === 'string' ? p : p.texto))
    .join('')
}
