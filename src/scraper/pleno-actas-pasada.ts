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
 * ¿Se puede escribir el índice nuevo? No, con media pasada perdida (fallidas +
 * sin intentar ≥ sesiones / 2), ni cuando las actas leídas ahora no llegan a la
 * mitad de las que había indexadas: en los dos casos el fichero anterior vale
 * más que uno a medias.
 */
export function puedeEscribirIndice(s: {
  sesiones: number
  fallidas: number
  sinIntentar: number
  conActa: number
  /** Filas del índice anterior (0 si no había). */
  previas: number
}): { ok: boolean; motivo: string | null } {
  if (s.sesiones === 0) return { ok: false, motivo: 'ninguna sesión de regmeet en plenos.json' }
  const perdidas = s.fallidas + s.sinIntentar
  if (perdidas >= s.sesiones / 2) {
    return { ok: false, motivo: `${perdidas} de ${s.sesiones} sesiones fallidas o sin intentar` }
  }
  if (s.conActa < s.previas / 2) {
    return {
      ok: false,
      motivo: `sólo ${s.conActa} actas leídas frente a ${s.previas} indexadas antes (menos de la mitad)`,
    }
  }
  return { ok: true, motivo: null }
}
