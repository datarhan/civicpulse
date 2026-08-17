/**
 * Cross-reference verifier for pleno claims.
 *
 * Given a PlenoClaim + all dataset snapshots, emit a verdict + citations.
 * Pure function, no fetch, no LLM — this is the deterministic "fact check"
 * layer that takes whatever the LLM extracted and checks it against the
 * paper trail (tenders, BDNS grants, budget chapters, existing promises,
 * prior-year plenos).
 *
 * Verdict discipline — no fabrication, no "probably":
 *
 *   · verificado       — found strong corroborating evidence in a dataset
 *                        (e.g. a tender whose awarded amount matches within
 *                        5% of the claim, or a promise whose verbatim is
 *                        already published with source URL)
 *   · parcial          — found partial overlap (e.g. a tender for the same
 *                        referencedEntity but at a different amount, or a
 *                        BDNS grant for the same topic but smaller amount)
 *   · contradicho      — dataset shows the claim is incompatible (e.g.
 *                        claimed "finished" but the tender is still open)
 *   · sin-datos        — no matching record anywhere — the claim may be
 *                        true but the municipal open data doesn't attest it
 *   · promesa-repetida — matched to an existing promesa in promises.json
 *                        with the same speaker group + topic + quote stem
 *                        (flag for editorial follow-up: "they said this
 *                        already in year X")
 *
 * Every verdict carries an `evidence[]` array of {kind, ref, snippet} so
 * the UI can render the citations that produced the verdict.
 */

import { stripSimilarityAnnotation } from '../llm/candidate-annotation'
import { stripDiacritics } from './normalize'
import type { PlenoClaim, ClaimTopic } from './pleno-claim'

// ─── Completion signal keywords ─────────────────────────────────────────────
// A cita_obra whose verbatim asserts the work is finished/done/completed,
// when the matching tender is still open/pending/planned, is a contradicho.
const COMPLETION_PATTERNS = [
  /\btermin(ad[oa]|aron|amos|ada s)\b/i,
  /\bfinaliz(ad[oa]|aron|amos)\b/i,
  /\bcompletad[oa]\b/i,
  /\bconcluid[oa]\b/i,
  /\becha[da]?\s+(y[a]?\s+)?hecha?\b/i,
  /\binaugurad[oa]\b/i,
  /\babierta\s+al\s+p[uú]blico\b/i,
  /\bentregad[oa]\b/i,
  /\bestá\s+funcionando\b/i,
  /\ben\s+funcionamiento\b/i,
  /\boperativ[oa]\b/i,
  /\b(puest[oa]\s+)?en\s+servicio\b/i,
  /\bpuest[oa]\s+en\s+marcha\b/i,
]

// Negation cues that flip a completion verb: "no está terminada", "aún no se
// ha finalizado", "sin terminar". When one appears just BEFORE the completion
// match we must NOT treat the line as a completion claim — otherwise we'd emit
// a FALSE contradicho against a speaker who said the work is NOT done, which is
// both an accuracy bug and a libel risk. Errs toward NOT flagging (libel-safe).
const NEGATION_CUE = /\b(no|ni|sin|tampoco|nunca|jam[áa]s)\b/i

/**
 * True when the verbatim asserts the work is finished/done — negation-aware.
 * For each completion verb that matches, we reject the match if a negation cue
 * sits within the ~30 characters immediately preceding it.
 */
export function claimsCompletion(verbatim: string): boolean {
  for (const rx of COMPLETION_PATTERNS) {
    const m = rx.exec(verbatim)
    if (!m) continue
    const before = verbatim.slice(Math.max(0, m.index - 30), m.index)
    if (NEGATION_CUE.test(before)) continue // negated → not a completion claim
    return true
  }
  return false
}

const TENDER_NOT_DONE_STATUSES = new Set([
  'open',
  'pending',
  'planning',
  'in_planning',
  'published',
  'abierta',
  'licitación',
  'pendiente',
  'en tramitación',
  'en curso',
])

export type ClaimVerdict =
  | 'verificado'
  | 'parcial'
  | 'contradicho'
  | 'sin-datos'
  | 'promesa-repetida'

/**
 * What this verifier established about a document RELATIVE to the claim.
 *
 * There are two members, not three, and the missing one is the point. No path
 * in this file establishes that a document *supports* a sentence: every
 * "match" here is a lexical or arithmetic coincidence between a euro figure or
 * an entity name and a contract title. Measured on the published snapshot
 * (6.359 claims), the five refs carrying the strongest possible signal —
 * verdict `verificado` with `similarity ≥ 0.8` — include «Vox dice que no, que
 * no» matched at 1.0 to the *electronic voting system* tender, and «el
 * fatídico día 29 de octubre de 2024» matched at 1.0 to a debris-clearing
 * contract. Four of those five support nothing. A `corroborates` member would
 * have carried all five.
 *
 * So:
 *   · 'contradicts' — the verifier made a directional, reasoned finding that
 *     the record is incompatible with the claim (the two `contradicho` return
 *     paths below, or an LLM citation flagged `isContradiction`).
 *   · 'checked'     — the document was cross-referenced and surfaced. Nothing
 *     more is asserted. Whether it corroborates is an editorial judgement no
 *     deterministic matcher in this repo makes.
 *
 * Absent ⇒ `'checked'`. Every consumer must treat an unset stance as the
 * weakest reading; a missing field may never be upgraded into a verdict.
 */
export type EvidenceStance = 'contradicts' | 'checked'

export const EVIDENCE_STANCES: readonly EvidenceStance[] = ['contradicts', 'checked']

export interface ClaimEvidence {
  kind: 'tender' | 'bdns' | 'budget' | 'promise' | 'prior-claim' | 'factcheck' | 'boe'
  /** URL or synthetic ref for the curator to click through. */
  ref: string
  /** One-line citation showing what matched. */
  snippet: string
  /** Numeric similarity for amount-based matches (0..1). */
  similarity?: number
  /**
   * Set at the point of emission by the verifiers that feed pleno findings
   * (this file, claim-verifier-llm, claim-verifier-engine). Optional because
   * snapshots written before 2026-08 carry none, and because inventing a
   * stance for a row nobody classified is the defect this field exists to
   * stop. Read it through `evidenceStance()`, never directly.
   */
  stance?: EvidenceStance
}

