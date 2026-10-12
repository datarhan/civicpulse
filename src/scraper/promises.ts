/**
 * Promise-tracker schema + validator.
 *
 * This file is the *legal contract* for CivicPulse's political-promise
 * tracker. Three invariants protect both the project and the people
 * named in the data:
 *
 *   1. Every promise carries a verbatim quote + the URL of the source it
 *      was copied from + publisher + dated `madeAt`. No hearsay. The source
 *      is a third party's — the official document or the news item that
 *      carries the quote — never ours (`assertNotSelfCited`), and nothing
 *      that describes this register calls it «primaria» (`FUENTE_PRIMARIA`).
 *   2. V1 statuses are constrained to { documentada | en-verificacion }.
 *      The full enum (cumplida, parcial, no-ejecutada, inviable,
 *      en-progreso) exists in code but cannot be set without an
 *      evidence entry carrying its own dated URL + verbatim quote.
 *   3. Snapshot metadata carries a `frozenUntil` field; during the
 *      LOREG electoral window the UI enters read-only mode and the
 *      inference suggestion layer can still compute but never mutate.
 *
 * The curated snapshot lives in public/data/promises.json and is
 * human-edited via PRs. The inference engine writes to a separate file
 * (public/data/promise-suggestions.json) and never touches this one.
 */

import { rechazoDeFirma, rechazoDeMarcador } from './firma-de-persona'

// No `Otro`: a sentinel is never a value (CLAUDE.md, data-integrity rule 3),
// and no promise or reply ever used it.
export const ALLOWED_PARTIES = ['PSOE', 'PP', 'VOX', 'Compromís', 'EU-Podem'] as const
export type Party = (typeof ALLOWED_PARTIES)[number]

export const ALLOWED_STATUSES = [
  'documentada',
  'en-verificacion',
  'en-progreso',
  'cumplida',
  'parcial',
  'no-ejecutada',
  'inviable',
] as const
export type Status = (typeof ALLOWED_STATUSES)[number]

export const V1_STATUSES = new Set<Status>(['documentada', 'en-verificacion'])

/**
 * The three "progress" statuses a status-change draft may propose. This is a
 * deliberate subset of ALLOWED_STATUSES: the miner only ever advances a promise
 * along the fulfilment axis (documentada → en-progreso → parcial → cumplida).
 * It never proposes no-ejecutada / inviable — those are libel-heavy negative
 * judgements reserved for a human curator.
 *
 * Vive aquí y no en promise-draft.ts, cuyo validador la aplica, porque
 * /metodologia la lee para decir qué propone el motor, y promise-draft.ts
 * arrastra hash.ts —node:crypto—, que no entra en el paquete del navegador.
 */
export const PROGRESS_STATUSES: readonly ['en-progreso', 'parcial', 'cumplida'] = [
  'en-progreso',
  'parcial',
  'cumplida',
]

/** Fulfilment ordinal for the forward-only guard: an auto status change may only
 *  ADVANCE a promise, never regress it. documentada/en-verificacion are the
 *  baseline (0); en-progreso(1) < parcial(2) < cumplida(3). The accusatory /
 *  terminal statuses map to 0 so a machine change can never step "down" onto or
 *  off them (they are curator-only anyway). */
const PROGRESS_ORDER: Record<Status, number> = {
  documentada: 0,
  'en-verificacion': 0,
  'en-progreso': 1,
  parcial: 2,
  cumplida: 3,
  'no-ejecutada': 0,
  inviable: 0,
}

/**
 * ¿`proposed` adelanta la promesa respecto de `current`? Es la regla con la que
 * el curador automático descarta un retroceso (`selectStatusDrafts`), y con la
 * que /promesas decide si enseña la propuesta del motor de palabras clave: ese
 * motor no lee el estado publicado, y su suelo, `documentada`, quiere decir «no
 * encontré señal de avance», no «rebájala». Vive aquí, junto al enum, porque la
 * leen los dos. Un estado que no está en el enum no adelanta nada.
 */
export function advancesStatus(current: Status, proposed: Status): boolean {
  return PROGRESS_ORDER[proposed] > PROGRESS_ORDER[current]
}

export const ALLOWED_KINDS = [
  'programa-electoral',
  'compromiso-investidura',
  'anuncio-gobierno',
  'enmienda-pleno',
  'pacto-coalicion',
] as const
export type Kind = (typeof ALLOWED_KINDS)[number]

