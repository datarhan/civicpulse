/**
 * El registro de lo que una persona ya respondió en la cola de excepción.
 *
 * ## Por qué la cola no convergería sin él
 *
 * La cola encola las fichas con al menos una cita retenida y pregunta si el
 * sumario dice, con otras palabras, lo que esa cita no puede decir. Responder
 * «no, no lo dice» no cambia la ficha, así que la fila volvería en cada pasada,
 * idéntica, para siempre; una lista que no encoge es una lista que se deja de
 * abrir, y las que importan quedan invisibles entre las ya juzgadas.
 *
 * Sólo se anota «keep» (mantener). Las otras tres respuestas cambian lo
 * publicado y son su propia prueba: corregir reescribe el sumario —la huella
 * cambia y la ficha vuelve, para que alguien juzgue las palabras nuevas—,
 * reclasificar quita la retención de la cita y retirar quita la ficha.
 *
 * ## La revisión se ata al texto revisado
 *
 * Cada entrada guarda la huella del sumario tal como estaba. Si el sumario
 * cambia después, la revisión ya no describe lo publicado y la fila vuelve.
 * Revisar una ficha no exime a su id para siempre: es un juicio sobre unas
 * palabras concretas, y atarlo a su contenido es la misma disciplina que
 * preguntar «¿ha cambiado X?» con la huella de X.
 *
 * ## Y a la pregunta que respondía (v2, 30-09-2026)
 *
 * La v1 guardaba respuestas a «¿merece este hallazgo la excepción?» —las 28
 * «keep» del 11-08-2026—, una pregunta que desde el 27-08 no cambiaba nada de
 * la página. Desde el 30-09 la cola pregunta otra cosa, y una respuesta a la
 * pregunta vieja no puede sacar una ficha de la nueva: `isReviewed` sólo cuenta
 * un registro de la versión vigente. Tampoco se tira ninguna: `migrarRegistro`
 * aparta las de versiones anteriores en `anteriores`, con la pregunta a la que
 * respondían, porque el fichero vive en editorial/ y no tiene otra copia. La
 * cabecera del propio registro (`_comment`) lo dice.
 *
 * Vive en `editorial/`, nunca bajo `public/`: nombra fichas sobre grupos
 * políticos junto a quién las dio por buenas.
 */
import { sha256Short } from './hash'
import { PREGUNTA_DE_LA_COLA } from './finding-exception'

export const REVIEW_LOG_VERSION = 'finding-exception-review-v2'

/** Lo que preguntaba cada versión anterior del registro. Es historia: no se reescribe. */
const PREGUNTAS_ANTERIORES: Readonly<Record<string, string>> = {
  'finding-exception-review-v1':
    '¿Merece este hallazgo la excepción que la puerta editorial reserva a una persona?',
}

/**
 * El suelo de la nota de una revisión. Una nota que dice «ok» anota que alguien
 * pulsó, no que alguien juzgó. El mismo que el de los motivos de la bitácora.
 */
export const NOTA_MINIMA = 20

/** La cabecera que lleva el registro cada vez que se escribe. */
export const CABECERA_DEL_REGISTRO =
  'REGISTRO DE REVISIONES de la cola de excepción (`npm run triage:finding-exception`). No se ' +
  'publica: vive en editorial/ (gitignored) porque nombra fichas sobre grupos políticos junto a ' +
  'quién las dio por buenas, y no tiene otra copia. Cada revisión de `reviews` responde a la ' +
  'pregunta de `pregunta` y se ata a la huella del sumario que juzgó: si el sumario cambia, la ' +
  `ficha vuelve a la cola. Versión ${REVIEW_LOG_VERSION} desde el 30-09-2026, cuando la cola ` +
  'cambió de pregunta: las revisiones de versiones anteriores —las «keep» del 11-08-2026 ' +
  'respondían a «¿merece este hallazgo la excepción?», una pregunta cuya respuesta no cambiaba ' +
  'nada de la página— se guardan en `anteriores`, cada bloque con la pregunta a la que ' +
  'respondía, y no cuentan: ninguna ficha sale de la cola por ellas. Lo escribe sólo ' +
  '`npm run review:finding-exception`.'

export interface ExceptionReview {
  findingId: string
  /** Sólo se anota `keep`; las otras respuestas son su propia prueba. */
  decision: 'keep'
  /** Quién decidió. No se publica en ningún sitio, pero es una firma de verdad. */
  reviewer: string
  reviewedAt: string
  /** La huella del sumario tal como estaba al revisarlo. */
  summaryHash: string
  /** Por qué el sumario no dice lo que la cita retenida no puede decir, en palabras de quien revisó. */
  note: string
}

