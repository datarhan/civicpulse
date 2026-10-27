/**
 * Las decisiones de `scrape:pleno-videos-regmeet` que pueden perder un vídeo o
 * inventar un «sin vídeo», sacadas aquí para probarlas sin red.
 *
 * La pasada NO pide nada a regmeet: lee las páginas de sesión que
 * `scrape:pleno-actas` ya descarga cada día y deja en `.cache/regmeet-sesiones/`.
 * Medido el 27-10-2026: una pasada propia por las 63 páginas (de 1 a 3 MB cada
 * una) leyó 20 y regmeet cortó la conexión (UND_ERR_SOCKET, luego ECONNREFUSED,
 * casi una hora); esa misma mañana, la máquina del curador ya estaba rechazada
 * minutos después de que las pasadas de orden del día y actas (6 + 14 páginas)
 * terminasen. Una tercera pasada detrás de esas dos encontraría la puerta cerrada
 * cada día. La de actas relee el archivo entero en 8 días (`tocaPedir`), y un
 * vídeo incrustado no cambia de un día para otro.
 *
 * Puro — sin red, sin fs.
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
  /** Día (YYYY-MM-DD) en que se descargó la página que escribió la fila. */
  comprobadoEl: string
}

export type DesenlaceVideo = LecturaVideoRegmeet | 'desaparecido'

/**
 * Qué fue de una sesión cuya página está en la caché, y qué fila queda. Sólo
 * `con-video` y `sin-video` escriben fila nueva; lo demás conserva la anterior, o
 * ninguna si no la había: la sesión sigue sin leer, que no es «sin vídeo». Un
 * vídeo que estaba y ya no está es `desaparecido` y conserva su fila: como un
 * acta, no se despublica solo. `descargadaEl` es el día de la página, no el de
 * la pasada: una página de hace una semana sigue diciendo lo de hace una semana.
 */
export function desenlaceVideo(a: {
  plenoId: string
  fecha: string
  descargadaEl: string
  lectura: LecturaVideoRegmeet
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
        comprobadoEl: a.descargadaEl,
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
      comprobadoEl: a.descargadaEl,
    },
    cambiado,
    motivo: cambiado
      ? `incrustaba ${anterior?.ytId} (leído el ${anterior?.comprobadoEl}) y ahora incrusta ${ytId}`
      : null,
  }
}

/**
 * ¿Se puede escribir el fichero nuevo? No sin una sola página que leer (¿corrió
 * `scrape:pleno-actas`?), ni con la mitad de lo leído sin marcador o ilegible: una
 * página de reto servida con 200 no lleva marcador, y una caché llena de ellas no
 * es una pasada que haya comprobado nada.
 */
export function puedeEscribirVideos(s: {
  sesiones: number
  leidas: number
  sinMarcador: number
  ilegibles: number
}): { ok: boolean; motivo: string | null } {
  if (s.sesiones === 0) return { ok: false, motivo: 'ninguna sesión de regmeet en plenos.json' }
  if (s.leidas === 0) {
    return {
      ok: false,
      motivo: 'ninguna página de sesión en la caché (¿ha corrido scrape:pleno-actas?)',
    }
  }
  const malas = s.sinMarcador + s.ilegibles
  if (malas >= s.leidas / 2) {
    return { ok: false, motivo: `${malas} de ${s.leidas} páginas sin marcador o ilegibles` }
  }
  return { ok: true, motivo: null }
}
