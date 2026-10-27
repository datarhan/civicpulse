/**
 * La lectura vecinal de /quejas (auditoría de las dos lecturas, 25-10-2026, §18).
 *
 * Un vecino llega preguntando cómo se queja, si le tienen que contestar y qué
 * pasa si no. La página le daba una cláusula en la entradilla, el plazo legal
 * sin dibujar y los registros de vigilancia como un anexo de especialista. Esto
 * deriva las cifras de las tres tarjetas; el JSX sólo las pinta.
 *
 * - **Los plazos son los del enrutador de quejas** (`queja-router`), que es el
 *   que pone el reloj a cada queja: una página no puede contar otro plazo que el
 *   que la ficha de la queja cuenta.
 * - **El umbral de apoyos es el del bot**; la prueba lee su fuente.
 * - **«Le hizo recomendaciones al Ayuntamiento» son las fichas firmadas**, no
 *   las resoluciones de consideraciones del índice: una de ellas va dirigida a
 *   la Conselleria, y el Ayuntamiento sólo informó como parte. Contar el índice
 *   diría que el Síndic le dijo algo a quien no se lo dijo.
 */
import { ESCALATION_PROFILES, LEGAL_CATALOG, plazoDeResolucion } from './queja-router'

/**
 * Los apoyos con que una queja entra en el lote que se presenta en el registro.
 * Es `VERIFIED_THRESHOLD` del bot (bot/src/db/queries.ts); el sitio no lo
 * importa porque el bot es otro paquete, y `tests/en-breve-quejas.test.ts` lee
 * su fuente y falla si los dos dejan de coincidir.
 */
export const APOYOS_PARA_EL_LOTE = 10

export interface CaminoDeUnaQueja {
  apoyos: number
  /** Días que tiene el Ayuntamiento para acusar recibo (art. 21.4 LPACAP). */
  acuseDias: number
  /** Meses para contestar, con carácter general (art. 21.3 LPACAP). */
  meses: number
  /** Meses para contestar una petición de transparencia (art. 20 Ley 19/2013). */
  mesesTransparencia: number
}

export function caminoDeUnaQueja(): CaminoDeUnaQueja {
  const acuse = ESCALATION_PROFILES.standard.find((p) => p.basis === LEGAL_CATALOG.LPACAP_21_4)
  if (!acuse) throw new Error('caminoDeUnaQueja: el perfil general ya no trae el acuse')
  return {
    apoyos: APOYOS_PARA_EL_LOTE,
    acuseDias: acuse.whenDays,
    meses: plazoDeResolucion('via_publica').amount,
    mesesTransparencia: plazoDeResolucion('transparencia').amount,
  }
}

export interface SindicEnBreve {
  /** Expedientes con el Ayuntamiento como administración investigada. */
  expedientes: number
  /** Primer año del registro que publica el buscador del Síndic. */
  desde: number | null
  /** Resoluciones con recomendaciones dirigidas al Ayuntamiento: las fichas firmadas. */
  recomendaciones: number
  /** De ellas, las que el propio Síndic titula «falta de respuesta». */
  porFaltaDeRespuesta: number
  /** La más reciente, con su título literal. */
  ultima: { fecha: string; titulo: string } | null
}

export function sindicEnBreve(e: {
  indice: {
    contraAyuntamiento?: readonly unknown[]
    cobertura?: { contraAyuntamientoDesde?: number | null }
  } | null
  fichas: readonly { fecha: string; titulo: string }[]
}): SindicEnBreve | null {
  if (!e.indice) return null
  const ultima = [...e.fichas].sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
  return {
    expedientes: e.indice.contraAyuntamiento?.length ?? 0,
    desde: e.indice.cobertura?.contraAyuntamientoDesde ?? null,
    recomendaciones: e.fichas.length,
    porFaltaDeRespuesta: e.fichas.filter((f) => /falta de respuesta/i.test(f.titulo)).length,
    ultima: ultima ? { fecha: ultima.fecha, titulo: ultima.titulo } : null,
  }
}