export const ALLOWED_TOPICS = [
  'fiscal',
  'vivienda',
  'movilidad',
  'medio-ambiente',
  'social',
  'cultura',
  'seguridad',
  'empleo',
  'urbanismo',
  'salud',
  'participacion',
  'educacion',
  'deporte',
  'juventud',
  'mayores',
  'igualdad',
  'transparencia',
  'other',
] as const
export type Topic = (typeof ALLOWED_TOPICS)[number]

export interface EvidenceEntry {
  date: string // ISO
  url: string
  quote: string
  publisher: string
  kind: 'press' | 'pleno' | 'tender' | 'budget' | 'bdns' | 'ayuntamiento' | 'otro'
  addedBy: string // who curated this evidence ("civicpulse-bot" for auto)
}

export interface SourceRef {
  url: string
  publisher: string
  page?: number
  quote?: string
}

export interface AutoPublishedMeta {
  at: string // ISO
  by: 'auto-curation-v1'
  confidence: number // 0..1
  reviewState: 'pending-review' | 'reviewed' | 'retracted'
  reviewedAt?: string
  /**
   * Set only when this stamp records an auto-published STATUS CHANGE on a
   * pre-existing promise (not a brand-new auto-created promise). Enables a
   * clean revert on retract — status → priorStatus, drop the evidence entry at
   * appendedEvidenceUrl — instead of deleting the whole curated promise.
   */
  priorStatus?: Status
  appendedEvidenceUrl?: string
}

export interface Promise {
  id: string
  party: Party
  title: string
  quote: string
  source: SourceRef
  madeAt: string // ISO
  topic: Topic
  kind: Kind
  status: Status
  evidence: EvidenceEntry[]
  notes?: string
  createdAt: string
  updatedAt?: string
  response?: {
    from: Party
    quote: string
    source?: SourceRef
    respondedAt: string
  } | null
  /**
   * Optional: the canonical department slug (from src/scraper/departments.ts)
   * responsible for delivering this promise. Optional because most
   * electoral promises span multiple concejalías. Only set by hand in a
   * curated PR — the inference engine never writes this field.
   */
  departmentSlug?: string
  /**
   * Optional: ISO date by which the promise is supposed to be
   * delivered. When set, the /departamentos dashboard renders a
   * "plazo vencido" flag after the date passes with no fulfilment
   * evidence. Status is NEVER auto-flipped — the V1 gate still
   * requires human-curated evidence to publish
   * cumplida/parcial/no-ejecutada/inviable.
   */
  dueBy?: string
  /**
   * The words of `quote` that the deadline rests on, copied verbatim — the
   * same field, and the same ≥20-char floor, as a pleno vote's `dueBySource`,
   * plus one check a vote cannot have: the fragment must appear, exactly, in
   * the quote this card publishes. Present if and only if `dueBy` is.
   */
  dueBySource?: string
  /**
   * Who set or cleared `dueBy`, when, from what to what, and why. Written only
   * by `npm run corregir-promesa -- plazo|quitar-plazo`; a `dueBy` the last
   * entry here does not match is rejected, so a deadline nobody signed for
   * never publishes. Omitted when empty.
   */
  dueByLog?: PromiseDueByChange[]
  autoPublished?: AutoPublishedMeta | null
  /**
   * Public corrections log: what a curator changed after publication, with
   * the text that stood before. Written only by `npm run corregir-promesa`.
   * Omitted when empty, so an uncorrected card reads as it always did.
   */
  corrections?: PromiseCorrection[]
}

/**
 * What a correction may change: the quote, and the source it was copied from
 * — its URL and who published it, which change together when the right quote
 * is on the council's own note rather than on the paper that summarised it.
 */
export const PROMISE_CORRECTION_FIELDS = ['quote', 'source.url', 'source.publisher'] as const
export type PromiseCorrectionField = (typeof PROMISE_CORRECTION_FIELDS)[number]

/** Same floor as every other curator reason in this repo. */
export const PROMISE_REASON_MIN = 20

export interface PromiseCorrection {
  field: PromiseCorrectionField
  original: string
  corrected: string
  reason: string
  /** A person. A script's name here would be a lie about who judged. */
  editor: string
  correctedAt: string
}

