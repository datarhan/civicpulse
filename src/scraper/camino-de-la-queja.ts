/**
 * El camino entero de una queja, para su ficha (auditoría de las dos lecturas,
 * 25-10-2026, §19).
 *
 * La línea temporal de /quejas/:id pintaba sólo lo ocurrido: una queja recién
 * publicada tenía un hito, «Capturada en CivicPulse», y nada que dijera adónde
 * va. Esto da el camino entero a partir del estado que publica el bot: los pasos
 * hechos, el que toca ahora y los que faltan, que la ficha pinta en gris.
 *
 * - **Un paso hecho sólo se fecha cuando se sabe.** `updated_datetime` es la
 *   última vez que la fila cambió por cualquier motivo: dice cuándo pasó el paso
 *   en que la queja ESTÁ, no los anteriores. Lo demás va sin fecha, en vez de
 *   ponerle la de otro paso.
 * - **No se afirma un paso que el estado no prueba.** Una queja registrada con
 *   menos apoyos que el umbral no «llegó a los apoyos»; una resuelta sin
 *   `registered_at` no pasó por el registro que sepamos. Esos pasos no salen.
 * - **Las cifras son las de /quejas** (`caminoDeUnaQueja`), y las de la
 *   categoría (`plazoDeResolucion`): una petición de transparencia tiene un mes
 *   y se reclama al Consell de Transparència, no al Síndic.
 */
import { caminoDeUnaQueja } from './en-breve-quejas'
import { LEGAL_CATALOG, plazoDeResolucion, type QuejaCategory } from './queja-router'

/**
 * Los estados con que el bot publica una queja (`QuejaState` en
 * bot/src/db/queries.ts). El bot es otro paquete y no se importa; la prueba lee
 * su fuente y falla si las dos listas dejan de coincidir.
 */
export const ESTADOS_DE_LA_QUEJA = [
  'capturada',
  'apoyada_verificada',
  'registrada',
  'notificada_10d',
  'en_tramite',
  'resuelta',
  'silencio_negativo',
  'escalada_sindic',
  'cerrada_no_registrada',
] as const

export type EstadoDeLaQueja = (typeof ESTADOS_DE_LA_QUEJA)[number]

export type ClaveDelPaso =
  'enviada' | 'apoyos' | 'registro' | 'respuesta' | 'resuelta' | 'silencio' | 'escalado' | 'cerrada'

export type EstadoDelPaso = 'hecho' | 'ahora' | 'pendiente'

export interface PasoDelCamino {
  clave: ClaveDelPaso
  estado: EstadoDelPaso
  /** La marca del bot del momento en que pasó, sólo cuando se sabe. */
  fecha: string | null
}

export interface CaminoDeLaQueja {
  pasos: PasoDelCamino[]
  /** Los apoyos que lleva, y los que hacen falta para el lote. */
  apoyos: number
  umbral: number
  /** Días para acusar recibo; null en transparencia, cuyo perfil no lo trae. */
  acuseDias: number | null
  /** Meses para contestar desde el registro. */
  meses: number
  /** Adónde se acude si no contesta. */
  escalado: 'sindic' | 'consell'
}

export interface QuejaDelCamino {
  status: string
  service_code: string
  apoyos: number
  requested_datetime: string
  updated_datetime: string | null
  registered_at: string | null
}

const esEstado = (s: string): s is EstadoDeLaQueja =>
  (ESTADOS_DE_LA_QUEJA as readonly string[]).includes(s)

/** Hasta dónde ha llegado cada estado: 1 apoyos, 2 registro, 3 respuesta, 4 escalado. */
const TRAMO: Record<EstadoDeLaQueja, number> = {
  capturada: 1,
  apoyada_verificada: 2,
  registrada: 3,
  notificada_10d: 3,
  en_tramite: 3,
  resuelta: 4,
  silencio_negativo: 4,
  escalada_sindic: 4,
  cerrada_no_registrada: 4,
}

export function caminoDeLaQueja(q: QuejaDelCamino): CaminoDeLaQueja | null {
  if (!esEstado(q.status)) return null
  const status = q.status
  const general = caminoDeUnaQueja()
  const plazo = plazoDeResolucion(q.service_code as QuejaCategory)
  // Transparencia es el perfil cuyo plazo funda el art. 20 de la Ley 19/2013: así
  // lo decide el enrutador (`plazoDeResolucion`), que no exporta el perfil.
  const transparencia = plazo.basis === LEGAL_CATALOG.LTBG_20
  const apoyos = Number.isFinite(q.apoyos) ? q.apoyos : 0
  const llego = apoyos >= general.apoyos
  // El bot cambia el estado al llegar al umbral, pero una instantánea puede ir por
  // detrás: «capturada» con los apoyos ya pasados no está «reuniendo» nada, y lo
  // que toca es el registro. Los apoyos van sin fecha, como en cualquier otro
  // estado que no sea el suyo.
  const tramo = status === 'capturada' && llego ? 2 : TRAMO[status]
  const actual = q.updated_datetime ?? null

  const pasos: PasoDelCamino[] = [
    { clave: 'enviada', estado: 'hecho', fecha: q.requested_datetime },
  ]

  // Los apoyos: lo que toca mientras se reúnen; hechos sólo si llegó al umbral.
  if (tramo === 1) pasos.push({ clave: 'apoyos', estado: 'ahora', fecha: null })
  else if (llego || status === 'apoyada_verificada')
    pasos.push({
      clave: 'apoyos',
      estado: 'hecho',
      fecha: status === 'apoyada_verificada' ? actual : null,
    })

  if (status === 'cerrada_no_registrada') {
    pasos.push({ clave: 'cerrada', estado: 'hecho', fecha: actual })
    return cierra(pasos)
  }

  // El registro: pendiente, lo que toca o hecho con su fecha; sin ella no se afirma.
  if (tramo < 2) pasos.push({ clave: 'registro', estado: 'pendiente', fecha: null })
  else if (tramo === 2) pasos.push({ clave: 'registro', estado: 'ahora', fecha: null })
  else if (q.registered_at)
    pasos.push({ clave: 'registro', estado: 'hecho', fecha: q.registered_at })

  // La respuesta y, si no llega, el escalado.
  if (status === 'resuelta') {
    pasos.push({ clave: 'resuelta', estado: 'hecho', fecha: actual })
  } else if (status === 'silencio_negativo') {
    pasos.push({ clave: 'silencio', estado: 'hecho', fecha: actual })
    pasos.push({ clave: 'escalado', estado: 'ahora', fecha: null })
  } else if (status === 'escalada_sindic') {
    pasos.push({ clave: 'silencio', estado: 'hecho', fecha: null })
    pasos.push({ clave: 'escalado', estado: 'hecho', fecha: actual })
  } else {
    pasos.push({ clave: 'respuesta', estado: tramo === 3 ? 'ahora' : 'pendiente', fecha: null })
    pasos.push({ clave: 'escalado', estado: 'pendiente', fecha: null })
  }
  return cierra(pasos)

  function cierra(p: PasoDelCamino[]): CaminoDeLaQueja {
    return {
      pasos: p,
      apoyos,
      umbral: general.apoyos,
      acuseDias: transparencia ? null : general.acuseDias,
      meses: plazo.amount,
      // Escalada al Síndic lo dice el estado, sea cual sea la categoría.
      escalado: transparencia && status !== 'escalada_sindic' ? 'consell' : 'sindic',
    }
  }
}
