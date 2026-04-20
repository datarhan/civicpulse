/**
 * Tender ↔ queja correlator.
 *
 * For each citizen complaint in quejas.json, surface the municipal contract
 * (if any) that plausibly addresses it. Emits suggestions to
 * public/data/tender-queja-correlations.json; `requiresHumanApproval: true`
 * on every record. UI must phrase matches as "posibles actuaciones
 * relacionadas" — causal language is a curator's call, not a machine's.
 *
 * Two signals feed the match:
 *   1. STRUCTURAL: if a plenos-agendas.json agenda item shares an expediente
 *      number with a tender in tenders.json AND the queja's subject matches
 *      that agenda item's department, we skip the LLM entirely and emit the
 *      correlation with confidence 0.95. This is ironclad — the municipal
 *      secretary has already linked the decision to the contract.
 *   2. FUZZY: CPV division match + date window (±18 months post-queja) +
 *      top-N shortlist ranked by text similarity, then LLM reranker picks
 *      at most one. Confidence in [0.6, 0.85] — we never claim certainty
 *      on a fuzzy match.
 */

import { callLLM, type CallLlmOptions } from '../llm/client'
import type { ZodTypeAny, z } from 'zod'
import { TenderQuejaResponseSchema, type TenderQuejaCorrelation } from '../llm/schemas'
import {
  TENDER_QUEJA_PROMPT_VERSION,
  buildTenderQuejaSystemPrompt,
  buildTenderQuejaUserPrompt,
  type TenderQuejaInput,
} from '../llm/prompts'
import { tenderMatchesQuejaCpv, cpvDivision, QUEJA_CATEGORY_TO_CPV } from '../llm/queja-to-cpv'
import { isFrozen, type PromisesSnapshot } from './promises'
import type { QuejaCategory } from './queja-router'

export interface TenderCandidate {
  permalink: string
  title: string
  contractor?: string
  assignee?: string
  awardDate?: string | null
  amount?: number | null
  categoryTitle?: string
  cpvs?: string[]
  id?: string
  expediente?: string
}

export interface PlenoAgendaItem {
  sessionId: string
  sessionLink: string
  sessionDate: string
  department?: string
  title: string
  expediente?: string | null
}

export interface QuejaForCorrelation {
  id: string
  category: QuejaCategory
  neighborhood: string | null
  description: string
  createdAt: string
}

export type LlmCaller = <TSchema extends ZodTypeAny>(opts: CallLlmOptions<TSchema>) => Promise<z.infer<TSchema> | null>

export interface CorrelateOptions {
  /** Shortlist window: accept tenders awarded between quejaDate and
   *  quejaDate + 18 months. Older contracts are probably pre-existing work. */
  maxMonthsAfter?: number
  /** Max fuzzy candidates passed to the LLM per queja. */
  shortlistTopN?: number
  /** LOREG freeze snapshot — same as used by promise inference. */
  snapshot?: Pick<PromisesSnapshot, 'frozenUntil'>
  /** Current time (testability hook). */
  now?: Date
  /** Min confidence emitted (both structural and LLM paths). */
  minConfidence?: number
}

export interface CorrelationResult {
  items: Array<TenderQuejaCorrelation & { via: 'expediente' | 'llm'; requiresHumanApproval: true }>
  stats: {
    frozen: boolean
    quejasScanned: number
    expedienteMatches: number
    fuzzyShortlistsConsidered: number
    llmCalls: number
    llmMatches: number
    llmRejectedHallucinated: number
    llmRejectedLowConfidence: number
  }
}

// ─── Structural matcher ─────────────────────────────────────────────────────

/** Build an index from expediente → tender for O(1) lookup. */
function indexTendersByExpediente(tenders: TenderCandidate[]): Map<string, TenderCandidate> {
  const idx = new Map<string, TenderCandidate>()
  for (const t of tenders) {
    if (t.expediente) idx.set(normaliseExp(t.expediente), t)
    if (t.id) {
      // Gobierto permalink ids sometimes include the expediente as a prefix.
      // Accept those as fallback keys.
      const prefix = t.id.match(/^[\w-]+\/\d{4}/)?.[0]
      if (prefix) idx.set(normaliseExp(prefix), t)
    }
  }
  return idx
}