/**
 * How the curator's date becomes `dueBy`. Two rules, and /metodologia names
 * both:
 *
 *   · `dia`        — the curator wrote a day (`2026-09-15`); published as is.
 *   · `fin-de-mes` — the curator wrote a month (`2026-09`), because the quote
 *                    names a month and no day («el próximo mes de septiembre»);
 *                    published as that month's LAST day, so the promise is not
 *                    called overdue while the month it named is still running.
 *
 * There is no rule for a season, a quarter or «a principios de año»: a quote
 * that vague has no date a person can sign, and inventing one is the
 * machine-inferred deadline this schema exists to block.
 */
export const DUE_BY_RULES = ['dia', 'fin-de-mes'] as const
export type DueByRule = (typeof DUE_BY_RULES)[number]

/** Same floor as a pleno vote's `dueBySource` (pleno-votes.ts). */
export const DUE_BY_SOURCE_MIN = 20

export interface PromiseDueBy {
  dueBy: string
  dueBySource: string
}

/**
 * One signed change of a promise's deadline. `from: null` sets one where there
 * was none; `to: null` clears it. Setting one is a new claim about a named
 * party —it is what lets /departamentos call the promise overdue— so a person
 * signs it (`rechazoDeFirma`); clearing one only withdraws a claim, and the
 * role account may sign it, as it signs a retraction (`rechazoDeMarcador`).
 */
export interface PromiseDueByChange {
  from: PromiseDueBy | null
  to: (PromiseDueBy & { rule: DueByRule }) | null
  reason: string
  editor: string
  changedAt: string
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/** Is `s` a calendar day that exists (`2026-02-30` is not)? */
function isRealDay(s: unknown): s is string {
  if (typeof s !== 'string' || !ISO_DAY.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** The last day of month `m` (1–12) of year `y`, as `YYYY-MM-DD`. */
const lastDayOfMonth = (y: number, m: number) =>
  new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)

/**
 * The curator's date as `dueBy`, with the rule that read it (`DUE_BY_RULES`).
 * Throws on anything that is not a real day or month: «septiembre», a quarter,
 * `2026-9`.
 */
export function resolveDueBy(texto: string): { dueBy: string; rule: DueByRule } {
  const t = String(texto ?? '').trim()
  if (isRealDay(t)) return { dueBy: t, rule: 'dia' }
  const m = /^(\d{4})-(\d{2})$/.exec(t)
  if (m) {
    const mes = Number(m[2])
    if (mes >= 1 && mes <= 12)
      return { dueBy: lastDayOfMonth(Number(m[1]), mes), rule: 'fin-de-mes' }
  }
  throw new Error(
    `el plazo «${t}» no es un día (AAAA-MM-DD) ni un mes (AAAA-MM) que exista; ` +
      'una estación o un trimestre no tienen una fecha que se pueda firmar',
  )
}

/** Spacing and Unicode form only: the words themselves must match exactly. */
const llano = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim()

/**
 * Does `fragment` appear, exactly, in `quote`? No accent or case folding and
 * no fuzzy match: the fragment is the verbatim the deadline rests on, and a
 * tolerance here would let a paraphrase through. Only `quote` — the text the
 * card publishes — counts; `source.quote` is not shown anywhere.
 */
export function quoteContainsFragment(quote: string, fragment: string): boolean {
  const f = llano(fragment)
  return f.length > 0 && llano(quote).includes(f)
}

/**
 * A withdrawn promise. It keeps a digest of what stood, not the words: a
 * retraction removes a sentence attributed to a party that the party did not
 * say, and a ledger that republished it would keep it fetchable under
 * `public/` for as long as the site exists. Same trade as
 * `finding-retraction.ts`. Anyone holding the original can check the digest
 * (`promiseDigest`).
 */
export interface PromiseRetraction {
  /** The withdrawn promise's id. Never reused. */
  promiseId: string
  /** Which party the card was attributed to, so the count by party adds up. */
  party: Party
  digest: string
  reason: string
  editor: string
  retractedAt: string
}

export const PROMISE_DIGEST_RE = /^promesa · sha256:[0-9a-f]{12}$/

export interface PromisesSnapshot {
  version: string
  generatedAt: string
  frozenUntil: string | null // YYYY-MM-DD or null
  legalNotice: string
  contactUrl: string
  methodologyUrl: string
  items: Promise[]
  /** Withdrawn promises, oldest first. Written only by `npm run corregir-promesa`. */
  retractions?: PromiseRetraction[]
}

class ValidationError extends Error {
  constructor(msg: string) {
    super(`promises.json: ${msg}`)
  }
}

function assertString(v: unknown, name: string, min = 1, max = Infinity): asserts v is string {
  if (typeof v !== 'string') throw new ValidationError(`${name} must be string`)
  if (v.length < min) throw new ValidationError(`${name} too short (${v.length} < ${min})`)
  if (v.length > max) throw new ValidationError(`${name} too long (${v.length} > ${max})`)
}

function assertEnum<T extends string>(
  v: unknown,
  allowed: readonly T[],
  name: string,
): asserts v is T {
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
    throw new ValidationError(
      `${name} must be one of [${allowed.join(', ')}] (got ${JSON.stringify(v)})`,
    )
  }
}

function assertIsoDate(v: unknown, name: string): asserts v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v)) {
    throw new ValidationError(`${name} must be ISO YYYY-MM-DD (got ${JSON.stringify(v)})`)
  }
}

