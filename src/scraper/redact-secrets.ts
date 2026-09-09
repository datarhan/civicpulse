/**
 * Quitar secretos de un texto antes de que se guarde en cualquier sitio.
 *
 * Existe por un incidente concreto. El 1-sep-2026 la clave de Gemini acabó
 * comiteada en `pleno-speaker-map/1sqj7is.json` y `ma87e0.json`, y de ahí al
 * remoto en tres ramas. Nadie la escribió: `extract-speaker-map.ts` guarda el
 * MOTIVO de un trozo fallido en el manifiesto —lo cual es correcto y
 * deliberado, porque un fallo sin nombre se lee igual que un atraso
 * terminado— y ese motivo es el `err.message` de `execFileSync`, que lleva el
 * argv completo del proceso:
 *
 *     Command failed: curl -s … /upload/v1beta/files?key=AQ.Ab8RN6…
 *
 * El repositorio es privado, que es la única razón por la que no fue peor.
 *
 * La lección NO es «deja de registrar el error»: el motivo es lo que
 * distingue «no pude» de «no había nada». La lección es que **un secreto no
 * puede sobrevivir a un mensaje de error**, y eso se arregla en UN sitio por
 * el que pase todo, no en cada punto donde alguien escriba un log.
 *
 * Dos capas, a propósito:
 *
 *  1. Por NOMBRE (`key=`, `Authorization: Bearer`) y por FORMA (los prefijos
 *     que usan OpenAI, Google y la API de Gemini). Cubre al que no sabe qué
 *     secreto lleva en la mano.
 *  2. Por VALOR EXACTO, con `extra`. El llamante sí sabe cuál es su secreto y
 *     puede exigir que desaparezca aunque no tenga forma reconocible — que es
 *     el único modo de no depender de que esta lista esté al día.
 */

/** Prefijos de clave reconocibles por su forma, sin que nadie los nombre. */
const SHAPES: RegExp[] = [
  // Gemini / Google AI Studio (formato nuevo): AQ.<base64url>
  /\bAQ\.[A-Za-z0-9_-]{16,}/g,
  // OpenAI: sk-… y sk-proj-…
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}/g,
  // Google API key clásica: AIza…
  /\bAIza[A-Za-z0-9_-]{16,}/g,
  // Token de bot de Telegram: <id>:<35 caracteres>. Entra por la puerta que ya
  // se abrió una vez —el 3-09-2026 apareció escrito en `bot/DEPLOY.md`—, y el
  // tramo largo detrás de los dos puntos es lo que lo distingue de una hora
  // («11:03:16») o de un identificador con año («2026:01»).
  /\b\d{8,10}:[A-Za-z0-9_-]{30,}/g,
  // GitHub: ghp_/gho_/ghu_/ghs_/ghr_ y los personal access token nuevos.
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
]

/**
 * Devuelve `text` sin secretos. Nunca lanza: se la llama desde el camino de
 * error, y un redactor que revienta al redactar deja pasar el secreto entero.
 *
 * @param extra valores literales a tapar además de los reconocidos por forma
 *   (típicamente `process.env.GEMINI_API_KEY`). Los vacíos se ignoran — sin
 *   ese filtro un env sin poner convertiría cada hueco del texto en REDACTED.
 */
export function redactSecrets(text: string, extra: readonly (string | undefined)[] = []): string {
  if (typeof text !== 'string' || text.length === 0) return ''
  let out = text

  // El valor exacto primero: es el más fiable y el que no depende de esta
  // lista de formas siga estando al día.
  for (const secret of extra) {
    if (typeof secret !== 'string' || secret.length < 4) continue
    out = out.split(secret).join('REDACTED')
  }

  // `key=<valor>` en una URL. Se corta en & o en espacio para que el resto de
  // la query siga siendo legible: sin `alt=sse` ni `pageSize` el motivo deja
  // de servir para depurar, que es para lo que se guarda.
  out = out.replace(/([?&](?:key|api_?key|access_token|token)=)[^&\s"']+/gi, '$1REDACTED')

  // Cabeceras de autorización.
  out = out.replace(/(Authorization:\s*(?:Bearer|Basic)\s+)[^\s"']+/gi, '$1REDACTED')

  for (const re of SHAPES) out = out.replace(re, 'REDACTED')

  return out
}
