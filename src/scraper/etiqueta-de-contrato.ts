/**
 * La etiqueta llana de un contrato: qué es, en una línea (auditoría de las dos
 * lecturas, 25-10-2026, §2).
 *
 * /cambios pintaba el título oficial tal cual. 519 de los 814 contratos
 * publicados pasan de 100 caracteres, y el de la semana auditada era una frase de
 * 45 palabras: «contrato derivado del SDA de servicios de arquitectura e
 * ingeniería…». Un vecino que pregunta «¿qué contrató el Ayuntamiento?» no
 * llegaba al objeto.
 *
 * La etiqueta no resume: **quita y corta**, y no añade ni cambia una palabra.
 * Siempre es un trozo seguido del título (la prueba lo comprueba con los 814):
 *
 * 1. Quita la fórmula de delante: el código CPV («79900000-…»), «El objeto del
 *    contrato es», «Contrato administrativo / menor / verbal de», «Contrato
 *    derivado del sistema dinámico de adquisición… para», «Contrato derivado
 *    Acuerdo marco sobre», y el artículo que queda suelto. Lo que dice qué clase
 *    de contrato es y no es fórmula —«emergencia», «Lote 1»— se queda.
 * 2. Corta donde empieza el procedimiento: «por procedimiento abierto…»,
 *    «financiado con…», «en el marco de…», «contrato derivado…», el número de
 *    contrato o de expediente.
 * 3. Si aún pasa de ETIQUETA_MAXIMA, corta en el último espacio, sin dejar una
 *    preposición colgando, y pone «…».
 *
 * El título entero sigue debajo de la etiqueta: lo que se quita se ve.
 */

/** Caracteres de la etiqueta, sin contar la elipsis. */
export const ETIQUETA_MAXIMA = 100

/** La fórmula de delante, en el orden en que se prueba. */
const FORMULAS: RegExp[] = [
  /^\d{8}(?:-\d)?\s*-\s*/,
  /^el\s+objeto\s+del\s+(?:presente\s+)?contrato\s+(?:es|son|consiste\s+en)\s+/i,
  /^objeto\s+(?:de\s+la\s+)?contrataci[oó]n\s+(?:es|son)\s+/i,
  /^(?:acuerdo\s+(?:de\s+)?)?inicio\s*,?\s+(?:aprobaci[oó]n\s+del\s+expediente\s+)?(?:(?:de|del)\s+)?(?:expediente\s+)?y\s+adjudicaci[oó]n\s+(?:directa\s+)?(?:(?:de|del)\s+)?(?:contrato\s+)?(?:para\s+)?/i,
  /^(?:contrato|contrataci[oó]n)\s+derivad[oa]\s+del\s+sistema\s+din[aá]mico\s+de\s+adquisici[oó]n\s*(?:\(sda\)\s*)?(?:de\s+(?:servicios|obras|suministros)(?:\s+de\s+diversa\s+[ií]ndole)?\s*)?,?\s*(?:para\s+)?/i,
  /^contrato\s+derivado\s+(?:del\s+)?acuerdo\s+marco\s+(?:sobre|de|para)\s+/i,
  /^contrato\s*,\s*de\s+car[aá]cter\s+menor\s*,\s*(?:(?:para|de|del)\s+)?/i,
  /^contrato\s+(?:(?:administrativo|menor|verbal|de\s+car[aá]cter\s+menor)\s+)*(?:(?:de|del|para|relativo\s+al?)\s+)?/i,
  /^(?:servicios?|suministros?|obras?)\s*,\s*(?:de\s+car[aá]cter\s+menor\s*,\s*)?(?:para\s+)?/i,
  /^(?:el|la|los|las)\s+/i,
]
/** Lo que queda suelto tras quitar la fórmula: «…es la de prestación…». */
const DE_SUELTO = /^de\s+/i

/** Donde empieza el procedimiento; se corta en el primero que no deje la etiqueta en nada. */
const CORTES: RegExp[] = [
  /,?\s+contrato\s+derivado\b/i,
  /,?\s+(?:mediante|por)\s+(?:procedimiento|concurrencia)\b/i,
  /,?\s+financiad[oa]s?\b/i,
  /,?\s+en\s+el\s+marco\s+del?\b/i,
  /[.,]?\s*\(?\s*ctto\.?\s*\d/i,
  /[.,]?\s*\(?\s*exp(?:te|ediente)\.?\s*(?:n[ºo°.]*\s*)?\d/i,
]
/** Lo mínimo que tiene que quedar antes de un corte. */
const MINIMO_ANTES_DEL_CORTE = 20

/**
 * Palabras que no pueden acabar una etiqueta. Con el corte del procedimiento
 * también: «…navideño a través del | contrato derivado…» y «…multimedia mediante
 * | contrato derivado…» dejaban el enlace colgando; y la fuente trae algún título
 * ya cortado («Contrato de suministro de»). Sólo en minúscula: en «EDIFICIO A»,
 * la «A» es un nombre.
 */
const COLGANDO =
  /\s+(?:a\s+trav[eé]s\s+del?|mediante|de|del|la|el|los|las|en|y|e|a|al|por|para|con|sin|sobre)$/

/** Quita lo que cuelga al final, en varias vueltas: «… a través del» → «…». */
function sinColgando(s: string): string {
  let t = sinPuntuacionFinal(s)
  for (let i = 0; i < 4 && COLGANDO.test(t); i++) t = sinPuntuacionFinal(t.replace(COLGANDO, ''))
  return t
}

const plano = (s: string) => s.replace(/\s+/g, ' ').trim()
const sinPuntuacionFinal = (s: string) => s.replace(/[\s.,;:(]+$/, '')

/** Para comparar: sin mayúsculas, sin código CPV, sin el punto final. */
const comparable = (s: string) =>
  sinPuntuacionFinal(plano(s).replace(/^\d{8}(?:-\d)?\s*-\s*/, '')).toLowerCase()

export interface EtiquetaDeContrato {
  etiqueta: string
  /** true si la etiqueta dice menos que el título: entonces el título va debajo. */
  recortada: boolean
}

export function etiquetaDeContrato(titulo: string | null | undefined): EtiquetaDeContrato {
  const original = plano(String(titulo ?? ''))
  if (!original) return { etiqueta: '', recortada: false }

  // 1. La fórmula de delante, hasta que no quede ninguna.
  let t = original
  let quitado = false
  for (let vuelta = 0; vuelta < 8; vuelta++) {
    const antes = t
    for (const f of FORMULAS) t = t.replace(f, '')
    if (quitado || t !== antes) t = t.replace(DE_SUELTO, '')
    if (t !== antes) quitado = true
    if (t === antes) break
  }
  if (!t) t = original

  // 2. Donde empieza el procedimiento.
  let corte = t.length
  for (const c of CORTES) {
    const m = c.exec(t)
    if (m && m.index >= MINIMO_ANTES_DEL_CORTE && m.index < corte) corte = m.index
  }
  t = sinColgando(t.slice(0, corte))

  // 3. El tope, en un espacio y sin preposición colgando.
  let elipsis = false
  if (t.length > ETIQUETA_MAXIMA) {
    const espacio = t.lastIndexOf(' ', ETIQUETA_MAXIMA)
    t = sinColgando(t.slice(0, espacio > ETIQUETA_MAXIMA / 2 ? espacio : ETIQUETA_MAXIMA))
    elipsis = true
  }

  const etiqueta = t.charAt(0).toLocaleUpperCase('es') + t.slice(1) + (elipsis ? '…' : '')
  return { etiqueta, recortada: elipsis || comparable(t) !== comparable(original) }
}
