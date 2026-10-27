/**
 * El vídeo que incrusta la página de cada sesión de pleno en regmeet.
 *
 * La página lleva el reproductor de YouTube del propio Ayuntamiento: un
 * `<div id="videoId" style="display:none">https://www.youtube.com/watch?v=…</div>`
 * que su script lee con `ID_COMO_LA_PAGINA` y entrega a `YT.Player`. Es la única
 * fuente que ata un vídeo a una SESIÓN. El canal de YouTube lo ata a una fecha
 * escrita en un título, y sólo mientras el vídeo quepa en la ventana de 60 que lee
 * `scrape-pleno-videos.ts`: el 2026-10-26 el canal daba vídeo a 26 de las 63
 * sesiones, y 21 de las que no tenían ya estaban transcritas — de un vídeo que el
 * canal listaba el día que se transcribieron y luego dejó atrás.
 *
 * Cuatro lecturas, y sólo una de ellas dice «no hay vídeo». Una página sin
 * marcador (un reto del WAF, un cambio de plantilla, otra página) no es una sesión
 * sin vídeo: es una página que no hemos sabido leer, y así se cuenta
 * (DATA_INTEGRITY, regla 3).
 *
 * Puro — sin red. La CLI (`scripts/scrape-pleno-videos-regmeet.ts`) descarga y llama.
 */

export const LECTURAS_VIDEO_REGMEET = [
  'con-video',
  'sin-video',
  'ilegible',
  'sin-marcador',
] as const
export type LecturaVideoRegmeet = (typeof LECTURAS_VIDEO_REGMEET)[number]

export interface VideoRegmeet {
  lectura: LecturaVideoRegmeet
  /** Id de YouTube (11 caracteres) sólo en `con-video`. */
  ytId: string | null
  /** `https://www.youtube.com/watch?v=<ytId>`, sólo en `con-video`. */
  url: string | null
  /** El texto del marcador, recortado (varios, unidos por « · »); null sin marcador. */
  crudo: string | null
}

/**
 * La expresión con la que el script de la propia página saca el id, copiada de
 * la página del 03-07-2026: se lee lo que el navegador de quien visita reproduce.
 */
const ID_COMO_LA_PAGINA =
  /(?:https?:\/{2})?(?:w{3}\.)?youtu(?:be)?\.(?:com|be)(?:\/watch\?v=|\/)([^\s&]+)/
const MARCADOR = /<div\s+id="videoId"[^>]*>([\s\S]*?)<\/div>/gi
const ID_YOUTUBE = /^[-\w]{11}$/

/** La URL estable de un vídeo de YouTube, la misma que escribe `pleno-videos.ts`. */
export const urlDeVideo = (ytId: string) => `https://www.youtube.com/watch?v=${ytId}`

/** Qué vídeo incrusta una página de sesión de regmeet. */
export function parseRegmeetVideo(html: string): VideoRegmeet {
  const distintos = [...new Set([...html.matchAll(MARCADOR)].map((m) => m[1].trim()))]
  if (distintos.length === 0) return { lectura: 'sin-marcador', ytId: null, url: null, crudo: null }
  const crudo = distintos.join(' · ')
  // Dos marcadores que no dicen lo mismo: no se elige uno.
  if (distintos.length > 1) return { lectura: 'ilegible', ytId: null, url: null, crudo }
  if (crudo === '') return { lectura: 'sin-video', ytId: null, url: null, crudo }
  const id = ID_COMO_LA_PAGINA.exec(crudo)?.[1] ?? null
  if (!id || !ID_YOUTUBE.test(id)) return { lectura: 'ilegible', ytId: null, url: null, crudo }
  return { lectura: 'con-video', ytId: id, url: urlDeVideo(id), crudo }
}
