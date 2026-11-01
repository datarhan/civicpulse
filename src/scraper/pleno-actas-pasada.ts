/**
 * Las dos decisiones de `scrape:pleno-actas` que pueden borrar un índice bueno,
 * sacadas aquí para probarlas sin red.
 *
 * El peligro: un WAF o una página intermedia servida con 200 no lleva enlaces de
 * «Documentos», `parseRegmeetDocumentos` devuelve [] y la sesión caería en «sin
 * documentos», que no es fallo: ni contaría para el cortacircuitos ni arrastraría
 * el acta anterior. Si regmeet sirviera eso a todas las sesiones, la pasada
 * escribiría `items: []` en verde. Las actas no se despublican solas: un acta que
 * estaba y ya no está es un fallo de lectura hasta que una persona diga otra cosa.
 *
 * Puro — sin red.
 */

export type DesenlaceSesion =
  'conActa' | 'sinDocumentos' | 'soloOtros' | 'fechaNoCoincide' | 'fallida'

export interface LecturaSesion {
  /** Documentos que la página de sesión enlaza. */
  documentos: number
  /** Algún documento resultó ser el acta de esa fecha. */
  hayActa: boolean
  /** Alguna descarga o pdftotext falló. */
  algunaFallo: boolean
  /** Algún documento es un acta, pero de otra fecha. */
  algunaActaOtraFecha: boolean
  /** La pasada anterior indexó un acta para esta sesión. */
  teniaActa: boolean
}

/**
 * Qué fue de una sesión, y si hay que arrastrar su fila anterior. Una sesión con
 * acta indexada que ahora no enlaza ningún documento es `fallida` (y arrastra),
 * nunca `sinDocumentos`.
 */
export function desenlaceSesion(l: LecturaSesion): {
  desenlace: DesenlaceSesion
  arrastrar: boolean
  motivo: string | null
} {
  if (l.hayActa) return { desenlace: 'conActa', arrastrar: false, motivo: null }
  if (l.documentos === 0 && l.teniaActa) {
    return {
      desenlace: 'fallida',
      arrastrar: true,
      motivo: 'tenía acta indexada y la página no enlaza ningún documento (¿página de reto?)',
    }
  }
  if (l.algunaFallo) return { desenlace: 'fallida', arrastrar: true, motivo: null }
  if (l.documentos === 0) return { desenlace: 'sinDocumentos', arrastrar: false, motivo: null }
  if (l.algunaActaOtraFecha) {
    return { desenlace: 'fechaNoCoincide', arrastrar: false, motivo: null }
  }
  return { desenlace: 'soloOtros', arrastrar: false, motivo: null }
}

/**
 * Sesiones que se piden siempre: las más recientes, donde un acta nueva puede
 * aparecer cualquier día.
 */
export const SIEMPRE_RECIENTES = 6
/**
 * Sesiones del resto que se releen en cada pasada, rotando por días. Con 57
 * sesiones en el resto, 8 por pasada recorren el archivo en 8 días: lo mismo
 * que `check:cadence` promete para `pleno-actas.json` (`maxAgeDays: 8`), para
 * que un fichero «fresco» no esconda una sesión sin releer desde hace más.
 */
export const ROTACION_POR_PASADA = 8

/**
 * ¿Pide esta pasada la página de la sesión `indice` (0 = la más reciente)?
 *
 * Hasta el 25-10-2026 se pedían las 63 cada día. Desde el 16-10 regmeet cierra
 * la conexión (ECONNREFUSED, a nivel de TCP) a mitad de esa pasada, el
 * cortacircuitos deja el resto «sin intentar» y la puerta de escritura —con
 * razón— no escribe: el índice se quedó diez días en el del 15-10. Releer a
 * diario un acta firmada que ya está indexada no aporta nada. Así que cada día
 * van las `SIEMPRE_RECIENTES` y una ventana de `ROTACION_POR_PASADA` del resto
 * que avanza con `dia` (días UTC desde la época), de modo que todo el archivo se
 * relee en ⌈resto / ROTACION⌉ días. Lo que no toca se conserva tal cual, sin
 * petición. `faltaTexto` (el texto del acta no está en `.cache`, que
 * `check:votos-acta` necesita) y `completo` obligan a pedirla.
 *
 * Puro — sin red.
 */
export function tocaPedir(a: {
  indice: number
  sesiones: number
  dia: number
  completo: boolean
  faltaTexto: boolean
}): boolean {
  if (a.completo || a.faltaTexto) return true
  if (a.indice < SIEMPRE_RECIENTES) return true
  const resto = a.sesiones - SIEMPRE_RECIENTES
  if (resto <= ROTACION_POR_PASADA) return true
  const inicio = (((a.dia * ROTACION_POR_PASADA) % resto) + resto) % resto
  const pos = a.indice - SIEMPRE_RECIENTES
  return (pos - inicio + resto) % resto < ROTACION_POR_PASADA
}

/**
 * ¿Se puede escribir el índice nuevo? No, con media pasada perdida (fallidas +
 * sin intentar ≥ la mitad de lo que TOCABA pedir hoy), ni cuando las actas que
 * quedan —leídas ahora más conservadas sin pedir— no llegan a la mitad de las
 * que había indexadas: en los dos casos el fichero anterior vale más que uno a
 * medias. Sin `tocaban`, tocaban todas (la pasada completa de siempre).
 */
export function puedeEscribirIndice(s: {
  sesiones: number
  /** Sesiones que esta pasada debía pedir (`tocaPedir`); por defecto, todas. */
  tocaban?: number
  fallidas: number
  sinIntentar: number
  conActa: number
  /** Actas que se conservaron sin pedir porque hoy no tocaban. */
  conservadasConActa?: number
  /** Filas del índice anterior (0 si no había). */
  previas: number
}): { ok: boolean; motivo: string | null } {
  if (s.sesiones === 0) return { ok: false, motivo: 'ninguna sesión de regmeet en plenos.json' }
  const tocaban = s.tocaban ?? s.sesiones
  const perdidas = s.fallidas + s.sinIntentar
  if (perdidas >= tocaban / 2) {
    return { ok: false, motivo: `${perdidas} de ${tocaban} sesiones fallidas o sin intentar` }
  }
  const conservadas = s.conservadasConActa ?? 0
  const actas = s.conActa + conservadas
  if (actas < s.previas / 2) {
    const deEllas = conservadas > 0 ? ` (${conservadas} conservadas sin pedir)` : ''
    return {
      ok: false,
      motivo: `sólo ${actas} actas leídas${deEllas} frente a ${s.previas} indexadas antes (menos de la mitad)`,
    }
  }
  return { ok: true, motivo: null }
}