function assertUrl(v: unknown, name: string): asserts v is string {
  if (typeof v !== 'string' || !/^https?:\/\//.test(v)) {
    throw new ValidationError(`${name} must be absolute http(s) URL (got ${JSON.stringify(v)})`)
  }
}

/** Our own published surfaces. Matches the host, not the string: a URL merely
 *  containing our name belongs to somebody else. */
const OWN_HOSTS = /^(?:www\.)?civicpulse\.es$/i

/**
 * A promise may not rest on us.
 *
 * `psoe-alumbrado-led-680k` shipped on /promesas with a «cita» nobody uttered —
 * a sentence we had written — and `source.url` pointing at our own
 * `tenders.json`, making CivicPulse the evidence for an accusation of
 * favouritism against a named party. The schema accepted it because it asked
 * only for «≥20 characters + URL + publisher», and a check that cannot tell a
 * quote from our own prose is not checking anything (c66cf93, 2026-08-02).
 *
 * Our snapshots are what a claim is CHECKED AGAINST, never what it RESTS ON.
 * Applied to `source.url` only: an `evidence[].url` pointing at our own data is
 * a legitimate cross-reference, and the contrast step is built on exactly that.
 */
function assertNotSelfCited(url: string, name: string): void {
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    return // shape is assertUrl's job, not ours
  }
  if (OWN_HOSTS.test(host)) {
    throw new ValidationError(
      `${name} no puede citarse a sí mismo (${host}): una promesa necesita la fuente de un ` +
        `tercero —el documento oficial o la noticia que recoge la cita—. Nuestros propios ` +
        `datos sirven para CONTRASTAR la afirmación, no para sostenerla — ver c66cf93.`,
    )
  }
}

/**
 * What a text describing this register may not call its sources.
 *
 * To a reader a «fuente primaria» is the original document — the manifesto,
 * the acta, the council's own notice — not the news item that reports it. This
 * schema accepts any third party's URL as `source.url`, press included:
 * `assertNotSelfCited` only excludes us. So a text that calls the sources
 * «primarias» promises more than this schema checks, however the mix of
 * sources moves.
 *
 * The notice on /promesas said «mediante fuentes primarias enlazadas» from the
 * V1 seed until the reader review of 2026-09-28, with most of the cards under
 * it citing press. The word came from here: the self-citation message above
 * said «fuente primaria» meaning «a third party's, not ours».
 *
 * Castilian and Valencian, because the promise copy is catalogued in both.
 */
export const FUENTE_PRIMARIA = /\bfuentes?\s+primarias?\b|\bfonts?\s+primàri(?:a|es)\b/i

function validateEvidence(e: unknown, idx: number): EvidenceEntry {
  if (!e || typeof e !== 'object') throw new ValidationError(`evidence[${idx}] must be object`)
  const r = e as Record<string, unknown>
  assertIsoDate(r.date, `evidence[${idx}].date`)
  assertUrl(r.url, `evidence[${idx}].url`)
  assertString(r.quote, `evidence[${idx}].quote`, 10, 800)
  assertString(r.publisher, `evidence[${idx}].publisher`, 1, 100)
  assertEnum(
    r.kind,
    ['press', 'pleno', 'tender', 'budget', 'bdns', 'ayuntamiento', 'otro'],
    `evidence[${idx}].kind`,
  )
  assertString(r.addedBy, `evidence[${idx}].addedBy`, 1, 80)
  return r as unknown as EvidenceEntry
}

