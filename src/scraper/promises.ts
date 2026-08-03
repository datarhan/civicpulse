/**
 * Promise-tracker schema + validator.
 *
 * This file is the *legal contract* for CivicPulse's political-promise
 * tracker. Three invariants protect both the project and the people
 * named in the data:
 *
 *   1. Every promise carries a verbatim quote + primary-source URL +
 *      publisher + dated `madeAt`. No hearsay.
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

export const ALLOWED_PARTIES = ['PSOE', 'PP', 'VOX', 'Compromís', 'EU-Podem', 'Otro'] as const
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
  autoPublished?: AutoPublishedMeta | null
}

export interface PromisesSnapshot {
  version: string
  generatedAt: string
  frozenUntil: string | null // YYYY-MM-DD or null
  legalNotice: string
  contactUrl: string
  methodologyUrl: string
  items: Promise[]
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
      `${name} no puede citarse a sí mismo (${host}): una promesa necesita una fuente primaria ` +
        `de un tercero. Nuestros propios datos sirven para CONTRASTAR la afirmación, no para ` +
        `sostenerla — ver c66cf93.`,
    )
  }
}

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
  if (r.dueBy !== undefined && r.dueBy !== null) {
    assertIsoDate(r.dueBy, `items[${idx}].dueBy`)
  }
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
    ...(typeof r.dueBy === 'string' ? { dueBy: r.dueBy } : {}),
    ...(typeof r.departmentSlug === 'string' ? { departmentSlug: r.departmentSlug } : {}),
    autoPublished: (r.autoPublished as Promise['autoPublished']) ?? null,
  }
}

export function validatePromisesSnapshot(json: string): PromisesSnapshot {
  const raw = JSON.parse(json) as Record<string, unknown>
  assertString(raw.version, 'version')
  assertIsoDate(raw.generatedAt, 'generatedAt')
  if (raw.frozenUntil !== null) assertIsoDate(raw.frozenUntil, 'frozenUntil')
  assertString(raw.legalNotice, 'legalNotice', 80, 2000)
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
  return {
    version: raw.version as string,
    generatedAt: raw.generatedAt as string,
    frozenUntil: raw.frozenUntil as string | null,
    legalNotice: raw.legalNotice as string,
    contactUrl: raw.contactUrl as string,
    methodologyUrl: raw.methodologyUrl as string,
    items,
  }
}

export function isFrozen(snap: Pick<PromisesSnapshot, 'frozenUntil'>, now = new Date()): boolean {
  if (!snap.frozenUntil) return false
  const until = new Date(snap.frozenUntil)
  return now < until
}
