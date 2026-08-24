/**
 * ¿Sigue diciendo el PDF del Síndic lo que nuestra ficha dice que dice?
 *
 * Es la mitad pura —sin red— de `check:sindic-fichas`. Vive aparte del CLI por
 * la razón de siempre en este repo: así se puede probar contra un fixture y
 * contra el fallo INYECTADO, que es lo único que demuestra que una guarda puede
 * ponerse roja.
 *
 * Por qué hace falta, cuando el `resumen` ya se copió del PDF: porque copiarlo
 * bien una vez no es lo mismo que seguir siéndolo. La regla de la casa lo dice
 * al revés y por eso aquí basta con esto — «un verbatim se queda quieto; una
 * cifra no». Una cita del Síndic leerá igual dentro de diez años, así que la
 * comprobación sólo tiene que confirmar que sigue donde dice estar. Lo que
 * cambia es NUESTRO fichero: una corrección a mano, un merge mal resuelto o un
 * recorte por longitud pueden dejar entrecomillado algo que el PDF nunca dijo.
 *
 * El salto de página, que es la trampa medida. El texto extraído del PDF mete
 * el pie de página EN MEDIO de una frase:
 *
 *   «…motivada y con indicación de CSV **** Validar en URL https://seu.elsindic.com
 *    Este documento ha sido firmado… C/ Pascual Blasco, 1… 5 los recursos que…»
 *
 * Dos de las trece fichas cruzan uno. Sin quitar ese ruido, la comprobación
 * marcaría como «no literal» una cita que lo es palabra por palabra, y una
 * guarda que se equivoca dos de cada trece veces es una guarda que se
 * desconecta. Se quita SÓLO el pie —sellado, CSV, dirección, número de página—
 * y nada más: recortar más sería concederse el aprobado.
 */

/** Ruido que el propio PDF intercala y que no es prosa de la resolución. */
const PIE = [
  /Núm\. de reg\.[^\n]*/g,
  /CSV\s*[A-Z0-9*]{4,}[^\n]*/g,
  /Validar en URL[^\n]*/g,
  /Este documento ha sido firmado[^\n]*/g,
  /C\/ Pascual Blasco[\s\S]*?facebook\.com\/elsindic/g,
  /C\/ Pascual Blasco[\s\S]*?www\.elsindic\.com/g,
  /consultas@elsindic\.com/g,
  /\n\s*\d{1,2}\s*\n/g,
]

export function limpiarPdf(texto: string): string {
  let t = texto
  for (const re of PIE) t = t.replace(re, '\n')
  return t.replace(/\s+/g, ' ').trim()
}

export const normalizar = (s: string) => s.replace(/\s+/g, ' ').trim()

export type Desenlace = 'literal' | 'no-literal' | 'pdf-inalcanzable' | 'sin-pdf'

export interface Cotejo {
  id: string
  expediente: string
  desenlace: Desenlace
  /** Dónde deja de coincidir, para que el parte sea accionable y no un «falla». */
  detalle?: string
}

/**
 * Coteja un resumen contra el texto del PDF ya limpio.
 *
 * Devuelve `no-literal` con el punto exacto de divergencia. Un `null` en
 * `textoPdf` es `pdf-inalcanzable`, NUNCA `literal`: doblar «no pude mirar»
 * sobre «coincide» es cómo una puerta imprime su propio visto bueno.
 */
export function cotejarResumen(
  id: string,
  expediente: string,
  resumen: string,
  textoPdf: string | null,
): Cotejo {
  if (textoPdf === null) return { id, expediente, desenlace: 'pdf-inalcanzable' }
  const limpio = limpiarPdf(textoPdf)
  if (!limpio) return { id, expediente, desenlace: 'sin-pdf', detalle: 'el PDF no dio texto' }

  const r = normalizar(resumen)
  if (limpio.includes(r)) return { id, expediente, desenlace: 'literal' }

  // Alargar palabra a palabra hasta que deja de casar: el prefijo bueno y la
  // primera palabra mala dicen exactamente dónde mirar.
  const palabras = r.split(' ')
  let bueno = ''
  for (let i = 1; i <= palabras.length; i++) {
    const cand = palabras.slice(0, i).join(' ')
    if (limpio.includes(cand)) bueno = cand
    else break
  }
  const resto = r.slice(bueno.length).trim()
  return {
    id,
    expediente,
    desenlace: 'no-literal',
    detalle: bueno
      ? `casa hasta «…${bueno.slice(-70)}» y ahí el PDF no sigue con «${resto.slice(0, 70)}…»`
      : `ni la primera frase aparece en el PDF («${r.slice(0, 70)}…»)`,
  }
}

export interface Parte {
  intentadas: number
  literales: number
  noLiterales: number
  inalcanzables: number
  sinPdf: number
}

export function resumirParte(cotejos: readonly Cotejo[]): Parte {
  const n = (d: Desenlace) => cotejos.filter((c) => c.desenlace === d).length
  return {
    intentadas: cotejos.length,
    literales: n('literal'),
    noLiterales: n('no-literal'),
    inalcanzables: n('pdf-inalcanzable'),
    sinPdf: n('sin-pdf'),
  }
}

/**
 * ¿Puede este parte dar un visto bueno?
 *
 * Sólo si de verdad cotejó algo. Un fichero vacío, o trece PDFs caídos, dan
 * cero discrepancias — y eso NO es un all-clear, es una pasada que no midió.
 */
export function haCotejadoAlgo(p: Parte): boolean {
  return p.intentadas > 0 && p.literales + p.noLiterales > 0
}

/** Sólo `no-literal` es culpa nuestra; un PDF caído es cosa de la fuente. */
export function debeFallar(p: Parte): boolean {
  return p.noLiterales > 0 || p.sinPdf > 0
}
