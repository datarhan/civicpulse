/**
 * Unit tests for the tender↔queja correlator. Covers both paths:
 *   - Structural (expediente shortcut): skips LLM entirely, emits high
 *     confidence.
 *   - Fuzzy (CPV+date shortlist + LLM rerank): date window, CPV filter,
 *     hallucination guard, confidence gate.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  correlateQuejasToTenders,
  type TenderCandidate,
  type PlenoAgendaItem,
  type QuejaForCorrelation,
} from '../../src/scraper/tender-queja-correlator'
import { mockCallLLM, resetMock, stubResponse } from './mockClient'
import {
  buildTenderQuejaSystemPrompt,
  buildTenderQuejaUserPrompt,
} from '../../src/llm/prompts'

beforeEach(() => resetMock())

const BASE_QUEJA: QuejaForCorrelation = {
  id: 'Q-ABC12301',
  category: 'via_publica',
  neighborhood: 'Centro',
  description: 'Bache profundo en la calle Major.',
  createdAt: '2026-01-15',
}

const BASE_TENDER: TenderCandidate = {
  permalink: 'https://contrataciondelestado.es/wps/portal/test-1',
  title: 'Reparación de pavimento en calzadas del casco urbano',
  contractor: 'Construcciones XYZ SL',
  assignee: 'Urbanismo',
  awardDate: '2026-04-01',
  amount: 180_000,
  categoryTitle: 'Obras',
  cpvs: ['45233141-9'],  // Road repair
  id: 'RR/2026/45',
  expediente: 'URB/2026/12',
}

describe('correlator · structural (expediente) match', () => {
  it('emits a 0.95-confidence correlation when expediente + department align', async () => {
    const agenda: PlenoAgendaItem[] = [
      {
        sessionId: 'pleno-ene-2026',
        sessionLink: 'https://ribarroja.es/plenos/enero-2026',
        sessionDate: '2026-01-28',
        department: 'URBANISMO · LIMPIEZA VIARIA',
        title: 'Aprobación expediente obras pavimentación',
        expediente: 'URB/2026/12',
      },
    ]
    const spy = vi.fn()
    const res = await correlateQuejasToTenders([BASE_QUEJA], [BASE_TENDER], agenda, {}, async (opts) => {
      spy(opts.userPrompt)
      return null
    })
    expect(res.items).toHaveLength(1)
    expect(res.items[0].via).toBe('expediente')
    expect(res.items[0].confidence).toBe(0.95)
    expect(spy).not.toHaveBeenCalled()  // LLM bypassed
  })

  it('rejects the structural match when department does not textually align with the queja category', async () => {
    const agenda: PlenoAgendaItem[] = [
      {
        sessionId: 'pleno-ene-2026',
        sessionLink: 'https://ribarroja.es/plenos/enero-2026',
        sessionDate: '2026-01-28',
        department: 'FIESTAS · CULTURA',  // wrong dept for via_publica
        title: 'Contrato de animación municipal',
        expediente: 'URB/2026/12',
      },
    ]
    // Stub the LLM so the fuzzy path returns null (it would otherwise run).
    const sys = buildTenderQuejaSystemPrompt()
    const input = await import('../../src/scraper/tender-queja-correlator')
    // We expect zero structural matches → fuzzy fallback activates.
    // The fuzzy shortlist for via_publica includes CPV 45, so BASE_TENDER qualifies.
    // Register an explicit null LLM response so the engine emits nothing.
    stubResponse(
      sys,
      buildTenderQuejaUserPrompt({
        queja: { id: BASE_QUEJA.id, category: BASE_QUEJA.category, neighborhood: BASE_QUEJA.neighborhood, description: BASE_QUEJA.description, createdAt: BASE_QUEJA.createdAt },
        candidates: [
          { permalink: BASE_TENDER.permalink, title: BASE_TENDER.title, contractor: BASE_TENDER.contractor, assignee: BASE_TENDER.assignee, awardDate: BASE_TENDER.awardDate ?? undefined, amount: BASE_TENDER.amount ?? undefined, categoryTitle: BASE_TENDER.categoryTitle },
        ],
      }),
      { correlation: null },
    )
    const res = await correlateQuejasToTenders([BASE_QUEJA], [BASE_TENDER], agenda, {}, mockCallLLM)
    expect(res.stats.expedienteMatches).toBe(0)
    expect(res.stats.llmCalls).toBe(1)
    expect(res.items).toHaveLength(0)
    void input
  })
})

describe('correlator · fuzzy LLM rerank path', () => {
  it('emits an LLM-flagged correlation when the model picks one', async () => {
    const sys = buildTenderQuejaSystemPrompt()
    const userPrompt = buildTenderQuejaUserPrompt({
      queja: { id: BASE_QUEJA.id, category: BASE_QUEJA.category, neighborhood: BASE_QUEJA.neighborhood, description: BASE_QUEJA.description, createdAt: BASE_QUEJA.createdAt },
      candidates: [
        { permalink: BASE_TENDER.permalink, title: BASE_TENDER.title, contractor: BASE_TENDER.contractor, assignee: BASE_TENDER.assignee, awardDate: BASE_TENDER.awardDate ?? undefined, amount: BASE_TENDER.amount ?? undefined, categoryTitle: BASE_TENDER.categoryTitle },
      ],
    })
    stubResponse(sys, userPrompt, {
      correlation: {
        quejaId: BASE_QUEJA.id,
        tenderPermalink: BASE_TENDER.permalink,
        confidence: 0.78,
        reasoning: 'El contrato cubre la reparación de pavimentos, podría abordar el bache reportado.',
      },
    })
    const res = await correlateQuejasToTenders([BASE_QUEJA], [BASE_TENDER], [], {}, mockCallLLM)
    expect(res.items).toHaveLength(1)
    expect(res.items[0].via).toBe('llm')
    expect(res.items[0].tenderPermalink).toBe(BASE_TENDER.permalink)
  })

  it('rejects LLM output pointing at a permalink not in the shortlist', async () => {
    const sys = buildTenderQuejaSystemPrompt()
    const userPrompt = buildTenderQuejaUserPrompt({
      queja: { id: BASE_QUEJA.id, category: BASE_QUEJA.category, neighborhood: BASE_QUEJA.neighborhood, description: BASE_QUEJA.description, createdAt: BASE_QUEJA.createdAt },
      candidates: [
        { permalink: BASE_TENDER.permalink, title: BASE_TENDER.title, contractor: BASE_TENDER.contractor, assignee: BASE_TENDER.assignee, awardDate: BASE_TENDER.awardDate ?? undefined, amount: BASE_TENDER.amount ?? undefined, categoryTitle: BASE_TENDER.categoryTitle },
      ],
    })
    stubResponse(sys, userPrompt, {
      correlation: {
        quejaId: BASE_QUEJA.id,
        tenderPermalink: 'https://example.com/never-seen-this',
        confidence: 0.9,
        reasoning: 'Hallucinated URL — not in shortlist.',
      },
    })
    const res = await correlateQuejasToTenders([BASE_QUEJA], [BASE_TENDER], [], {}, mockCallLLM)
    expect(res.items).toHaveLength(0)
    expect(res.stats.llmRejectedHallucinated).toBe(1)
  })

  it('drops LLM output below minConfidence', async () => {
    const sys = buildTenderQuejaSystemPrompt()
    const userPrompt = buildTenderQuejaUserPrompt({
      queja: { id: BASE_QUEJA.id, category: BASE_QUEJA.category, neighborhood: BASE_QUEJA.neighborhood, description: BASE_QUEJA.description, createdAt: BASE_QUEJA.createdAt },
      candidates: [
        { permalink: BASE_TENDER.permalink, title: BASE_TENDER.title, contractor: BASE_TENDER.contractor, assignee: BASE_TENDER.assignee, awardDate: BASE_TENDER.awardDate ?? undefined, amount: BASE_TENDER.amount ?? undefined, categoryTitle: BASE_TENDER.categoryTitle },
      ],
    })
    stubResponse(sys, userPrompt, {
      correlation: {
        quejaId: BASE_QUEJA.id,
        tenderPermalink: BASE_TENDER.permalink,
        confidence: 0.3,
        reasoning: 'Weak fit — date window stretches almost to the 18-month limit.',
      },
    })
    const res = await correlateQuejasToTenders([BASE_QUEJA], [BASE_TENDER], [], { minConfidence: 0.6 }, mockCallLLM)
    expect(res.items).toHaveLength(0)
    expect(res.stats.llmRejectedLowConfidence).toBe(1)
  })

  it('returns [] when shortlist is empty (no CPV or date match)', async () => {
    const farTender: TenderCandidate = {
      ...BASE_TENDER,
      awardDate: '2020-01-01',  // way too old
    }
    const res = await correlateQuejasToTenders([BASE_QUEJA], [farTender], [], {}, mockCallLLM)
    expect(res.items).toHaveLength(0)
    expect(res.stats.fuzzyShortlistsConsidered).toBe(0)
    expect(res.stats.llmCalls).toBe(0)
  })
})

describe('correlator · LOREG freeze guard', () => {
  it('short-circuits with empty items when frozenUntil is in the future', async () => {
    const future = new Date()
    future.setFullYear(future.getFullYear() + 1)
    const res = await correlateQuejasToTenders(
      [BASE_QUEJA],
      [BASE_TENDER],
      [],
      { snapshot: { frozenUntil: future.toISOString().slice(0, 10) } },
      async () => { throw new Error('must not call LLM during freeze') },
    )
    expect(res.stats.frozen).toBe(true)
    expect(res.items).toHaveLength(0)
  })
})