function validatePromise(p: unknown, idx: number): Promise {
  if (!p || typeof p !== 'object') throw new ValidationError(`items[${idx}] must be object`)
  const r = p as Record<string, unknown>
  assertString(r.id, `items[${idx}].id`, 3, 80)
  assertEnum(r.party, ALLOWED_PARTIES, `items[${idx}].party`)
  assertString(r.title, `items[${idx}].title`, 4, 200)
  // Verbatim quote invariant — ≥20 chars, prevents summarising.
  assertString(r.quote, `items[${idx}].quote (verbatim, ≥20 chars)`, 20, 1500)
  if (!r.source || typeof r.source !== 'object')
    throw new ValidationError(`items[${idx}].source missing`)
  const src = r.source as Record<string, unknown>
  assertUrl(src.url, `items[${idx}].source.url`)
  assertNotSelfCited(src.url, `items[${idx}].source.url`)
  assertString(src.publisher, `items[${idx}].source.publisher`, 1, 100)
  assertIsoDate(r.madeAt, `items[${idx}].madeAt`)
  assertEnum(r.topic, ALLOWED_TOPICS, `items[${idx}].topic`)
  assertEnum(r.kind, ALLOWED_KINDS, `items[${idx}].kind`)
  assertEnum(r.status, ALLOWED_STATUSES, `items[${idx}].status`)
  // V1 legal gate: only 'documentada' and 'en-verificacion' are publishable
  // without accompanying evidence; all other statuses need ≥1 evidence entry.
  if (!V1_STATUSES.has(r.status as Status)) {
    if (!Array.isArray(r.evidence) || r.evidence.length === 0) {
      throw new ValidationError(
        `items[${idx}] status "${r.status}" requires ≥1 evidence entry (V1 invariant)`,
      )
    }
  }
  if (!Array.isArray(r.evidence)) throw new ValidationError(`items[${idx}].evidence must be array`)
  const evidence = (r.evidence as unknown[]).map((e, ei) => validateEvidence(e, ei))
  assertIsoDate(r.createdAt, `items[${idx}].createdAt`)
  // A suggestion never substitutes for a published status (CLAUDE.md, «What
  // may publish»): a row still awaiting a human is not part of the register.
  if ('requiresHumanApproval' in r) {
    throw new ValidationError(
      `items[${idx}] carries requiresHumanApproval: a draft awaiting a human is not a ` +
        `published promise — apply it through its curator CLI`,
    )
  }
  const plazo = validateDueBy(r, idx)
  if (r.departmentSlug !== undefined && r.departmentSlug !== null) {
    assertString(r.departmentSlug, `items[${idx}].departmentSlug`, 2, 40)
    if (!/^[a-z][a-z0-9-]*$/.test(r.departmentSlug as string)) {
      throw new ValidationError(
        `items[${idx}].departmentSlug must be kebab-case (got ${JSON.stringify(r.departmentSlug)})`,
      )
    }
  }
  if (r.autoPublished !== undefined && r.autoPublished !== null) {
    const ap = r.autoPublished as Record<string, unknown>
    assertIsoDate(ap.at, `items[${idx}].autoPublished.at`)
    if (ap.by !== 'auto-curation-v1')
      throw new ValidationError(`items[${idx}].autoPublished.by must be 'auto-curation-v1'`)
    if (typeof ap.confidence !== 'number' || ap.confidence < 0 || ap.confidence > 1)
      throw new ValidationError(`items[${idx}].autoPublished.confidence must be 0..1`)
    assertEnum(
      ap.reviewState,
      ['pending-review', 'reviewed', 'retracted'] as const,
      `items[${idx}].autoPublished.reviewState`,
    )
    if (ap.reviewedAt !== undefined && ap.reviewedAt !== null)
      assertIsoDate(ap.reviewedAt, `items[${idx}].autoPublished.reviewedAt`)
    if (ap.priorStatus !== undefined && ap.priorStatus !== null)
      assertEnum(ap.priorStatus, ALLOWED_STATUSES, `items[${idx}].autoPublished.priorStatus`)
    if (ap.appendedEvidenceUrl !== undefined && ap.appendedEvidenceUrl !== null)
      assertUrl(ap.appendedEvidenceUrl, `items[${idx}].autoPublished.appendedEvidenceUrl`)
  }
  let corrections: PromiseCorrection[] | undefined
  if (r.corrections !== undefined) {
    if (!Array.isArray(r.corrections))
      throw new ValidationError(`items[${idx}].corrections must be array`)
    corrections = (r.corrections as unknown[]).map((c, ci) =>
      validateCorrection(c, `items[${idx}].corrections[${ci}]`),
    )
  }
  return {
    id: r.id as string,
    party: r.party as Party,
    title: r.title as string,
    quote: r.quote as string,
    source: {
      url: src.url as string,
      publisher: src.publisher as string,
      page: typeof src.page === 'number' ? src.page : undefined,
      quote: typeof src.quote === 'string' ? src.quote : undefined,
    },
    madeAt: r.madeAt as string,
    topic: r.topic as Topic,
    kind: r.kind as Kind,
    status: r.status as Status,
    evidence,
    notes: typeof r.notes === 'string' ? r.notes : undefined,
    createdAt: r.createdAt as string,
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : undefined,
    response: (r.response as Promise['response']) ?? null,
    // Carried through, like `corrections`, or a writer that serialises this
    // normalised copy would drop the deadline's source and its signed trail.
    ...(plazo.live ?? {}),
    ...(plazo.log.length ? { dueByLog: plazo.log } : {}),
    ...(typeof r.departmentSlug === 'string' ? { departmentSlug: r.departmentSlug } : {}),
    autoPublished: (r.autoPublished as Promise['autoPublished']) ?? null,
    // Carried through, or every writer that serialises this normalised copy
    // (the auto-curator, `apply-promise-draft`, `freeze:set`) would erase the
    // log on its next run.
    ...(corrections?.length ? { corrections } : {}),
  }
}

