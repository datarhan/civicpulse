/**
 * ¿Es el binario el sospechoso?
 *
 * `yt-dlp` caduca en el calendario de YouTube, no en el nuestro. Su versión ES
 * su fecha de publicación (`2026.08.19`), así que la caducidad se comprueba sin
 * red, sin API y sin preguntarle a nadie.
 *
 * Por qué existe este módulo: el 23-ago-2026 el barrido de mapas de voces
 * llevaba cuatro noches gastando **0 de sus 20 peticiones** diarias. Nada en el
 * repo había cambiado. El `yt-dlp` de Homebrew era `2026.7.4` —instalado el 3 de
 * agosto— y YouTube había retirado la suplantación de cliente que usa.
 *
 * La firma engaña, y es lo caro de diagnosticar:
 *
 *   · `--simulate --print "%(duration)s"` responde BIEN (metadatos correctos)
 *   · la descarga del medio desde `googlevideo.com` devuelve **403**
 *
 * Por eso `scrape-pleno-videos.ts`, que sólo pide metadatos, siguió verde y tapó
 * la avería durante toda la caída. Un 403 que sobrevive a los tres reintentos no
 * es un throttle: es un binario viejo.
 *
 * Todo aquí **falla abierto**. Una versión ilegible no produce diagnóstico: es
 * preferible callar a mandar a alguien a actualizar un binario que está bien.
 */

/**
 * A partir de cuántos días una versión es sospechosa.
 *
 * Cuatro semanas. yt-dlp publica cada pocas semanas y las roturas de YouTube
 * llegan en ese orden de magnitud; la que rompió esto tenía 46 días cuando se
 * comió la primera noche. Más corto convertiría el aviso en ruido de fondo, y un
 * aviso que salta siempre es uno que se aprende a saltar.
 */
export const YTDLP_STALE_DAYS = 28

/** `2026.08.19` y `2026.7.4` son la misma publicación escrita de dos formas. */
const VERSION_RE = /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/

function releaseDate(version: string): Date | null {
  const m = VERSION_RE.exec(version.trim())
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const at = new Date(Date.UTC(y, mo - 1, d))
  // `Date.UTC` acepta un mes 13 y lo pasa a enero del año siguiente, así que un
  // `2026.13.99` se leería como una fecha perfectamente válida y falsa. La
  // comprobación de ida y vuelta es lo que lo rechaza.
  if (at.getUTCFullYear() !== y || at.getUTCMonth() !== mo - 1 || at.getUTCDate() !== d) return null
  return at
}

/** Días enteros desde que se publicó esta versión, o null si no se entiende. */
export function ytDlpAgeDays(version: string, now: Date): number | null {
  const at = releaseDate(version)
  if (!at) return null
  return Math.floor((now.getTime() - at.getTime()) / 86_400_000)
}

/**
 * ¿Se parece este fallo a un cliente retirado, y no a otra cosa?
 *
 * Un vídeo privado, un canal caído o un proxy roto también rompen la descarga y
 * NO se arreglan actualizando nada. Decirle a alguien que actualice el binario
 * cuando el vídeo está privado gasta su tiempo y desacredita el aviso.
 */
export function looksLikeClientRejection(error: string): boolean {
  return /\b403\b/.test(error) && /forbidden/i.test(error)
}

/**
 * La línea que convierte «yt-dlp gave up after 3» en algo accionable.
 *
 * Devuelve null cuando el binario no es sospechoso — ni viejo, ni legible. El
 * que llama decide si además el error encaja (`looksLikeClientRejection`).
 */
export function staleYtDlpNote(version: string | null, now: Date): string | null {
  if (!version) return null
  const age = ytDlpAgeDays(version, now)
  if (age === null || age <= YTDLP_STALE_DAYS) return null
  return (
    `yt-dlp ${version.trim()} tiene ${age} días. Un 403 en la descarga del medio ` +
    `mientras los metadatos SÍ resuelven suele ser una suplantación de cliente ` +
    `retirada por YouTube, no un throttle: prueba \`brew upgrade yt-dlp\`.`
  )
}
