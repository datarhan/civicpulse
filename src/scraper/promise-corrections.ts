/**
 * Corregir o retirar una promesa ya publicada, dejando constancia.
 *
 * Nace del encargo del 28-09-2026: la cita de una promesa tiene que ser lo que
 * la fuente pone en boca del partido, y la auditoría de las tarjetas de
 * /promesas encontró que la mayoría no lo era —un titular, la frase del
 * periodista, una votación contada en tercera persona—. Cambiar una cita
 * publicada o retirar una tarjeta es corregir prosa atribuida a un partido, y
 * aquí eso deja rastro («Nothing automatic rewrites published prose», CLAUDE.md):
 *
 *   · una cita o una fuente nuevas entran en `corrections[]` con la vieja al lado;
 *   · una retirada deja en `retractions[]` una huella, no el texto (ver
 *     `PromiseRetraction` en promises.ts).
 *
 * Funciones puras sobre el texto del fichero: lo reescriben tal y como se leyó
 * (no la copia normalizada del validador), mueven el sello y no devuelven nada
 * que el validador rechace. Comprobar en la red que la cita nueva está en su
 * fuente, y que son palabras del partido, es cosa del CLI (`corregir-promesa`).
 */
import { sha256Short } from './hash'
import { normalizeForMatch } from './promise-grounding'
import {
  PROMISE_REASON_MIN,
  validatePromisesSnapshot,
  type PromiseCorrection,
  type PromiseRetraction,
} from './promises'

/**
 * La huella de una promesa retirada: partido, título, cita normalizada y URL
 * de su fuente. Quien conserve el original puede comprobar que la retirada es
 * de esa tarjeta; con la huella sola no se puede leer lo que decía.
 *
 * Partido y título entran porque la huella identifica la FICHA, no la frase: en
 * la primera aplicación, con sólo cita y URL, las fichas de VOX y de Compromís
 * —que citaban la misma frase de la misma noticia— salieron con la misma huella.
 */
export function promiseDigest(p: {
  party: string
  title: string
  quote: string
  source: { url: string }
}): string {
  const huella = [p.party, p.title, normalizeForMatch(p.quote), p.source.url].join('\n')
  return `promesa · sha256:${sha256Short(huella)}`
}

/**
 * Palabras seguidas del texto retirado que no pueden reaparecer en el motivo.
 * Seis, como en `finding-retraction.ts`: bastan para cazar un fragmento
 * citado y no saltan con una descripción corriente.
 */
const PALABRAS_DE_ECO = 6

/** Palabras sin puntuación: «servicio y servicio» son la misma palabra. */
const palabras = (s: string) =>
  normalizeForMatch(s)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)

/** El fragmento del texto retirado que el motivo repite, o null. */
export function reasonEchoes(reason: string, withdrawn: string): string | null {
  const w = palabras(withdrawn)
  const r = ` ${palabras(reason).join(' ')} `
  for (let i = 0; i + PALABRAS_DE_ECO <= w.length; i++) {
    const trozo = w.slice(i, i + PALABRAS_DE_ECO).join(' ')
    if (r.includes(` ${trozo} `)) return trozo
  }
  return null
}

export interface Firma {
  reason: string
  /** Quien decide. El nombre de un script aquí mentiría sobre quién juzgó. */
  editor: string
}

type Fila = Record<string, unknown> & {
  id: string
  party: string
  quote: string
  source: { url: string; publisher: string }
}

function abrir(raw: string, id: string) {
  const snap = JSON.parse(raw) as Record<string, unknown> & { items: Fila[] }
  const idx = snap.items.findIndex((p) => p.id === id)
  if (idx < 0) throw new Error(`no hay ninguna promesa con id «${id}»`)
  return { snap, idx, fila: snap.items[idx] }
}

function firmar(f: Firma) {
  const reason = f.reason.trim()
  const editor = f.editor.trim()
  if (reason.length < PROMISE_REASON_MIN)
    throw new Error(`el motivo necesita al menos ${PROMISE_REASON_MIN} caracteres`)
  if (editor.length < 2) throw new Error('falta quién firma la corrección')
  return { reason, editor }
}

function cerrar(snap: Record<string, unknown>, now: Date): string {
  const json = JSON.stringify({ ...snap, generatedAt: now.toISOString() }, null, 2) + '\n'
  validatePromisesSnapshot(json)
  return json
}

/**
 * La cita (y, si hace falta, la fuente) de una promesa, cambiadas con su
 * rastro. La fuente cambia cuando la cita buena está en otra página: la del
 * medio en vez de su redirección de Google News, o la nota del Ayuntamiento
 * que la noticia resumía.
 */
export function withQuoteCorrection(
  raw: string,
  id: string,
  cambio: { quote: string; sourceUrl?: string; publisher?: string },
  firma: Firma,
  now: Date = new Date(),
): string {
  const { snap, fila } = abrir(raw, id)
  const { reason, editor } = firmar(firma)
  const correctedAt = now.toISOString().slice(0, 10)
  const nuevas: PromiseCorrection[] = []
  const quote = cambio.quote.trim()
  if (quote !== fila.quote)
    nuevas.push({
      field: 'quote',
      original: fila.quote,
      corrected: quote,
      reason,
      editor,
      correctedAt,
    })
  const url = cambio.sourceUrl?.trim()
  if (url && url !== fila.source.url)
    nuevas.push({
      field: 'source.url',
      original: fila.source.url,
      corrected: url,
      reason,
      editor,
      correctedAt,
    })
  const publisher = cambio.publisher?.trim()
  if (publisher && publisher !== fila.source.publisher)
    nuevas.push({
      field: 'source.publisher',
      original: fila.source.publisher,
      corrected: publisher,
      reason,
      editor,
      correctedAt,
    })
  if (nuevas.length === 0) throw new Error(`«${id}»: nada que corregir, ya dice eso`)
  fila.quote = quote
  if (url) fila.source.url = url
  if (publisher) fila.source.publisher = publisher
  fila.updatedAt = correctedAt
  fila.corrections = [...((fila.corrections as PromiseCorrection[] | undefined) ?? []), ...nuevas]
  return cerrar(snap, now)
}

/**
 * Retira una promesa publicada: la fila sale del registro y queda su huella.
 * El motivo no puede repetir la cita retirada —sería volver a publicarla—.
 */
export function withRetraction(
  raw: string,
  id: string,
  firma: Firma,
  now: Date = new Date(),
): string {
  const { snap, idx, fila } = abrir(raw, id)
  const { reason, editor } = firmar(firma)
  const eco = reasonEchoes(reason, fila.quote)
  if (eco)
    throw new Error(`«${id}»: el motivo repite la cita retirada («${eco}»); descríbela sin citarla`)
  const retirada: PromiseRetraction = {
    promiseId: fila.id,
    party: fila.party as PromiseRetraction['party'],
    digest: promiseDigest(fila),
    reason,
    editor,
    retractedAt: now.toISOString(),
  }
  const items = [...snap.items.slice(0, idx), ...snap.items.slice(idx + 1)]
  const retractions = [...((snap.retractions as PromiseRetraction[] | undefined) ?? []), retirada]
  return cerrar({ ...snap, items, retractions }, now)
}