const sameDueBy = (a: PromiseDueBy | null, b: PromiseDueBy | null) =>
  a === null || b === null ? a === b : a.dueBy === b.dueBy && a.dueBySource === b.dueBySource

const pairOf = (to: PromiseDueByChange['to']): PromiseDueBy | null =>
  to ? { dueBy: to.dueBy, dueBySource: to.dueBySource } : null

function validateDueByPair(v: unknown, name: string): PromiseDueBy {
  if (!v || typeof v !== 'object') throw new ValidationError(`${name} must be object or null`)
  const o = v as Record<string, unknown>
  if (!isRealDay(o.dueBy))
    throw new ValidationError(
      `${name}.dueBy must be a real YYYY-MM-DD day (got ${JSON.stringify(o.dueBy)})`,
    )
  assertString(o.dueBySource, `${name}.dueBySource`, DUE_BY_SOURCE_MIN, 400)
  return { dueBy: o.dueBy, dueBySource: o.dueBySource }
}

/**
 * A promise's deadline: `dueBy` with its verbatim `dueBySource`, and the signed
 * `dueByLog` that put them there. «Evidence gates the strong verdicts»
 * (CLAUDE.md): a deadline is what lets a page call a named party's promise
 * overdue, so it needs the words it rests on —in the quote this card shows—
 * and somebody's name on the change. A deadline read off the quote by a
 * machine has neither, and this is where it stops.
 */