/**
 * The ONE reader for `stance`. Whitelists the enum rather than defaulting with
 * `??`, so a snapshot from disk carrying a stale or garbage value degrades to
 * `'checked'` instead of being trusted.
 */
export function evidenceStance(ev: { stance?: string } | null | undefined): EvidenceStance {
  return ev?.stance === 'contradicts' ? 'contradicts' : 'checked'
}

/** The `snippet` cap both finding schemas enforce, and the room an ellipsis needs. */
const PUBLISHED_SNIPPET_MAX = 240
const PUBLISHED_SNIPPET_BODY = PUBLISHED_SNIPPET_MAX - 3

/**
 * Turn a `ClaimEvidence.snippet` into the label a reader sees under
 * «Documentos cotejados».
 *
 * The one door from the verifier's evidence to a published `FindingRef`. It
 * existed three times — `auto-curate.composeFinding`, `promote-claim
 * .evidenceToRefs`, `press-auto-curate` — as the same truncation written out
 * by hand, and the press copy had already drifted to a hard `slice(0, 240)`
 * that cuts mid-word with no marker.
 *
 * Two jobs, and the first is the reason it is a function:
 *
 *  1. Drop the prompt's similarity annotation. A snippet on this path is
 *     whatever the model handed back, and models hand back the rendered
 *     candidate line, tail included — see candidate-annotation.ts. Doing it
 *     here means the score is gone before anything reaches a curated file,
 *     whichever of the three paths a finding came through.
 *  2. Fit the schema's 240-char cap, marking the cut so the reader can tell a
 *     truncated title from a short one.
 *
 * Not a sanitiser in any broader sense: it does not judge whether the snippet
 * supports anything, and nothing here decides what belongs in `crossChecked[]`.
 */
export function toPublishedSnippet(raw: string): string {
  const stripped = stripSimilarityAnnotation(raw)
  return stripped.length > PUBLISHED_SNIPPET_MAX
    ? stripped.slice(0, PUBLISHED_SNIPPET_BODY).trimEnd() + '…'
    : stripped
}

export interface ClaimVerification {
  claimId: string
  verdict: ClaimVerdict
  /** One-sentence explanation of why this verdict. */
  summary: string
  evidence: ClaimEvidence[]
  /** Datasets that were queried for audit. */
  checkedAgainst: string[]
  /**
   * Set by the LLM second pass when it has fully evaluated this sin-datos
   * claim without upgrading it (empty shortlist, or LLM kept it sin-datos).
   * Lets a re-run resume — skipping claims already attempted — instead of
   * re-issuing the expensive LLM call. Not set on a transient LLM failure,
   * so those retry on the next run.
   */
  llmAttempted?: boolean
  /**
   * Support confidence in [0,1] from the NLI grounding pass (best entailment
   * probability). A real number — unlike the LLM second pass, which parsed a
   * confidence then dropped it (audit R1).
   */
  confidence?: number
  /**
   * Set by the NLI grounding pass once it has evaluated this sin-datos claim,
   * so a re-run resumes instead of re-scoring. Mirrors `llmAttempted`.
   */
  nliAttempted?: boolean
}

export interface VerifierInputs {
  claim: PlenoClaim
  tenders?: unknown
  /**
   * Optional EU TED (Tenders Electronic Daily) snapshot. Merged with
   * `tenders` before the amount-based cross-reference so EU-threshold
   * contracts (DANA recovery, NextGenerationEU, supplies >€143k) also
   * become matchable. Same projected row shape — see
   * `src/scraper/tenders-ted.ts:asTenderRow`.
   */
  tendersTed?: unknown
  bdns?: unknown
  budget?: unknown
  promises?: unknown
  /** Other claims from prior plenos — for promesa-repetida detection. */
  priorClaims?: PlenoClaim[]
}

// ─── Dataset row shapes (narrow — only fields we actually read) ─────────────

interface TenderRow {
  permalink?: string
  title?: string
  contractor?: string
  award_amount_eur?: number
  awarded_amount?: number
  amount?: number
  status?: string
  date?: string
}

interface BdnsRow {
  convocatoriaId?: string
  titulo?: string
  organo?: string
  importe?: number
  amount?: number
  fechaInicio?: string
  fecha?: string
  url?: string
}

interface BudgetChapter {
  code?: string
  name?: string
  amount?: number
}

interface BudgetSnapshot {
  snapshot?: {
    year?: number
    totalExpense?: number
    totalRevenue?: number
    expenseByEconomicChapter?: BudgetChapter[]
    expenseByProgram?: BudgetChapter[]
  }
}

interface PromiseRow {
  id?: string
  party?: string
  title?: string
  quote?: string
  topic?: string
  madeAt?: string
  status?: string
  source?: { url?: string; publisher?: string }
}

// ─── Text helpers ──────────────────────────────────────────────────────────

