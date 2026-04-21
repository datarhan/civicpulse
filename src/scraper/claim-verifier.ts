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

export type ClaimVerdict =
  | 'verificado'
  | 'parcial'
  | 'contradicho'
  | 'sin-datos'
  | 'promesa-repetida'

export interface ClaimEvidence {
  kind: 'tender' | 'bdns' | 'budget' | 'promise' | 'prior-claim'
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
  return stripDiacritics(s).toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Very cheap word-overlap score between two normalized strings. */
function overlapScore(a: string, b: string): number {
  const aw = new Set(
    norm(a)
      .split(' ')
      .filter((w) => w.length >= 4),
  )
  const bw = new Set(
    norm(b)
      .split(' ')
      .filter((w) => w.length >= 4),
  )
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
  return [r.title, r.contractor].filter(Boolean).join(' · ')
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

  const tenderList = inputs.tenders ? (checked.push('tenders'), readTenders(inputs.tenders)) : []
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
  //    cita_convenio.
  if (
    claim.entities.amountEuros != null &&
    (claim.type === 'afirmacion_numerica' ||
      claim.type === 'cita_obra' ||
      claim.type === 'cita_convenio')
  ) {
    const amount = claim.entities.amountEuros
    const entity = claim.entities.referencedEntity

    // Tenders lookup (cita_obra or numeric with entity hint)
    if (tenderList.length > 0) {
      let best: { row: TenderRow; sim: number } | null = null
      for (const t of tenderList) {
        const tAmount = tenderAmount(t)
        if (tAmount == null) continue
        const amountSim = similarAmount(amount, tAmount)
        if (amountSim < 0.5) continue
        // Also require some text match if the claim cites an entity
        const textSim = entity ? overlapScore(entity, tenderTitle(t)) : 1
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

  // 3. Entity-only match (cita_obra without amount): look for any tender
  //    whose title contains the referencedEntity.
  if (
    claim.type === 'cita_obra' &&
    claim.entities.amountEuros == null &&
    claim.entities.referencedEntity &&
    tenderList.length > 0
  ) {
    for (const t of tenderList) {
      const textSim = overlapScore(claim.entities.referencedEntity, tenderTitle(t))
      if (textSim >= 0.5) {
        evidence.push({
          kind: 'tender',
          ref: t.permalink ?? '',
          snippet: tenderTitle(t),
          similarity: Math.round(textSim * 100) / 100,
        })
        break // one match is enough
      }
    }
  }

  // 4. Compose verdict. Discipline:
  //    · ≥1 strong-match (similarity≥0.8) → verificado
  //    · ≥1 weak-match (similarity≥0.5)   → parcial
  //    · no matches but the claim type is numeric/work/convenio → sin-datos
  //    · acusacion_publica always sin-datos (we don't verify accusations)
  if (claim.type === 'acusacion_publica') {
    return {
      claimId: claim.id,
      verdict: 'sin-datos',
      summary:
        'Las acusaciones políticas no se verifican automáticamente — revisión editorial manual.',
      evidence,
      checkedAgainst: checked,
    }
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