function validateDueBy(
  r: Record<string, unknown>,
  idx: number,
): { live: PromiseDueBy | null; log: PromiseDueByChange[] } {
  const where = `items[${idx}]`
  const hasDue = r.dueBy !== undefined && r.dueBy !== null
  const hasSrc = r.dueBySource !== undefined && r.dueBySource !== null
  let live: PromiseDueBy | null = null
  if (hasDue) {
    if (!isRealDay(r.dueBy))
      throw new ValidationError(
        `${where}.dueBy must be a real ISO YYYY-MM-DD day (got ${JSON.stringify(r.dueBy)})`,
      )
    if (!hasSrc)
      throw new ValidationError(
        `${where}.dueBy needs its dueBySource: the verbatim words of the quote it rests on — ` +
          `a deadline without them is a machine-inferred one`,
      )
    assertString(
      r.dueBySource,
      `${where}.dueBySource (verbatim, ≥${DUE_BY_SOURCE_MIN} chars)`,
      DUE_BY_SOURCE_MIN,
      400,
    )
    if (!quoteContainsFragment(r.quote as string, r.dueBySource))
      throw new ValidationError(
        `${where}.dueBySource no está literal en la cita de la promesa («${r.dueBySource}»): ` +
          `el plazo tiene que apoyarse en palabras que la tarjeta publica. Si la cita se ` +
          `corrigió, quita antes el plazo (corregir-promesa quitar-plazo) o vuelve a fijarlo`,
      )
    if (r.dueBy < (r.madeAt as string).slice(0, 10))
      throw new ValidationError(
        `${where}.dueBy ${r.dueBy} is before madeAt ${r.madeAt}: a deadline cannot fall ` +
          `before the promise was made`,
      )
    live = { dueBy: r.dueBy, dueBySource: r.dueBySource }
  } else if (hasSrc) {
    throw new ValidationError(`${where}.dueBySource without dueBy`)
  }

  const log: PromiseDueByChange[] = []
  if (r.dueByLog !== undefined) {
    if (!Array.isArray(r.dueByLog)) throw new ValidationError(`${where}.dueByLog must be array`)
    let prev: PromiseDueBy | null = null
    for (const [i, e] of (r.dueByLog as unknown[]).entries()) {
      const name = `${where}.dueByLog[${i}]`
      if (!e || typeof e !== 'object') throw new ValidationError(`${name} must be object`)
      const o = e as Record<string, unknown>
      const from = o.from === null ? null : validateDueByPair(o.from, `${name}.from`)
      let to: PromiseDueByChange['to'] = null
      if (o.to !== null) {
        const pair = validateDueByPair(o.to, `${name}.to`)
        const rule = (o.to as Record<string, unknown>).rule
        assertEnum(rule, DUE_BY_RULES, `${name}.to.rule`)
        if (rule === 'fin-de-mes') {
          const [y, m] = pair.dueBy.split('-').map(Number)
          if (pair.dueBy !== lastDayOfMonth(y, m))
            throw new ValidationError(
              `${name}.to: rule fin-de-mes publishes the month's last day, not ${pair.dueBy}`,
            )
        }
        to = { ...pair, rule }
      }
      if (from === null && to === null)
        throw new ValidationError(`${name}: a change from no deadline to no deadline is not one`)
      if (sameDueBy(from, pairOf(to)))
        throw new ValidationError(`${name}: a change that changes nothing is not one`)
      // The chain: each change starts where the previous one left the row.
      if (!sameDueBy(from, prev))
        throw new ValidationError(
          `${name}.from does not match the deadline the previous entry left ` +
            `(${prev ? prev.dueBy : 'none'})`,
        )
      assertString(o.reason, `${name}.reason`, PROMISE_REASON_MIN, 1000)
      assertString(o.editor, `${name}.editor`, 2, 80)
      // Setting a deadline signs a claim about a named party: a person. Clearing
      // one withdraws a claim: anything but the hole of an unfilled command.
      const firma = to ? rechazoDeFirma(o.editor) : rechazoDeMarcador(o.editor)
      if (firma) throw new ValidationError(`${name}.editor: ${firma}`)
      assertIsoDate(o.changedAt, `${name}.changedAt`)
      log.push({ from, to, reason: o.reason, editor: o.editor, changedAt: o.changedAt })
      prev = pairOf(to)
    }
  }
  // The published deadline is the one the last signed change left — or none.
  const signed = log.length ? pairOf(log[log.length - 1].to) : null
  if (!sameDueBy(live, signed))
    throw new ValidationError(
      `${where}.dueBy does not match its dueByLog: every deadline is set by a signed change ` +
        `(npm run corregir-promesa -- plazo), and the last one must be the one published`,
    )
  return { live, log }
}

function validateCorrection(c: unknown, name: string): PromiseCorrection {
  if (!c || typeof c !== 'object') throw new ValidationError(`${name} must be object`)
  const r = c as Record<string, unknown>
  assertEnum(r.field, PROMISE_CORRECTION_FIELDS, `${name}.field`)
  assertString(r.original, `${name}.original`, 1, 1500)
  assertString(r.corrected, `${name}.corrected`, 1, 1500)
  if (r.original === r.corrected)
    throw new ValidationError(`${name}: a correction that changes nothing is not one`)
  assertString(r.reason, `${name}.reason`, PROMISE_REASON_MIN, 1000)
  assertString(r.editor, `${name}.editor`, 2, 80)
  assertIsoDate(r.correctedAt, `${name}.correctedAt`)
  return {
    field: r.field as PromiseCorrectionField,
    original: r.original as string,
    corrected: r.corrected as string,
    reason: r.reason as string,
    editor: r.editor as string,
    correctedAt: r.correctedAt as string,
  }
}