function normaliseExp(s: string): string {
  return s.replace(/\s+/g, '').toUpperCase()
}

/** Apply the structural shortcut — returns the correlation when the queja's
 *  linked agenda item shares an expediente with a tender. */
function findStructuralMatch(
  queja: QuejaForCorrelation,
  agendaItems: PlenoAgendaItem[],
  tendersByExp: Map<string, TenderCandidate>,
): TenderCandidate | null {
  // We match on agenda items whose department textually contains the queja's
  // category. E.g., a queja about `limpieza` aligned with agenda item under
  // "LIMPIEZA VIARIA". This is a weak signal on its own but becomes strong
  // when it coincides with a shared expediente.
  for (const item of agendaItems) {
    if (!item.expediente) continue
    const t = tendersByExp.get(normaliseExp(item.expediente))
    if (!t) continue
    if (!item.department) continue
    const dept = item.department.toLowerCase()
    if (dept.includes(queja.category) || categoryAppearsInText(queja.category, dept)) {
      return t
    }
  }
  return null
}

function categoryAppearsInText(cat: QuejaCategory, text: string): boolean {
  // Lightweight synonym expansion. Deliberately narrow — structural match is
  // the PRIVILEGED path so we only accept on strong textual alignment.
  const syn: Partial<Record<QuejaCategory, string[]>> = {
    via_publica: ['via', 'viaria', 'calzada', 'pavimento', 'asfalt'],
    limpieza: ['limpieza', 'higiene'],
    zonas_verdes: ['verde', 'parque', 'jardin', 'arbol'],
    alumbrado: ['alumbrado', 'luminaria', 'iluminacion'],
    trafico: ['trafico', 'semafor', 'señal'],
    agua_saneamiento: ['agua', 'alcantaril', 'saneamiento'],
    residuos: ['residuo', 'basura', 'recogida'],
    urbanismo: ['urbanism', 'edificacion'],
  }
  const terms = syn[cat] ?? []
  return terms.some((t) => text.includes(t))
}

// ─── Fuzzy shortlist ────────────────────────────────────────────────────────

function withinDateWindow(
  quejaIso: string,
  awardIso: string | null | undefined,
  maxMonthsAfter: number,
): boolean {
  if (!awardIso) return false
  const q = new Date(quejaIso)
  const a = new Date(awardIso)
  if (Number.isNaN(q.getTime()) || Number.isNaN(a.getTime())) return false
  const diffMs = a.getTime() - q.getTime()
  if (diffMs < 0) return false
  const diffMonths = diffMs / (1000 * 60 * 60 * 24 * 30)
  return diffMonths <= maxMonthsAfter
}

function buildShortlist(
  queja: QuejaForCorrelation,
  tenders: TenderCandidate[],
  maxMonthsAfter: number,
  topN: number,
): TenderCandidate[] {
  const eligible = tenders.filter((t) => {
    if (!withinDateWindow(queja.createdAt, t.awardDate, maxMonthsAfter)) return false
    if (!tenderMatchesQuejaCpv(queja.category, t.cpvs)) return false
    return true
  })

  // Score by: CPV division priority (earlier in QUEJA_CATEGORY_TO_CPV = better)
  // + date-proximity (sooner after queja = better, capped at 1 year).
  const expected = QUEJA_CATEGORY_TO_CPV[queja.category] ?? ['79']
  const priority = new Map(expected.map((div, i) => [div, expected.length - i]))
  const qTime = new Date(queja.createdAt).getTime()

  const scored = eligible.map((t) => {
    const divs = (t.cpvs || []).map(cpvDivision).filter((d): d is string => d !== null)
    const cpvScore = Math.max(...divs.map((d) => priority.get(d) ?? 0), 0)
    const ageMonths = (new Date(t.awardDate || '1970-01-01').getTime() - qTime) / (1000 * 60 * 60 * 24 * 30)
    const dateScore = Math.max(0, 1 - Math.abs(ageMonths - 3) / 15) // peak at 3 months
    return { t, score: cpvScore + dateScore }
  })
  return scored.sort((a, b) => b.score - a.score).slice(0, topN).map((s) => s.t)
}

