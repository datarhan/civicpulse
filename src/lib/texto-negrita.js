// @ts-check
/**
 * `**negrita**` y saltos de párrafo, y nada más.
 *
 * Nació en CorrectionNote: el texto de una corrección se pintaba crudo y la del
 * 02-08-2026 llevó meses publicada enseñando sus propios asteriscos. El
 * 06-09-2026 el mismo defecto apareció en los relatos de las 21 biografías del
 * agente periodista («**puesto n.º 6**» a la vista), así que el trozeador vive
 * aquí y lo comparten los dos.
 *
 * NO es un intérprete de Markdown y no debe convertirse en uno: React escapa
 * cada trozo, así que aquí no entra HTML por mucho que lo traiga el JSON. Un
 * asterisco suelto se queda como asterisco, que es lo que quiere decir.
 */

/**
 * @typedef {{ negrita: string, texto?: undefined } | { texto: string, negrita?: undefined }} Trozo
 */

/**
 * @param {string} texto
 * @returns {Trozo[][]} párrafos → trozos
 */
export function trozos(texto) {
  return texto.split(/\n\n+/).map((parrafo) =>
    parrafo.split(/(\*\*[^*]+\*\*)/g).map((t) => {
      if (t.startsWith('**') && t.endsWith('**') && t.length > 4) return { negrita: t.slice(2, -2) }
      return { texto: t }
    }),
  )
}

/**
 * La primera frase del texto, para un summary plegado.
 *
 * Corta en el primer punto seguido de espacio o fin de párrafo; si el texto es
 * una sola frase corta, el summary la lleva entera.
 *
 * @param {string} texto
 * @returns {string}
 */
export function primeraFrase(texto) {
  const primerParrafo = texto.split(/\n\n+/)[0].replace(/\*\*/g, '')
  const m = primerParrafo.match(/^.*?[.!?](?=\s|$)/)
  return (m ? m[0] : primerParrafo).trim()
}
