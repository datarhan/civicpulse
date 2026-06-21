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

export interface ClaimEvidence {
  kind: 'tender' | 'bdns' | 'budget' | 'promise' | 'prior-claim' | 'factcheck' | 'boe'
  /** URL or synthetic ref for the curator to click through. */
  ref: string
  /** One-line citation showing what matched. */
  snippet: string
  /** Numeric similarity for amount-based matches (0..1). */
  similarity?: number
}

export interface ClaimVerification {
  claimId: string
  verdict: ClaimVerdict
  /** One-sentence explanation of why this verdict. */
  summary: string
  evidence: ClaimEvidence[]
  /** Datasets that were queried for audit. */
  checkedAgainst: string[]
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

function tenderAmount(r: TenderRow): number | null {
  return r.award_amount_eur ?? r.awarded_amount ?? r.amount ?? null
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

function bdnsAmount(r: BdnsRow): number | null {
  return r.importe ?? r.amount ?? null
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

  const localTenders = inputs.tenders ? (checked.push('tenders'), readTenders(inputs.tenders)) : []
  // TED rows have the same projected shape (see tenders-ted.ts:asTenderRow);
  // merging here means the existing amount + entity-overlap paths fire for
  // both PLACSP and EU notices without further changes downstream.
  const tedTenders = inputs.tendersTed
    ? (checked.push('tenders-ted'), readTenders(inputs.tendersTed))
    : []
  const tenderList = [...localTenders, ...tedTenders]
  const bdnsList = inputs.bdns ? (checked.push('bdns'), readBdns(inputs.bdns)) : []
  const promiseList = inputs.promises
    ? (checked.push('promises'), readPromises(inputs.promises))
    : []
  if (inputs.budget) checked.push('budget')
  if (inputs.priorClaims?.length) checked.push('priorClaims')

  // 1. Promesa-repetida detection (cheap first pass — pure string overlap
  //    plus topic + party equality).
  if (claim.type === 'promesa') {
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
      let best: { row: TenderRow; sim: number } | null = null
      // Also look for strong-entity / weak-amount matches → potential contradicho
      let entityMatchMismatchedAmount: { row: TenderRow; textSim: number } | null = null
      for (const t of tenderList) {
        const tAmount = tenderAmount(t)
        if (tAmount == null) continue
        const textSim = entity ? overlapScore(entity, tenderTitle(t)) : 1
        const amountSim = similarAmount(amount, tAmount)
        // contradicho-candidate: the entity matches strongly but the amount
        // cited is materially different (<0.3 sim ≈ 2× disparity)
        if (entity && textSim >= 0.7 && amountSim < 0.3) {
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
      let best: { row: BdnsRow; sim: number } | null = null
      for (const b of bdnsList) {
        const bAmount = bdnsAmount(b)
        if (bAmount == null) continue
        const amountSim = similarAmount(amount, bAmount)
        if (amountSim < 0.5) continue
        const textSim = entity ? overlapScore(entity, String(b.titulo ?? '')) : 1
        const combined = amountSim * 0.6 + textSim * 0.4
        if (combined >= 0.6 && (best === null || combined > best.sim)) {
          best = { row: b, sim: combined }
        }
      }
      if (best) {
        evidence.push({
          kind: 'bdns',
          ref: best.row.url ?? `bdns:${best.row.convocatoriaId ?? ''}`,
          snippet: `${best.row.titulo ?? ''} · ${Math.round(bdnsAmount(best.row)!).toLocaleString(
            'es-ES',
          )} €`,
          similarity: Math.round(best.sim * 100) / 100,
        })
      }
    }

    // Budget magnitude check (loose — just "is the amount plausible given
    // chapter totals?")
    const budget = (inputs.budget as BudgetSnapshot | undefined)?.snapshot
    if (budget && (budget.totalExpense ?? 0) > 0) {
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
      const textSim = overlapScore(claim.entities.referencedEntity, tenderTitle(t))
      // 0.50 floor — lowered from 0.65 once tenderTitle was extended to
      // include contractor + assignee + categoryTitle (so a 50%-overlap
      // hit on 4 concatenated fields is meaningfully stricter than a
      // 50% hit on just `title`). The LLM second pass (claim-verifier-llm.ts)
      // catches false positives via cite-grounding; we lose precision
      // hardly any and gain a lot of recall on real municipal-work claims.
      if (textSim >= 0.5) {
        evidence.push({
          kind: 'tender',
          ref: t.permalink ?? '',
          snippet: `${tenderTitle(t)} · estado: ${t.status ?? 'desconocido'}`,
          similarity: Math.round(textSim * 100) / 100,
        })
        // Contradicho: speaker says "completed" but tender is open/pending.
        if (claimsCompleted && t.status && TENDER_NOT_DONE_STATUSES.has(t.status.toLowerCase())) {
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

  const corpusPath = opts.corpusPath ?? '.embed-cache/verifier-corpus.jsonl'
  let corpus: import('./semantic-shortlist').Corpus
  try {
    corpus = semanticModule.loadCorpus(corpusPath)
  } catch (err) {
    process.stderr.write(
      `[verifier] semantic corpus missing (${(err as Error).message}); using lexical\n`,
    )
    return shortlistCandidates(inputs, topK)
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

  const embedFn: import('./semantic-shortlist').EmbedFn = async (text) => {
    const [v] = await embedModule.embedTexts([text])
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