// ─── Entry point ────────────────────────────────────────────────────────────

export async function correlateQuejasToTenders(
  quejas: QuejaForCorrelation[],
  tenders: TenderCandidate[],
  agendaItems: PlenoAgendaItem[],
  opts: CorrelateOptions = {},
  caller: LlmCaller = callLLM,
): Promise<CorrelationResult> {
  const result: CorrelationResult = {
    items: [],
    stats: {
      frozen: false,
      quejasScanned: 0,
      expedienteMatches: 0,
      fuzzyShortlistsConsidered: 0,
      llmCalls: 0,
      llmMatches: 0,
      llmRejectedHallucinated: 0,
      llmRejectedLowConfidence: 0,
    },
  }

  if (opts.snapshot && isFrozen(opts.snapshot, opts.now)) {
    result.stats.frozen = true
    return result
  }

  const maxMonthsAfter = opts.maxMonthsAfter ?? 18
  const topN = opts.shortlistTopN ?? 6
  const minConfidence = opts.minConfidence ?? 0.6

  const tendersByExp = indexTendersByExpediente(tenders)
  const sys = buildTenderQuejaSystemPrompt()

  for (const queja of quejas) {
    result.stats.quejasScanned += 1

    // 1. Structural shortcut
    const structural = findStructuralMatch(queja, agendaItems, tendersByExp)
    if (structural) {
      result.stats.expedienteMatches += 1
      result.items.push({
        quejaId: queja.id,
        tenderPermalink: structural.permalink,
        confidence: 0.95,
        reasoning: `Expediente ${structural.expediente ?? structural.id} aparece tanto en agenda municipal como en la adjudicación del contrato "${structural.title}".`,
        via: 'expediente',
        requiresHumanApproval: true,
      })
      continue
    }

    // 2. Fuzzy shortlist + LLM reranker
    const shortlist = buildShortlist(queja, tenders, maxMonthsAfter, topN)
    if (shortlist.length === 0) continue
    result.stats.fuzzyShortlistsConsidered += 1

    const llmInput: TenderQuejaInput = {
      queja: {
        id: queja.id,
        category: queja.category,
        neighborhood: queja.neighborhood,
        description: queja.description,
        createdAt: queja.createdAt,
      },
      candidates: shortlist.map((t) => ({
        permalink: t.permalink,
        title: t.title,
        contractor: t.contractor,
        assignee: t.assignee,
        awardDate: t.awardDate ?? undefined,
        amount: t.amount ?? undefined,
        categoryTitle: t.categoryTitle,
      })),
    }

    result.stats.llmCalls += 1
    const response = await caller({
      systemPrompt: sys,
      userPrompt: buildTenderQuejaUserPrompt(llmInput),
      promptVersion: TENDER_QUEJA_PROMPT_VERSION,
      schema: TenderQuejaResponseSchema,
      input: { quejaId: queja.id, permalinks: shortlist.map((t) => t.permalink).sort() },
    })
    if (!response || !response.correlation) continue

    const correlation = response.correlation
    const allowed = new Set(shortlist.map((t) => t.permalink))
    if (!allowed.has(correlation.tenderPermalink)) {
      result.stats.llmRejectedHallucinated += 1
      continue
    }
    if (correlation.confidence < minConfidence) {
      result.stats.llmRejectedLowConfidence += 1
      continue
    }
    result.stats.llmMatches += 1
    result.items.push({ ...correlation, via: 'llm', requiresHumanApproval: true })
  }

  return result
}
