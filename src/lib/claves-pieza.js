// @ts-check
/**
 * «Lo que hemos encontrado»: las claves de una pieza (auditoría de las dos
 * lecturas, §16). Entre tres y cinco hallazgos, una frase cada uno, que lleva a
 * la sección que lo prueba. Son periodismo: las escribe la redacción, se
 * revisan frase por frase contra la pieza y se congelan en su instantánea
 * (`claves` en public/data/reportajes/<slug>.json) con las cifras. Nunca se
 * derivan ni se generan.
 *
 * Esto sólo comprueba la forma. Si cada frase dice lo que la pieza prueba lo
 * comprueba quien la revisa, y si cada sección existe lo comprueba
 * reportajes.spec.ts sobre la pieza pintada.
 */

export const CLAVES_MIN = 3
export const CLAVES_MAX = 5
/** Una frase que se lee de un vistazo; la plantilla del plan dice «una frase». */
export const PALABRAS_MAX = 35
const CAMPOS = ['texto', 'seccion']

/**
 * Los problemas de forma de las claves de una pieza; vacío si no hay ninguno.
 * @param {unknown} claves
 * @returns {string[]}
 */
export function problemasDeClaves(claves) {
  if (!Array.isArray(claves)) return ['`claves` no es una lista']
  const out = []
  if (claves.length < CLAVES_MIN || claves.length > CLAVES_MAX)
    out.push(`${claves.length} claves; van de ${CLAVES_MIN} a ${CLAVES_MAX}`)
  claves.forEach((c, i) => {
    const n = `clave ${i + 1}`
    if (!c || typeof c !== 'object') {
      out.push(`${n}: no es un objeto`)
      return
    }
    for (const k of Object.keys(c)) if (!CAMPOS.includes(k)) out.push(`${n}: campo «${k}» de más`)
    const texto = typeof c.texto === 'string' ? c.texto.trim() : ''
    if (!texto) out.push(`${n}: sin texto`)
    else {
      const palabras = texto.split(/\s+/).length
      if (palabras > PALABRAS_MAX)
        out.push(`${n}: ${palabras} palabras; como mucho ${PALABRAS_MAX}`)
      if (!/[.]$/.test(texto)) out.push(`${n}: no acaba en punto`)
      if (/[.!?…]\s+\p{Lu}/u.test(texto)) out.push(`${n}: más de una frase`)
      if (/[?!¿¡]/.test(texto)) out.push(`${n}: pregunta o exclamación`)
    }
    if (typeof c.seccion !== 'string' || !/^\d{2}$/.test(c.seccion))
      out.push(`${n}: la sección va con dos cifras («03»)`)
  })
  return out
}
