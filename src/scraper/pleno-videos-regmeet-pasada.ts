/**
 * Las decisiones de `scrape:pleno-videos-regmeet` que pueden perder un vídeo o
 * inventar un «sin vídeo», sacadas aquí para probarlas sin red.
 *
 * Es la tercera pasada que lee las páginas de sesión de regmeet, después del orden
 * del día y de las actas, y regmeet cierra la conexión (ECONNREFUSED) a quien pide
 * de más: desde el 16-10-2026 le pasó a la de actas a mitad de sus 63 páginas, y
 * el 27-10 rechazaba a la máquina del curador minutos después de que las otras dos
 * pasadas terminasen (07:22 servía, 07:28 ya no). Así que ésta pide poco: un vídeo
 * incrustado no cambia de un día para otro.
 *
 * Puro — sin red.
 */
import { urlDeVideo, type LecturaVideoRegmeet } from './regmeet-video'

/** Una fila de `pleno-videos-regmeet.json`: lo que la página de la sesión decía el día que se leyó. */
export interface FilaVideoRegmeet {
  plenoId: string
  fecha: string
  /** Sólo las dos lecturas que observan algo; las otras dos no escriben fila. */
  lectura: Extract<LecturaVideoRegmeet, 'con-video' | 'sin-video'>
  ytId: string | null
  url: string | null
  /** Día (YYYY-MM-DD) de la lectura que escribió la fila. Una fila conservada guarda el suyo. */
  comprobadoEl: string
}

/** Las más recientes se piden siempre: el vídeo de un pleno puede aparecer días después. */
export const VIDEO_SIEMPRE_RECIENTES = 3
/**
 * Del resto, las que se releen por pasada, rotando por días: con 60 en el resto,
 * el archivo entero se relee en 15 días. Releer más a menudo un vídeo que ya está
 * no aporta nada y gasta la paciencia de regmeet.
 */
export const VIDEO_ROTACION_POR_PASADA = 4
/**
 * Sesiones nunca leídas que entran por pasada. La primera pasada, sin fichero
 * previo, pediría las 63 de golpe — lo que hacía que regmeet cerrase la conexión
 * a la de actas. Con este cupo el archivo se completa en una semana; `--completo`
 * lo hace de una vez cuando quien la corre lo decide.
 */
export const VIDEO_NUEVAS_POR_PASADA = 10

export type PlanSesion = 'pedir' | 'conservar' | 'pendiente'

/**
 * Qué hace esta pasada con cada sesión (`sesiones`, la más reciente primero):
 * `pedir`; `conservar` la fila que ya tiene, sin petición; o dejarla `pendiente`,
 * nunca leída y fuera del cupo de hoy. `dia` = días UTC desde la época.
 */
export function planDePasada(a: {
  sesiones: ReadonlyArray<{ id: string; leida: boolean }>
  dia: number
  completo: boolean
}): PlanSesion[] {
  const n = a.sesiones.length
  const resto = n - VIDEO_SIEMPRE_RECIENTES
  const inicio = resto > 0 ? (((a.dia * VIDEO_ROTACION_POR_PASADA) % resto) + resto) % resto : 0
  let nuevas = 0
  return a.sesiones.map((s, i) => {
    if (a.completo || i < VIDEO_SIEMPRE_RECIENTES) return 'pedir'
    if (!s.leida) return nuevas++ < VIDEO_NUEVAS_POR_PASADA ? 'pedir' : 'pendiente'
    if (resto <= VIDEO_ROTACION_POR_PASADA) return 'pedir'
    const pos = i - VIDEO_SIEMPRE_RECIENTES
    return (pos - inicio + resto) % resto < VIDEO_ROTACION_POR_PASADA ? 'pedir' : 'conservar'
  })
}

export type DesenlaceVideo = LecturaVideoRegmeet | 'desaparecido' | 'fallida'

/**
 * Qué fue de una sesión pedida y qué fila queda. `lectura` null = la descarga
 * falló. Sólo `con-video` y `sin-video` escriben fila nueva; lo demás conserva la
 * anterior, o ninguna si no la había: la sesión sigue sin leer, que no es «sin
 * vídeo». Un vídeo que estaba y ya no está es `desaparecido` y conserva su fila:
 * como un acta, no se despublica solo.
 */
export function desenlaceVideo(a: {
  plenoId: string
  fecha: string
  hoy: string
  lectura: LecturaVideoRegmeet | null
  ytId: string | null
  url: string | null
  anterior: FilaVideoRegmeet | null
}): {
  desenlace: DesenlaceVideo
  fila: FilaVideoRegmeet | null
  cambiado: boolean
  motivo: string | null
} {
  const { anterior } = a
  if (a.lectura === null) {
    return { desenlace: 'fallida', fila: anterior, cambiado: false, motivo: null }
  }
  if (a.lectura === 'sin-marcador' || a.lectura === 'ilegible') {
    return { desenlace: a.lectura, fila: anterior, cambiado: false, motivo: null }
  }
  if (a.lectura === 'sin-video') {
    if (anterior?.lectura === 'con-video') {
      return {
        desenlace: 'desaparecido',
        fila: anterior,
        cambiado: false,
        motivo: `incrustaba ${anterior.ytId} (leído el ${anterior.comprobadoEl}) y la página ya no incrusta ninguno`,
      }
    }
    return {
      desenlace: 'sin-video',
      fila: {
        plenoId: a.plenoId,
        fecha: a.fecha,
        lectura: 'sin-video',
        ytId: null,
        url: null,
        comprobadoEl: a.hoy,
      },
      cambiado: false,
      motivo: null,
    }
  }
  const ytId = a.ytId as string
  const cambiado = anterior?.lectura === 'con-video' && anterior.ytId !== ytId
  return {
    desenlace: 'con-video',
    fila: {
      plenoId: a.plenoId,
      fecha: a.fecha,
      lectura: 'con-video',
      ytId,
      url: a.url ?? urlDeVideo(ytId),
      comprobadoEl: a.hoy,
    },
    cambiado,
    motivo: cambiado
      ? `incrustaba ${anterior?.ytId} (leído el ${anterior?.comprobadoEl}) y ahora incrusta ${ytId}`
      : null,
  }
}

/**
 * ¿Se puede escribir el fichero nuevo? No con media pasada perdida: fallidas, sin
 * marcador (una página de reto servida con 200 no lo lleva), ilegibles y sin
 * intentar suman contra lo que tocaba pedir hoy. Lo leído antes se conserva igual;
 * lo que no se escribe es un fichero que diga «comprobado hoy» sobre una pasada
 * que no comprobó nada.
 */
export function puedeEscribirVideos(s: {
  sesiones: number
  tocaban: number
  fallidas: number
  sinMarcador: number
  ilegibles: number
  sinIntentar: number
}): { ok: boolean; motivo: string | null } {
  if (s.sesiones === 0) return { ok: false, motivo: 'ninguna sesión de regmeet en plenos.json' }
  const perdidas = s.fallidas + s.sinMarcador + s.ilegibles + s.sinIntentar
  if (s.tocaban > 0 && perdidas >= s.tocaban / 2) {
    return {
      ok: false,
      motivo: `${perdidas} de ${s.tocaban} sesiones fallidas, sin marcador, ilegibles o sin intentar`,
    }
  }
  return { ok: true, motivo: null }
}
