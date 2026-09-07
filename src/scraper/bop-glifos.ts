/**
 * Búsqueda tolerante a glifos desplazados en el texto extraído de un BOP.
 *
 * El PDF del BOP n.º 97 (26-04-2011, candidaturas municipales) lleva una
 * fuente sin tabla ToUnicode: `pdftotext` y `pdf-parse` sacan parte de los
 * nombres con cada glifo 29 posiciones por debajo de su carácter — «Don»
 * aparece como «'RQ», «GIMENO CALVO» como «*,0(12&$/92» y el espacio cae en
 * el carácter de control 3, que la extracción conserva o pierde. Un grep
 * normal no los ve: el 06-09-2026 «GIMENO CALVO» dio cero sobre ese boletín y
 * la lista del PP llevaba a una Gimeno Calvo en el n.º 13. Cualquier «no
 * figura» sobre un boletín de esa época sin esta búsqueda no mide nada.
 *
 * Puro: sin red ni disco.
 */
export const DESPLAZAMIENTO = 29

/** El espacio desplazado: 32 − 29. */
const ESPACIO_DESPLAZADO = String.fromCharCode(32 - DESPLAZAMIENTO)

/**
 * Forma desplazada de un patrón: letras, cifras, signos y el espacio ASCII
 * bajan 29 posiciones. La búsqueda tolera hasta dos residuos entre palabras
 * porque el espacio desplazado unas veces sobrevive a la extracción y otras no.
 */
export function desplazar(s: string): string {
  let out = ''
  for (const ch of s) {
    const c = ch.charCodeAt(0)
    if (c >= 32 && c <= 126) out += String.fromCharCode(c - DESPLAZAMIENTO)
    else out += ch
  }
  return out
}

/**
 * Señal de que un tramo va desplazado: contiene alguno de los caracteres en
 * los que caen las letras más frecuentes de un nombre en mayúsculas (A→$,
 * B→%, C→&, D→', G→*, H→+, Y→<, Z→=) o el espacio desplazado. Un tramo en
 * claro de un sumario del BOP no los trae.
 */
const SIGNOS_DESPLAZADOS = /[$%&'*+<=]/
const tramoDesplazado = (t: string): boolean =>
  SIGNOS_DESPLAZADOS.test(t) || t.includes(ESPACIO_DESPLAZADO)

function decodificarTramo(s: string): string {
  let out = ''
  for (const ch of s) {
    const c = ch.charCodeAt(0)
    if (ch === ESPACIO_DESPLAZADO) out += ' '
    else if (c === 120) out += 'ñ'
    else if (c >= 4 && c <= 97) out += String.fromCharCode(c + DESPLAZAMIENTO)
    else out += ch
  }
  return out
}

/**
 * Vuelve legible una línea en la que conviven tramos en claro y tramos
 * desplazados (la maquetación a columnas los pone en la misma línea). Se
 * decide tramo a tramo —separados por dos o más espacios— para no destrozar
 * la parte que ya se lee. La ñ del boletín sale como «x»; los espacios de un
 * tramo desplazado suelen haberse perdido, y entonces las palabras salen
 * pegadas.
 */
export function decodificar(s: string): string {
  return s
    .split(/(\s{2,}|\t+)/)
    .map((tramo) => (tramoDesplazado(tramo) ? decodificarTramo(tramo) : tramo))
    .join('')
}

export interface HallazgoGlifos {
  /** Número de línea, empezando en 1. */
  linea: number
  forma: 'clara' | 'desplazada'
  original: string
  /** La línea legible: la misma si era clara, decodificada si iba desplazada. */
  decodificada: string
}

const plegar = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

const escapar = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Líneas de `texto` que contienen `patron` (palabras separadas por espacio) en
 * claro —sin distinguir caja ni acentos— o en su forma desplazada, en la que
 * entre palabra y palabra pueden quedar hasta dos caracteres residuales.
 */
export function buscarConGlifos(texto: string, patron: string): HallazgoGlifos[] {
  const palabras = plegar(patron).trim().split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return []
  const clara = new RegExp(palabras.map(escapar).join('\\s+'))
  const desplazada = new RegExp(palabras.map((p) => escapar(desplazar(p))).join('.{0,2}'))
  const out: HallazgoGlifos[] = []
  texto.split('\n').forEach((original, i) => {
    if (clara.test(plegar(original))) {
      out.push({ linea: i + 1, forma: 'clara', original, decodificada: original })
    } else if (desplazada.test(original)) {
      out.push({ linea: i + 1, forma: 'desplazada', original, decodificada: decodificar(original) })
    }
  })
  return out
}
