/**
 * El archivo de transcripciones sustituidas, y por qué tiene más de una ranura.
 *
 * `public/data/pleno-transcripts/superseded/<id>.txt` guarda la transcripción
 * que estaba publicada antes de que la sesión se volviera a transcribir. Existe
 * por una razón editorial: las citas publicadas se sacaron del texto vigente en
 * su momento, y una re-transcripción reescribe puntuación, nombres propios y
 * segmentación, así que una cita perfectamente honesta deja de aparecer en el
 * fichero actual. Sin el texto viejo es indistinguible de una inventada.
 *
 * El defecto: UNA ranura por sesión, y una sesión se puede re-transcribir más
 * de una vez. Medido el 4-09-2026 sobre las 24 declaraciones «sin rastro» del
 * corpus publicado: k4olcs se re-transcribió el 24-abr, el 28-abr y el 1-ago, y
 * ma87e0 dos veces el 21-abr y otra el 1-ago. En las dos, la segunda
 * re-transcripción pisó el archivo de la primera y se llevó por delante la
 * procedencia de tres citas — dos de ellas publicadas a nombre del PSOE. Un
 * archivo que sólo recuerda la penúltima versión no es un archivo.
 *
 * La convención, elegida para no romper nada de lo que ya lee esta carpeta:
 *
 *   <id>.txt            la predecesora más reciente. Sigue donde estaba, y
 *                       `loadSessionTexts` y `check:finding-quotes` la leen por
 *                       ruta exacta igual que siempre.
 *   <id>.<etiqueta>.txt cualquier predecesora anterior. La etiqueta identifica
 *                       la versión y no la ordena: hoy son SHAs cortos de los
 *                       commits de los que se recuperaron, y lo que escriba
 *                       `transcribe-pleno.sh` de aquí en adelante llevará la
 *                       fecha en que se archivó.
 *
 * Nadie enumeraba este directorio —todos los consumidores abrían una ruta
 * exacta—, así que añadir ficheros con etiqueta es invisible para ellos.
 *
 * Un id de sesión no lleva puntos (comprobado sobre las 22 del corpus, y
 * `fnv32`/`sha256Short` sólo emiten alfanuméricos), de modo que trocear por
 * punto separa id, etiqueta y extensión sin ambigüedad.
 */

/** El nombre de la ranura principal: la predecesora más reciente. */
export function nombrePrincipal(plenoId: string): string {
  return `${plenoId}.txt`
}

/**
 * ¿Es `nombre` una predecesora archivada de `plenoId`?
 *
 * Exige que el id sea el PRIMER segmento entero, no un prefijo: si algún día
 * dos sesiones comparten arranque, `startsWith` archivaría la una bajo la otra
 * y nadie lo notaría hasta que una cita apareciera donde no debe.
 */
export function esArchivoDe(nombre: string, plenoId: string): boolean {
  if (!nombre.endsWith('.txt')) return false
  const partes = nombre.split('.')
  // `<id>.txt` (2) o `<id>.<etiqueta>.txt` (3). Nada más.
  if (partes.length !== 2 && partes.length !== 3) return false
  if (partes[0] !== plenoId) return false
  // Una etiqueta vacía —`<id>..txt`— no identifica ninguna versión.
  return partes.length === 2 || partes[1].length > 0
}

/**
 * Todas las predecesoras de una sesión, la principal primero.
 *
 * El orden importa poco para la pregunta que se le hace a este archivo —«¿está
 * esta cita en ALGUNA versión anterior?»— pero deja la principal delante para
 * quien sólo quiera una, y hace el resultado determinista para las pruebas.
 */
export function archivosDe(entradas: readonly string[], plenoId: string): string[] {
  const principal = nombrePrincipal(plenoId)
  const resto = entradas
    .filter((n) => n !== principal && esArchivoDe(n, plenoId))
    .sort((a, b) => a.localeCompare(b))
  return [...entradas.filter((n) => n === principal), ...resto]
}