function norm(s: string | undefined | null): string {
  if (!s) return ''
  // Hyphens, slashes, periods, etc. are word boundaries for our overlap
  // score (so "post-DANA" tokenizes to {post, dana}, matching "DANA" in
  // the verbatim). Preserves letters, numbers, spaces, and ñ.
  return stripDiacritics(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Stopwords for overlapScore — tokens that appear in the municipality's name
 * or in generic municipal-contract boilerplate so they inflate every score
 * against every tender. Dropping these forces matches to rely on genuinely
 * project-specific tokens.
 */
const STOPWORDS = new Set([
  // Place + project boilerplate (es)
  'riba',
  'roja',
  'rivaroja',
  'turia',
  'ayuntamiento',
  'municipal',
  'municipio',
  'servicio',
  'servicios',
  'contrato',
  'obras',
  'obra',
  'proyecto',
  'proyectos',
  'plan',
  'ejecucion',
  // Debate / press-quote verbs (es) — these inflate every score against
  // every tender title because the press uses them constantly.
  'presenta',
  'solicita',
  'demanda',
  'insta',
  'anuncia',
  'comparece',
  'aprueba',
  'rechaza',
  'comunica',
  'destaca',
  // Same set, Valencian variants — the lab consumes both languages.
  'presentar',
  'sollicita',
  'sol·licita',
  'demana',
  'comuneca',
])

/** Very cheap word-overlap score between two normalized strings. */
function overlapScore(a: string, b: string): number {
  const filt = (t: string) => t.length >= 4 && !STOPWORDS.has(t)
  const aw = new Set(norm(a).split(' ').filter(filt))
  const bw = new Set(norm(b).split(' ').filter(filt))
  if (aw.size === 0 || bw.size === 0) return 0
  let hit = 0
  for (const w of aw) if (bw.has(w)) hit += 1
  return hit / Math.min(aw.size, bw.size)
}

/**
 * Solapamiento MUTUO de tokens distintivos — Jaccard más el recuento
 * compartido. Es la regla que `tenderCouldRefute` escribió para las
 * acusaciones y que la CORROBORACIÓN no aplicaba: el 17-08-2026 dos
 * `parcial` publicados tenían por única evidencia otro expediente (un
 * renting con «opción a compra» corroborando una compra de contenedores;
 * el software policial anclando una cita sobre la concesión del agua),
 * ambos producidos por `overlapScore`, que divide por el lado corto y deja
 * que dos palabras genéricas saturen el umbral.
 */
function solapamientoMutuo(
  a: string,
  b: string,
): { compartidas: number; jaccard: number; entera: boolean } {
  const filt = (t: string) => t.length >= 4 && !STOPWORDS.has(t)
  const aw = new Set(norm(a).split(' ').filter(filt))
  const bw = new Set(norm(b).split(' ').filter(filt))
  let compartidas = 0
  for (const w of aw) if (bw.has(w)) compartidas += 1
  const union = new Set([...aw, ...bw]).size
  return {
    compartidas,
    jaccard: union === 0 ? 0 : compartidas / union,
    // La entidad ENTERA (≥2 tokens distintivos, todos presentes) dentro de un
    // título largo no es la trampa de las palabras genéricas: es el objeto.
    // Sin esta salida, «reconstrucción dana» contra «Reconstrucción post-DANA
    // fase preliminar» puntuaría 0,4 por el mero largo del título.
    entera: aw.size >= 2 && compartidas === aw.size,
    // Cuántos tokens distintivos le quedan a la entidad tras el filtro. En este
    // corpus los nombres del propio municipio son stopwords, así que «Alcaldía
    // del Ayuntamiento de Riba-roja» queda en UN token: la rama de importes lo
    // necesita para su excepción de cita exacta.
    tokensEntidad: aw.size,
  }
}

/** Cuánto se parece el OBJETO citado al del expediente, con la regla mutua. */
function puntuacionObjeto(m: { compartidas: number; jaccard: number; entera: boolean }): number {
  if (m.compartidas < 2) return 0
  return m.entera ? 1 : m.jaccard
}

/**
 * Is this tender plausibly THE thing the claim is talking about?
 *
 * Used only for the `contradicho` path — the verdict that says "a councillor
 * stated something the municipal record refutes". Corroboration keeps the
 * looser `overlapScore`, because a weak name match that AGREES on the amount is
 * self-limiting; a weak name match that DISAGREES is an accusation.
 *
 * `overlapScore` divides by `min(|entity|, |title|)`, so a single-token entity
 * appearing anywhere in a long contract title scores a perfect 1.0. That is how
 * all 49 contradicho verdicts on this corpus were produced, every one of them
 * wrong:
 *
 *   · a councillor quoting residential rents (€640-880/month, entity
 *     "alquiler") was refuted by a contract to rent a REFUSE TRUCK;
 *   · «la Generalitat tiene un deute viu de 63.000 millones» was refuted by a
 *     €32.591 extension of a local park named *parque Generalitat*;
 *   · «2.364 millones para la dana» was refuted by a rubble-clearing job.
 *
 * The pattern is always the same: a claim about REGIONAL or STATE money,
 * compared against a municipal contract that happens to share one common word.
 * Three requirements, all of which those failures miss:
 *
 *   1. the entity must be specific enough to name something (≥2 distinctive
 *      tokens), and ≥2 of them must appear in the title;
 *   2. the overlap must be mutual — Jaccard, not containment — so a short
 *      entity cannot ride a long title;
 *   3. the figure must be within municipal reach. A town whose largest
 *      contract ever is €55.7M cannot refute a €63.000M regional debt figure
 *      with any contract at all; the comparison is a category error, not
 *      evidence.
 */
function tenderCouldRefute(
  entity: string,
  title: string,
  amount: number,
  maxContract: number,
): boolean {
  const filt = (t: string) => t.length >= 4 && !STOPWORDS.has(t)
  const a = new Set(norm(entity).split(' ').filter(filt))
  const b = new Set(norm(title).split(' ').filter(filt))
  if (a.size < 2) return false
  let shared = 0
  for (const w of a) if (b.has(w)) shared += 1
  if (shared < 2) return false
  const union = new Set([...a, ...b]).size
  if (union === 0 || shared / union < 0.34) return false
  // Deliberately loose headroom over the largest contract we know of. The
  // mutual-overlap test above already rejects all 49 real failures on its own;
  // this exists for the case overlap CANNOT catch — a claim about a regional
  // PROGRAMME whose name appears verbatim in a municipal contract. «El Plan
  // Edificant movilizó 1.700 millones» versus a €486k energy-efficiency job at
  // one school shares "plan" and "edificant" mutually, but a single school
  // contract does not refute a regional programme's total. At 10× the largest
  // municipal contract (€55.7M → €557M) that figure is out by three orders,
  // while genuine municipal disparities stay comfortably inside.
  return amount <= maxContract * 10
}

function similarAmount(claimed: number, found: number): number {
  if (claimed <= 0 || found <= 0) return 0
  const ratio = Math.min(claimed, found) / Math.max(claimed, found)
  return Math.max(0, ratio * ratio) // quadratic so 0.9 → 0.81 (meaningful gap)
}

// ─── Dataset readers ────────────────────────────────────────────────────────

function readTenders(data: unknown): TenderRow[] {
  if (!data || typeof data !== 'object') return []
  const obj = data as { contracts?: TenderRow[]; tenders?: TenderRow[]; items?: TenderRow[] }
  return [...(obj.contracts ?? []), ...(obj.tenders ?? []), ...(obj.items ?? [])]
}

/**
 * The awarded/estimated figure for a tender row, sin IVA where available.
 *
 * The three names this used to read — `award_amount_eur`, `awarded_amount`,
 * `amount` — exist on ZERO of the 1,231 rows the scraper writes. Gobierto's
 * projection calls them `finalAmount` / `initialAmount` (plus the `NoTaxes`
 * variants), and TED rows carry `totalValueEur`. So `tenderAmount` returned
 * null for every row, the amount loop `continue`d on all of them, and the
 * entire tender cross-reference produced nothing — on the press side that
 * surfaced as a published "0% de verificación" next to named outlets, which
 * reads as a finding about the outlets rather than about our reader.
 */
function tenderAmount(r: TenderRow): number | null {
  const r2 = r as TenderRow & {
    finalAmountNoTaxes?: number
    initialAmountNoTaxes?: number
    finalAmount?: number
    initialAmount?: number
    totalValueEur?: number
  }
  const v =
    r2.finalAmountNoTaxes ??
    r2.initialAmountNoTaxes ??
    r2.finalAmount ??
    r2.initialAmount ??
    r2.totalValueEur ??
    r.award_amount_eur ??
    r.awarded_amount ??
    r.amount
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

function tenderTitle(r: TenderRow): string {
  // Concatenate every searchable text field. The PLACSP feed includes
  // contractor (awarded entity), assignee (concejalía / dept responsible)
  // and categoryTitle (CPV-style category) on top of `title`. Before
  // 2026-05, the matcher only saw `title · contractor`, which dropped
  // a lot of real matches where the press named the dept or the CPV
  // category but not the literal tender title.
  const r2 = r as TenderRow & { assignee?: string; categoryTitle?: string }
  return [r.title, r.contractor, r2.assignee, r2.categoryTitle].filter(Boolean).join(' · ')
}

function readBdns(data: unknown): BdnsRow[] {
  if (!data || typeof data !== 'object') return []
  const obj = data as { items?: BdnsRow[]; convocatorias?: BdnsRow[] }
  return obj.items ?? obj.convocatorias ?? []
}

/**
 * BDNS convocatorias in this snapshot carry NO amount: the scraper writes
 * {bdnsCode, date, description, direction, id, level1, level2, organ,
 * sourceUrl} and nothing else. `importe` and `amount` are absent on all 172
 * rows, so amount-based grant matching cannot work and never could. Kept for
 * the day the scraper starts capturing the figure; until then it honestly
 * returns null and the caller falls back to text matching.
 */
function bdnsAmount(r: BdnsRow): number | null {
  const v = r.importe ?? r.amount
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Searchable text for a grant row — `titulo`/`organo` are not its field names. */
function bdnsText(r: BdnsRow): string {
  const r2 = r as BdnsRow & { description?: string; organ?: string }
  return [r2.description, r2.organ, r.titulo, r.organo].filter(Boolean).join(' · ')
}

function readPromises(data: unknown): PromiseRow[] {
  if (!data || typeof data !== 'object') return []
  return ((data as { items?: PromiseRow[] }).items ?? []) as PromiseRow[]
}

// ─── Topic → budget chapter hint map ───────────────────────────────────────
// Used when the claim cites a large amount against a specific topic; we check
// the budget chapter totals for semantic alignment. Cheap heuristic — not a
// hard denial surface, just "does the magnitude make sense?"

const TOPIC_TO_BUDGET_HINTS: Record<ClaimTopic, string[]> = {
  fiscal: ['hacienda', 'deuda', 'finan'],
  vivienda: ['vivienda', 'habitat'],
  movilidad: ['transport', 'movilidad', 'vias', 'infraestr'],
  'medio-ambiente': ['medio ambien', 'sostenib', 'residuos'],
  social: ['servicios sociales', 'bienestar', 'social'],
  cultura: ['cultura', 'patrimonio'],
  seguridad: ['seguridad', 'policia'],
  empleo: ['empleo', 'fomento', 'promocion'],
  urbanismo: ['urbanism', 'ordenacion', 'obras'],
  salud: ['salud', 'sanitar'],
  transparencia: ['administrac', 'gobierno'],
  educacion: ['educacion', 'ensenanza', 'ensenanz'],
  other: [],
}

// ─── The verifier ──────────────────────────────────────────────────────────

export function verifyClaim(inputs: VerifierInputs): ClaimVerification {
  const { claim } = inputs
  const checked: string[] = []
  const evidence: ClaimEvidence[] = []

  // `checkedAgainst` is a claim about our own work — it appears in the
  // published snapshot and feeds the "artículos auditados" counters. It used to
  // be filled at READ time, so every row asserted that PLACSP, TED, BDNS, the
  // promise tracker and the budget had been consulted, when the loops that
  // consult them are gated on the claim carrying a euro figure (2 of 10 press
  // claims) or being a promesa (2 of 10). Record a source when its matcher
  // actually runs, not when its file happens to be loaded.
  const note = (source: string) => {
    if (!checked.includes(source)) checked.push(source)
  }
  const localTenders = inputs.tenders ? readTenders(inputs.tenders) : []
  // TED rows have the same projected shape (see tenders-ted.ts:asTenderRow);
  // merging here means the existing amount + entity-overlap paths fire for
  // both PLACSP and EU notices without further changes downstream.
  const tedTenders = inputs.tendersTed ? readTenders(inputs.tendersTed) : []
  const tenderList = [...localTenders, ...tedTenders]
  const bdnsList = inputs.bdns ? readBdns(inputs.bdns) : []
  const promiseList = inputs.promises ? readPromises(inputs.promises) : []

  // 1. Promesa-repetida detection (cheap first pass — pure string overlap
  //    plus topic + party equality).
  if (claim.type === 'promesa') {
    if (promiseList.length > 0) note('promises')
    for (const p of promiseList) {
      if (!p || !p.quote) continue
      if (p.party && claim.speakerGroup && p.party !== claim.speakerGroup) continue
      if (p.topic && p.topic !== claim.topic && claim.topic !== 'other') continue
      const score = overlapScore(p.quote, claim.verbatim)
      if (score >= 0.45) {
        evidence.push({
          kind: 'promise',
          ref: p.source?.url ?? `promise:${p.id}`,
          snippet: `«${String(p.quote).slice(0, 160)}» · promesa ${p.id} (${p.madeAt})`,
          similarity: Math.round(score * 100) / 100,
          // A previously-published promise with an overlapping quote says the
          // speaker said this before. It does not attest that what they said
          // is true, which is what a finding's prose is about.
          stance: 'checked',
        })
      }
    }
    if (evidence.some((e) => e.kind === 'promise' && (e.similarity ?? 0) >= 0.55)) {
      return {
        claimId: claim.id,
        verdict: 'promesa-repetida',
        summary:
          'La promesa coincide con una ya documentada en el tracker — posible repetición interanual.',
        evidence,
        checkedAgainst: checked,
      }
    }
  }

  // 2. Amount-based cross-reference for afirmacion_numerica, cita_obra,
  //    cita_convenio, and the verifiable subset of acusacion_publica
  //    (factual | contra-datos).
  const isVerifiableAccusation =
    claim.type === 'acusacion_publica' &&
    (claim.accusationSubtype === 'factual' || claim.accusationSubtype === 'contra-datos')
  if (
    claim.entities.amountEuros != null &&
    (claim.type === 'afirmacion_numerica' ||
      claim.type === 'cita_obra' ||
      claim.type === 'cita_convenio' ||
      isVerifiableAccusation)
  ) {
    const amount = claim.entities.amountEuros
    const entity = claim.entities.referencedEntity

    // Tenders lookup (cita_obra or numeric with entity hint)
    if (tenderList.length > 0) {
      if (localTenders.length > 0) note('tenders')
      if (tedTenders.length > 0) note('tenders-ted')
      let best: { row: TenderRow; sim: number } | null = null
      // Also look for strong-entity / weak-amount matches → potential contradicho
      let entityMatchMismatchedAmount: { row: TenderRow; textSim: number } | null = null
      // The ceiling for "could a municipal contract plausibly be about this
      // figure at all" — computed from the corpus so it tracks reality.
      let maxContract = 0
      for (const t of tenderList) {
        const a = tenderAmount(t)
        if (a != null && a > maxContract) maxContract = a
      }
      for (const t of tenderList) {
        const tAmount = tenderAmount(t)
        if (tAmount == null) continue
        // Corroborar exige el mismo objeto: el solapamiento cuenta sólo si es
        // mutuo y con ≥2 tokens distintivos compartidos. Sin entidad, cero —
        // el `: 1` de antes convertía cualquier importe parecido en
        // corroboración, y un 0,85 de similitud de importe NO es el objeto
        // (505 mil de contenedores contra el renting de 466.200 €). Con
        // textSim 0, el umbral combinado sólo lo salva un importe EXACTO.
        const m = entity ? solapamientoMutuo(entity, tenderTitle(t)) : null
        const amountSim = similarAmount(amount, tAmount)
        // Una entidad de UN solo token distintivo (los nombres del municipio
        // son stopwords aquí) contenida entera sólo corrobora con el importe
        // prácticamente EXACTO: así «Alcaldía…» + 940.520 € contra el anuncio
        // TED sigue verificándose, y «compra» suelto + un 0,85 de importe no.
        const entidadContenida =
          m !== null && m.tokensEntidad >= 1 && m.compartidas === m.tokensEntidad
        const textSim =
          m === null
            ? 0
            : entidadContenida && (m.tokensEntidad >= 2 || amountSim >= 0.98)
              ? 1
              : puntuacionObjeto(m)
        // contradicho-candidate: the entity names this contract AND the amount
        // cited is materially different (<0.3 sim ≈ 2× disparity)
        if (
          entity &&
          amountSim < 0.3 &&
          tenderCouldRefute(entity, tenderTitle(t), amount, maxContract)
        ) {
          if (
            entityMatchMismatchedAmount === null ||
            textSim > entityMatchMismatchedAmount.textSim
          ) {
            entityMatchMismatchedAmount = { row: t, textSim }
          }
        }
        if (amountSim < 0.5) continue
        const combined = amountSim * 0.6 + textSim * 0.4
        if (combined >= 0.6 && (best === null || combined > best.sim)) {
          best = { row: t, sim: combined }
        }
      }
      if (best) {
        evidence.push({
          kind: 'tender',
          ref: best.row.permalink ?? '',
          snippet: `${tenderTitle(best.row)} · ${Math.round(tenderAmount(best.row)!).toLocaleString(
            'es-ES',
          )} €`,
          similarity: Math.round(best.sim * 100) / 100,
          // `combined` blends amount and title overlap, so a 0.6 pass can come
          // from either side alone. A contract whose title happens to share
          // words with the claim has not corroborated it.
          stance: 'checked',
        })
      } else if (entityMatchMismatchedAmount) {
        // No strong (amount + entity) match, but an entity match with a
        // mismatched amount — that's a candidate contradiction.
        const t = entityMatchMismatchedAmount.row
        evidence.push({
          kind: 'tender',
          ref: t.permalink ?? '',
          snippet: `${tenderTitle(t)} · ${Math.round(tenderAmount(t)!).toLocaleString('es-ES')} € (no coincide con el importe citado)`,
          similarity: Math.round(entityMatchMismatchedAmount.textSim * 100) / 100,
          // The reason this branch returns `contradicho`: same entity, an
          // amount off by ≥2×. This ref IS the discrepancy.
          stance: 'contradicts',
        })
        return {
          claimId: claim.id,
          verdict: 'contradicho',
          summary:
            `La afirmación cita ${Math.round(amount).toLocaleString('es-ES')} € para «${entity}», ` +
            `pero el contrato más parecido en la BD municipal registra ${Math.round(tenderAmount(t)!).toLocaleString('es-ES')} €. ` +
            'Discrepancia material — revisión editorial.',
          evidence,
          checkedAgainst: checked,
        }
      }
    }

    // BDNS grants lookup
    if (bdnsList.length > 0) {
      note('bdns')
      let best: { row: BdnsRow; sim: number } | null = null
      for (const b of bdnsList) {
        const bAmount = bdnsAmount(b)
        const textSim = entity ? overlapScore(entity, bdnsText(b)) : 0
        // With no amount on the row, the name has to carry the whole match, so
        // the bar is higher than the blended amount+text score.
        const combined =
          bAmount == null ? textSim : similarAmount(amount, bAmount) * 0.6 + textSim * 0.4
        const floor = bAmount == null ? 0.75 : 0.6
        if (combined >= floor && (best === null || combined > best.sim)) {
          best = { row: b, sim: combined }
        }
      }
      if (best) {
        evidence.push({
          kind: 'bdns',
          ref: best.row.url ?? `bdns:${best.row.convocatoriaId ?? ''}`,
          snippet: (() => {
            const amt = bdnsAmount(best.row)
            const money =
              amt == null ? 'importe no publicado' : `${Math.round(amt).toLocaleString('es-ES')} €`
            return `${bdnsText(best.row).slice(0, 160)} · ${money}`
          })(),
          similarity: Math.round(best.sim * 100) / 100,
          // Same blend as the tender path, and rows with no published amount
          // are matched on the convocatoria title alone.
          stance: 'checked',
        })
      }
    }

    // Budget magnitude check (loose — just "is the amount plausible given
    // chapter totals?")
    const budget = (inputs.budget as BudgetSnapshot | undefined)?.snapshot
    if (budget && (budget.totalExpense ?? 0) > 0) {
      note('budget')
      const hints = TOPIC_TO_BUDGET_HINTS[claim.topic] ?? []
      const chapters = [
        ...(budget.expenseByProgram ?? []),
        ...(budget.expenseByEconomicChapter ?? []),
      ]
      const candidate = chapters.find((c) => hints.some((h) => norm(c.name).includes(h)))
      if (candidate && candidate.amount) {
        const sim = similarAmount(amount, candidate.amount)
        if (sim >= 0.5) {
          evidence.push({
            kind: 'budget',
            ref: `budget:${budget.year}:${candidate.code ?? candidate.name}`,
            snippet: `${candidate.name ?? candidate.code} · ${Math.round(
              candidate.amount,
            ).toLocaleString('es-ES')} €`,
            similarity: Math.round(sim * 100) / 100,
            // Explicitly a plausibility check ("is this figure the right order
            // of magnitude for the chapter?"). Plausible is not corroborated.
            stance: 'checked',
          })
        }
      }
    }
  }

  // 3. Entity-only match (cita_obra): look for any tender whose title
  //    contains the referencedEntity. Skip if section 2 already pushed
  //    a tender evidence row for this claim — otherwise we'd double-count.
  const alreadyHasTenderEvidence = evidence.some((e) => e.kind === 'tender')
  // Entity-only matching applies to:
  //   · cita_obra — speaker names a work / project
  //   · acusacion_publica with subtype='factual' or 'contra-datos' — speaker
  //     names a specific verifiable entity (tender, BDNS, contract). The
  //     amount-based block above runs first; this fills the gap when the
  //     accusation cites an entity but no euro figure.
  const eligibleForEntityMatch =
    claim.type === 'cita_obra' ||
    (claim.type === 'acusacion_publica' &&
      (claim.accusationSubtype === 'factual' || claim.accusationSubtype === 'contra-datos'))
  if (
    !alreadyHasTenderEvidence &&
    eligibleForEntityMatch &&
    claim.entities.referencedEntity &&
    tenderList.length > 0
  ) {
    // Did the speaker claim the work is COMPLETED? (negation-aware)
    const claimsCompleted = claimsCompletion(claim.verbatim)
    for (const t of tenderList) {
      // Mutuo, no contención: el suelo 0,50 de `overlapScore` lo saciaban
      // «contratación», «servicio» y «procedimiento» sobre cuatro campos
      // concatenados, y así una cita sobre la concesión del agua quedó
      // anclada al software de gestión policial. La regla es la misma que
      // `tenderCouldRefute` ya exige para acusar: ≥2 tokens distintivos
      // compartidos y Jaccard ≥ 0,34. El segundo paso LLM sigue detrás para
      // los falsos positivos que sobrevivan.
      const m = solapamientoMutuo(claim.entities.referencedEntity, tenderTitle(t))
      const textSim = puntuacionObjeto(m)
      if (textSim >= 0.34) {
        // Contradicho: speaker says "completed" but tender is open/pending.
        // Decided BEFORE the push so the ref carries its own stance rather
        // than the reader having to infer it from the enclosing verdict.
        const refutes = Boolean(
          claimsCompleted && t.status && TENDER_NOT_DONE_STATUSES.has(t.status.toLowerCase()),
        )
        evidence.push({
          kind: 'tender',
          ref: t.permalink ?? '',
          snippet: `${tenderTitle(t)} · estado: ${t.status ?? 'desconocido'}`,
          similarity: Math.round(textSim * 100) / 100,
          // Title overlap only — no amount, no semantics. This is the path
          // that matched a queue-management IT contract to a claim about
          // waiting times, so it is `checked` at every similarity value.
          stance: refutes ? 'contradicts' : 'checked',
        })
        if (refutes) {
          return {
            claimId: claim.id,
            verdict: 'contradicho',
            summary:
              `El discurso afirma que la obra «${claim.entities.referencedEntity}» está ` +
              `terminada, pero el contrato en la base municipal aún figura como «${t.status}». ` +
              'Revisión editorial antes de contrastar públicamente.',
            evidence,
            checkedAgainst: checked,
          }
        }
        break // one entity match is enough unless we already returned
      }
    }
  }

  // 4. Accusations — narrow auto-verification window.
  //
  //    · opinativa (character / intent / style) → sin-datos, ALWAYS. No
  //      amount of cross-referencing can settle "they never listen".
  //    · factual (cites a specific verifiable entity) → fall through to the
  //      normal strong/weak verdict logic below, using the evidence
  //      collected by the amount + entity lookups above.
  //    · contra-datos (claim directly contradicts a published record) → if
  //      we found a strong entity match but no amount match that IS the
  //      contradiction, and the branch above already returned. If nothing
  //      was found, we can't confirm the contradiction — fall through.
  //    · subtype missing → treat as opinativa (safe default).
  if (claim.type === 'acusacion_publica') {
    const subtype = claim.accusationSubtype ?? 'opinativa'
    if (subtype === 'opinativa') {
      return {
        claimId: claim.id,
        verdict: 'sin-datos',
        summary:
          'Acusación sobre carácter o estilo de gobierno — no se verifica automáticamente. ' +
          'Revisión editorial manual.',
        evidence,
        checkedAgainst: checked,
      }
    }
    // factual / contra-datos fall through to the strong/weak verdict below
  }

  const strong = evidence.some((e) => (e.similarity ?? 0) >= 0.8)
  const weak = evidence.some((e) => (e.similarity ?? 0) >= 0.5)

  if (strong) {
    return {
      claimId: claim.id,
      verdict: 'verificado',
      summary: 'Cita encontrada con coincidencia fuerte en los datos municipales.',
      evidence,
      checkedAgainst: checked,
    }
  }
  if (weak) {
    return {
      claimId: claim.id,
      verdict: 'parcial',
      summary: 'Coincidencia parcial: hay datos relacionados pero no idénticos al claim.',
      evidence,
      checkedAgainst: checked,
    }
  }
  return {
    claimId: claim.id,
    verdict: 'sin-datos',
    summary:
      'No se encontró registro en tenders / BDNS / presupuesto. El claim puede ser cierto pero no está atestiguado por los datos abiertos publicados.',
    evidence,
    checkedAgainst: checked,
  }
}

// ─── LLM second-pass: candidate shortlist ──────────────────────────────────
//
// The LLM verifier runs ONLY on claims the deterministic pass marked
// sin-datos. Its goal is to catch matches that the word-overlap matcher
// missed — semantic-but-not-lexical relations like "omisión interventora"
// against a tender labeled "fiscalización adversa". We give the LLM the
// top-K most plausibly-related records (by score, regardless of whether
// they passed the deterministic threshold) and let it reason.
//
// `kind` covers the four open-data sources; ref/snippet match the shape
// the LLM verifier returns. similarity is exposed so the LLM sees how
// confident our shortlist heuristic is.

export interface CandidateShortlist {
  kind: 'tender' | 'bdns' | 'promise'
  ref: string
  snippet: string
  similarity: number
}

/**
 * Build the top-K candidate list for an LLM verifier pass. Same scoring
 * mechanics the deterministic verifier uses internally, but we keep all
 * candidates above similarity ≥0.20 (vs the 0.65 deterministic threshold)
 * so semantic-but-not-lexical near-misses surface to the LLM.
 *
 * Returned list is sorted by similarity descending and capped at topK.
 */
export function shortlistCandidates(inputs: VerifierInputs, topK = 8): CandidateShortlist[] {
  const claim = inputs.claim
  const out: CandidateShortlist[] = []

  // Tenders
  for (const t of readTenders(inputs.tenders)) {
    const title = tenderTitle(t)
    if (!title) continue
    const textSim = overlapScore(claim.verbatim + ' ' + claim.context, title)
    if (textSim < 0.2) continue
    const amount = tenderAmount(t)
    let snippet = title
    if (amount && claim.entities.amountEuros) {
      const aSim = similarAmount(claim.entities.amountEuros, amount)
      snippet += ` · €${amount.toLocaleString('es-ES')}${aSim >= 0.85 ? ' (matches claim)' : aSim >= 0.5 ? ' (close to claim)' : ''}`
    } else if (amount) {
      snippet += ` · €${amount.toLocaleString('es-ES')}`
    }
    if (t.status) snippet += ` · ${t.status}`
    out.push({
      kind: 'tender',
      ref: t.permalink ?? `tender:${title.slice(0, 40)}`,
      snippet: snippet.slice(0, 230),
      similarity: Math.round(textSim * 100) / 100,
    })
  }

  // BDNS subsidies
  for (const b of readBdns(inputs.bdns)) {
    if (!b.titulo) continue
    const sim = overlapScore(claim.verbatim + ' ' + claim.context, b.titulo)
    if (sim < 0.2) continue
    const amount = bdnsAmount(b)
    out.push({
      kind: 'bdns',
      ref:
        b.url ?? (b.convocatoriaId ? `bdns:${b.convocatoriaId}` : `bdns:${b.titulo.slice(0, 40)}`),
      snippet:
        `${b.titulo}${amount ? ` · €${amount.toLocaleString('es-ES')}` : ''}${b.organo ? ` · ${b.organo}` : ''}`.slice(
          0,
          230,
        ),
      similarity: Math.round(sim * 100) / 100,
    })
  }

  // Promises (only relevant for promesa-type claims; skip otherwise to
  // avoid spurious shortlisting).
  if (claim.type === 'promesa') {
    for (const p of readPromises(inputs.promises)) {
      if (!p?.quote || !p.id) continue
      if (p.party && claim.speakerGroup && p.party !== claim.speakerGroup) continue
      const sim = overlapScore(p.quote, claim.verbatim)
      if (sim < 0.2) continue
      out.push({
        kind: 'promise',
        ref: p.source?.url ?? `promise:${p.id}`,
        snippet:
          `${p.party ?? ''} «${p.quote.slice(0, 140)}» · ${p.madeAt ?? ''}${p.status ? ` · status=${p.status}` : ''}`.slice(
            0,
            230,
          ),
        similarity: Math.round(sim * 100) / 100,
      })
    }
  }

  // Sort by similarity desc, take top K.
  out.sort((a, b) => b.similarity - a.similarity)
  return out.slice(0, topK)
}

// ─── Backend-aware dispatcher ───────────────────────────────────────────────
//
// The LLM verifier reads `getShortlist(inputs, topK)` instead of the sync
// `shortlistCandidates()`. The dispatcher honours the `VERIFIER_SHORTLIST`
// env var so a single switch reroutes the verifier to a semantic backend
// without touching the verifier itself. Defaults to hybrid (lexical ∪
// semantic, deduped by ref) — falls back to lexical with a stderr warning
// when the embed cache or OPENAI_API_KEY isn't available, so the upgrade
// is opportunistic and never blocks a verify run.

export type ShortlistMode = 'lexical' | 'semantic' | 'hybrid'

export interface ShortlistDispatcherOptions {
  /** Override env. Defaults to `process.env.VERIFIER_SHORTLIST`. */
  mode?: ShortlistMode
  /**
   * Path to the JSONL embedding cache. Defaults to
   * `.embed-cache/verifier-corpus.jsonl`. Ignored in `lexical` mode.
   */
  corpusPath?: string
  /**
   * A preloaded corpus. When provided, getShortlist skips the per-call
   * loadCorpus disk read+parse (audit B1) — the runner loads it once and
   * passes it in. Takes precedence over `corpusPath`.
   */
  corpus?: import('./semantic-shortlist').Corpus
}

/**
 * Async dispatcher used by the LLM verifier. Falls back to lexical
 * gracefully if the semantic backend is selected but its cache or API
 * key is unavailable — never crashes the verifier.
 */
export async function getShortlist(
  inputs: VerifierInputs,
  topK = 8,
  opts: ShortlistDispatcherOptions = {},
): Promise<CandidateShortlist[]> {
  const mode = (opts.mode ?? (process.env.VERIFIER_SHORTLIST as ShortlistMode) ?? 'hybrid') as
    | ShortlistMode
    | string
  if (mode === 'lexical' || (mode !== 'semantic' && mode !== 'hybrid')) {
    return shortlistCandidates(inputs, topK)
  }

  // Lazy-load the semantic helpers so the lexical-only path doesn't pay
  // the import cost (and doesn't require fetch/openai env at all).
  let semanticModule: typeof import('./semantic-shortlist')
  let embedModule: typeof import('./embed-client')
  try {
    semanticModule = await import('./semantic-shortlist')
    embedModule = await import('./embed-client')
  } catch (err) {
    process.stderr.write(
      `[verifier] semantic mode unavailable (${(err as Error).message}); using lexical\n`,
    )
    return shortlistCandidates(inputs, topK)
  }

  let corpus: import('./semantic-shortlist').Corpus
  if (opts.corpus) {
    corpus = opts.corpus // preloaded — skip the per-call disk read+parse (B1)
  } else {
    const corpusPath = opts.corpusPath ?? '.embed-cache/verifier-corpus.jsonl'
    try {
      corpus = semanticModule.loadCorpus(corpusPath)
    } catch (err) {
      process.stderr.write(
        `[verifier] semantic corpus missing (${(err as Error).message}); using lexical\n`,
      )
      return shortlistCandidates(inputs, topK)
    }
  }

  // Embed backend auto-detect: prefer EMBED_BACKEND if set, else whichever
  // key is present. Ollama requires no key (local server). Falls back to
  // lexical with a stderr warning when the chosen backend isn't usable —
  // never crashes the verifier.
  const embedBackend =
    (process.env.EMBED_BACKEND as 'openai' | 'gemini' | 'ollama' | undefined) ??
    (process.env.OPENAI_API_KEY ? 'openai' : process.env.GEMINI_API_KEY ? 'gemini' : null)
  const usable =
    embedBackend === 'ollama'
      ? true // reachability is checked at call time; on failure, embedTexts
      : // throws and we'd land in the catch below
        embedBackend === 'gemini'
        ? Boolean(process.env.GEMINI_API_KEY)
        : embedBackend === 'openai'
          ? Boolean(process.env.OPENAI_API_KEY)
          : false
  if (!embedBackend || !usable) {
    process.stderr.write(
      `[verifier] no embed key/backend (set OPENAI_API_KEY, GEMINI_API_KEY, or EMBED_BACKEND=ollama); semantic disabled, using lexical\n`,
    )
    return shortlistCandidates(inputs, topK)
  }

  // Pin the query backend to whatever BUILT this corpus, per its `.model`
  // sidecar. `EMBED_BACKEND` is ambient and has been wrong here: the corpus was
  // gemini/768 while an OPENAI_API_KEY in the env resolved to openai/1536, so
  // every cosine returned 0, every candidate fell under the floor, and the run
  // reported "no candidates" — identical to an empty corpus. The sidecar is the
  // only thing that knows the truth, and nothing read it. Fall back to ambient
  // resolution only when there is no sidecar.
  const { parseCorpusSidecar } = await import('./retrieval-health')
  const side = corpus.model ? parseCorpusSidecar(corpus.model) : {}
  const embedFn: import('./semantic-shortlist').EmbedFn = async (text) => {
    const opts: Record<string, unknown> = {}
    if (side.backend === 'openai' || side.backend === 'gemini' || side.backend === 'ollama')
      opts.backend = side.backend
    if (side.model) opts.model = side.model
    if (side.dim) opts.dim = side.dim
    const [v] = await embedModule.embedTexts([text], opts)
    return v
  }

  let semantic: CandidateShortlist[]
  try {
    semantic = await semanticModule.semanticShortlist(inputs.claim, corpus, embedFn, {
      topK: mode === 'hybrid' ? topK * 2 : topK,
    })
  } catch (err) {
    process.stderr.write(
      `[verifier] semantic shortlist failed (${(err as Error).message}); using lexical\n`,
    )
    return shortlistCandidates(inputs, topK)
  }

  if (mode === 'semantic') return semantic.slice(0, topK)

  // Hybrid: union with lexical, dedup by ref, take top K by similarity.
  const lexical = shortlistCandidates(inputs, topK * 2)
  return semanticModule.mergeShortlists([semantic, lexical], topK)
}
