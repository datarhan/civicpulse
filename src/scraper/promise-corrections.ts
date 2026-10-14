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
 *
 * Desde el 12-10-2026, también el plazo (`withDueBy`, `withoutDueBy`): ver el
 * bloque PLAZO, abajo.
 */
import { rechazoDeFirma, rechazoDeMarcador } from './firma-de-persona'
import { sha256Short } from './hash'
import { normalizeForMatch } from './promise-grounding'
import {
  isFrozen,
  PROMISE_REASON_MIN,
  quoteContainsFragment,
  resolveDueBy,
  validatePromisesSnapshot,
  type PromiseCorrection,
  type PromiseDueBy,
  type PromiseDueByChange,
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
  title: string
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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PLAZO
 *
 * La PR #311 (12-10-2026) dejó «Plazos vencidos» de /departamentos en «— · sin
 * plazo fechado», porque ninguna promesa publicada llevaba un `dueBy` y ninguna
 * CLI podía escribirlo. Un anuncio como «lanzará la convocatoria el próximo mes
 * de septiembre» trae el plazo en la cita y en ningún campo, y deducirlo del
 * texto sería el plazo inferido por máquina que el validador impide.
 *
 * Así que lo fija una persona, y el cambio queda en `dueByLog` con quién,
 * cuándo, de qué a qué, por qué y sobre qué palabras de la cita. Fijar un plazo
 * es lo que deja a /departamentos llamar «vencida» a una promesa de un partido
 * con nombre: lo firma una persona (`rechazoDeFirma`). Quitarlo sólo retira esa
 * posibilidad, y basta con que la firma no sea el hueco de una orden sin
 * rellenar (`rechazoDeMarcador`), como en una retirada. Durante la veda
 * electoral (`frozenUntil`) no se toca ninguno de los dos.
 *
 * El validador (promises.ts, `validateDueBy`) exige lo mismo, de modo que un
 * plazo escrito a mano en el fichero tampoco publica.
 */
function noVedado(snap: Record<string, unknown>, now: Date): void {
  const frozenUntil = (snap.frozenUntil as string | null | undefined) ?? null
  if (isFrozen({ frozenUntil }, now))
    throw new Error(
      `veda electoral (LOREG) hasta ${frozenUntil}: /promesas está en sólo lectura y ` +
        'ningún plazo se fija ni se quita hasta que termine',
    )
}

function plazoActual(fila: Fila): PromiseDueBy | null {
  return typeof fila.dueBy === 'string' && typeof fila.dueBySource === 'string'
    ? { dueBy: fila.dueBy, dueBySource: fila.dueBySource }
    : null
}

function anotarPlazo(fila: Fila, cambio: PromiseDueByChange): void {
  if (cambio.to) {
    fila.dueBy = cambio.to.dueBy
    fila.dueBySource = cambio.to.dueBySource
  } else {
    delete fila.dueBy
    delete fila.dueBySource
  }
  fila.updatedAt = cambio.changedAt
  fila.dueByLog = [...((fila.dueByLog as PromiseDueByChange[] | undefined) ?? []), cambio]
}

/**
 * Fija (o cambia) el plazo de una promesa. `plazo` es un día (`AAAA-MM-DD`) o
 * un mes (`AAAA-MM`, que se publica como su último día: `resolveDueBy`);
 * `fuente`, las palabras de la cita que lo sostienen, copiadas literalmente.
 */
export function withDueBy(
  raw: string,
  id: string,
  cambio: { plazo: string; fuente: string },
  firma: Firma,
  now: Date = new Date(),
): string {
  const { snap, fila } = abrir(raw, id)
  noVedado(snap, now)
  const { reason, editor } = firmar(firma)
  const persona = rechazoDeMarcador(editor) ?? rechazoDeFirma(editor)
  if (persona) throw new Error(`fijar un plazo lo firma una persona: ${persona}`)
  const { dueBy, rule } = resolveDueBy(cambio.plazo)
  const dueBySource = cambio.fuente.normalize('NFC').replace(/\s+/g, ' ').trim()
  if (!quoteContainsFragment(fila.quote, dueBySource))
    throw new Error(
      `«${id}»: el fragmento «${dueBySource}» no está literal en la cita de la promesa; ` +
        'cópialo tal cual de la cita publicada, con sus tildes y mayúsculas',
    )
  const antes = plazoActual(fila)
  if (antes && antes.dueBy === dueBy && antes.dueBySource === dueBySource)
    throw new Error(`«${id}»: nada que cambiar, el plazo ya es ${dueBy} con ese fragmento`)
  const changedAt = now.toISOString().slice(0, 10)
  anotarPlazo(fila, { from: antes, to: { dueBy, dueBySource, rule }, reason, editor, changedAt })
  return cerrar(snap, now)
}

/** Quita el plazo de una promesa, firmado y razonado. */
export function withoutDueBy(
  raw: string,
  id: string,
  firma: Firma,
  now: Date = new Date(),
): string {
  const { snap, fila } = abrir(raw, id)
  noVedado(snap, now)
  const { reason, editor } = firmar(firma)
  const hueco = rechazoDeMarcador(editor)
  if (hueco) throw new Error(hueco)
  const antes = plazoActual(fila)
  if (!antes) throw new Error(`«${id}» no tiene plazo: no hay nada que quitar`)
  const changedAt = now.toISOString().slice(0, 10)
  anotarPlazo(fila, { from: antes, to: null, reason, editor, changedAt })
  return cerrar(snap, now)
}