function validateRetraction(t: unknown, idx: number): PromiseRetraction {
  const name = `retractions[${idx}]`
  if (!t || typeof t !== 'object') throw new ValidationError(`${name} must be object`)
  const r = t as Record<string, unknown>
  assertString(r.promiseId, `${name}.promiseId`, 3, 80)
  assertEnum(r.party, ALLOWED_PARTIES, `${name}.party`)
  if (typeof r.digest !== 'string' || !PROMISE_DIGEST_RE.test(r.digest))
    throw new ValidationError(`${name}.digest must match «promesa · sha256:<12 hex>»`)
  assertString(r.reason, `${name}.reason`, PROMISE_REASON_MIN, 1000)
  assertString(r.editor, `${name}.editor`, 2, 80)
  assertIsoDate(r.retractedAt, `${name}.retractedAt`)
  return {
    promiseId: r.promiseId as string,
    party: r.party as Party,
    digest: r.digest as string,
    reason: r.reason as string,
    editor: r.editor as string,
    retractedAt: r.retractedAt as string,
  }
}

export function validatePromisesSnapshot(json: string): PromisesSnapshot {
  const raw = JSON.parse(json) as Record<string, unknown>
  assertString(raw.version, 'version')
  assertIsoDate(raw.generatedAt, 'generatedAt')
  if (raw.frozenUntil !== null) assertIsoDate(raw.frozenUntil, 'frozenUntil')
  assertString(raw.legalNotice, 'legalNotice', 80, 2000)
  if (FUENTE_PRIMARIA.test(raw.legalNotice as string)) {
    throw new ValidationError(
      'legalNotice no puede llamar «primarias» a sus fuentes: source.url admite la noticia de ' +
        'prensa que recoge una cita, y un lector entiende por «primaria» el documento original. ' +
        'Di lo que el esquema comprueba: «su fuente enlazada: el documento oficial o la noticia ' +
        'que recoge la cita».',
    )
  }
  assertUrl(raw.contactUrl, 'contactUrl')
  // methodologyUrl can be internal ("/metodologia") or absolute; accept both.
  if (typeof raw.methodologyUrl !== 'string' || raw.methodologyUrl.length < 2) {
    throw new ValidationError('methodologyUrl must be a non-empty string')
  }
  if (!Array.isArray(raw.items)) throw new ValidationError('items must be array')
  const items = (raw.items as unknown[]).map((p, i) => validatePromise(p, i))
  // Unique id check.
  const ids = new Set<string>()
  for (const p of items) {
    if (ids.has(p.id)) throw new ValidationError(`duplicate id "${p.id}"`)
    ids.add(p.id)
  }
  let retractions: PromiseRetraction[] | undefined
  if (raw.retractions !== undefined) {
    if (!Array.isArray(raw.retractions)) throw new ValidationError('retractions must be array')
    retractions = (raw.retractions as unknown[]).map((t, i) => validateRetraction(t, i))
    const retiradas = new Set<string>()
    for (const t of retractions) {
      // A withdrawn id is never reused: the way back is a new promise with a
      // new id and its own source, not a flag flipped back.
      if (ids.has(t.promiseId))
        throw new ValidationError(`retracted id "${t.promiseId}" is still published`)
      if (retiradas.has(t.promiseId))
        throw new ValidationError(`retracted id "${t.promiseId}" appears twice`)
      retiradas.add(t.promiseId)
    }
  }
  return {
    version: raw.version as string,
    generatedAt: raw.generatedAt as string,
    frozenUntil: raw.frozenUntil as string | null,
    legalNotice: raw.legalNotice as string,
    contactUrl: raw.contactUrl as string,
    methodologyUrl: raw.methodologyUrl as string,
    items,
    ...(retractions?.length ? { retractions } : {}),
  }
}

/**
 * `raw` with its editorial notice replaced: the pure half of
 * `npm run aviso-promesas`, the one owner of `legalNotice`.
 *
 * Re-serialised from the file as read, not from `validatePromisesSnapshot`'s
 * normalised copy, which would add `response: null` to every row without one
 * and bury the change in a diff nobody reads. `generatedAt` moves with it,
 * because `check:stamps` reds a content change whose stamp stayed put. The
 * whole result is validated before it is returned, so a notice that breaks a
 * rule — or a file that was already broken — never reaches disk.
 */
export function withLegalNotice(raw: string, notice: string, now: Date = new Date()): string {
  const snap = JSON.parse(raw) as Record<string, unknown>
  const next = { ...snap, generatedAt: now.toISOString(), legalNotice: notice.trim() }
  const json = JSON.stringify(next, null, 2) + '\n'
  validatePromisesSnapshot(json)
  return json
}

export function isFrozen(snap: Pick<PromisesSnapshot, 'frozenUntil'>, now = new Date()): boolean {
  if (!snap.frozenUntil) return false
  const until = new Date(snap.frozenUntil)
  return now < until
}