/** Las revisiones de una versión anterior del registro: se guardan, no cuentan. */
export interface RevisionesAnteriores {
  version: string
  /** La pregunta a la que respondían; `null` si la versión no se conoce. */
  pregunta: string | null
  reviews: ExceptionReview[]
}

export interface ExceptionReviewLog {
  /** La cabecera: qué es el registro, a qué responde y qué no cuenta. */
  _comment?: string
  version: string
  /** La pregunta a la que responde cada revisión de `reviews`. */
  pregunta?: string
  generatedAt: string
  reviews: ExceptionReview[]
  anteriores?: RevisionesAnteriores[]
}

export function summaryHash(summary: string): string {
  return sha256Short(summary.replace(/\s+/g, ' ').trim())
}

/**
 * ¿Está ya revisado el sumario VIGENTE de esta ficha?
 *
 * Falso en cuanto algo no consta: sin registro, sin entrada, con un sumario que
 * cambió después, o con un registro de otra versión, cuyas revisiones
 * respondían a otra pregunta. Volver a revisar cuesta un minuto de alguien;
 * esconder un sumario sin revisar sobre un grupo político es lo que esta cola
 * existe para evitar.
 */
export function isReviewed(
  log: ExceptionReviewLog | null,
  findingId: string,
  currentSummary: string,
): boolean {
  if (log?.version !== REVIEW_LOG_VERSION || !log.reviews) return false
  const entry = log.reviews.find((r) => r.findingId === findingId)
  if (!entry) return false
  return entry.summaryHash === summaryHash(currentSummary)
}

/**
 * Lleva un registro a la versión vigente sin perder nada: las revisiones de una
 * versión anterior pasan a `anteriores`, con la pregunta a la que respondían, y
 * dejan de contar. Idempotente, y pura: quien escribe es la CLI.
 */
export function migrarRegistro(log: ExceptionReviewLog | null, ahora: string): ExceptionReviewLog {
  const vigente = log?.version === REVIEW_LOG_VERSION
  const anteriores = [...(log?.anteriores ?? [])]
  if (log && !vigente && (log.reviews ?? []).length > 0) {
    anteriores.push({
      version: log.version ?? 'sin-version',
      pregunta: log.pregunta ?? PREGUNTAS_ANTERIORES[log.version] ?? null,
      reviews: log.reviews,
    })
  }
  return {
    _comment: CABECERA_DEL_REGISTRO,
    version: REVIEW_LOG_VERSION,
    pregunta: PREGUNTA_DE_LA_COLA,
    generatedAt: vigente ? log.generatedAt : ahora,
    reviews: vigente ? (log.reviews ?? []) : [],
    ...(anteriores.length > 0 ? { anteriores } : {}),
  }
}

/**
 * Añade o sustituye una revisión. Sustituir importa: una ficha cuyo sumario
 * cambió y se volvió a revisar lleva una entrada vigente, no un montón de
 * viejas. Un registro de una versión anterior se migra antes de anotar.
 */
export function recordReview(
  log: ExceptionReviewLog | null,
  review: ExceptionReview,
): ExceptionReviewLog {
  const base = migrarRegistro(log, review.reviewedAt)
  const reviews = base.reviews.filter((r) => r.findingId !== review.findingId)
  return {
    ...base,
    generatedAt: review.reviewedAt,
    reviews: [...reviews, review].sort((a, b) => a.findingId.localeCompare(b.findingId)),
  }
}

/**
 * Las entradas cuya ficha ya no existe o cuyo sumario cambió, de entre las que
 * cuentan. Las de otra versión no describen lo publicado en ningún caso: las
 * enseña `anteriores`, no esto.
 */
export function staleReviews(
  log: ExceptionReviewLog | null,
  summariesById: ReadonlyMap<string, string>,
): ExceptionReview[] {
  if (log?.version !== REVIEW_LOG_VERSION) return []
  return (log.reviews ?? []).filter((r) => {
    const current = summariesById.get(r.findingId)
    return current === undefined || summaryHash(current) !== r.summaryHash
  })
}

/**
 * Parte las filas de la cola en las que alguien ya mantuvo a ESTE sumario y
 * las que faltan por mirar. Lo revisado sale de lo que se enseña, nunca de las
 * cuentas de la cola: «ya revisada» y «fuera del alcance» son hechos distintos.
 */
export function pendientesDeRevision<R extends { findingId: string; summary: string }>(
  rows: readonly R[],
  log: ExceptionReviewLog | null,
): { pendientes: R[]; revisadas: R[] } {
  const pendientes: R[] = []
  const revisadas: R[] = []
  for (const r of rows) (isReviewed(log, r.findingId, r.summary) ? revisadas : pendientes).push(r)
  return { pendientes, revisadas }
}
