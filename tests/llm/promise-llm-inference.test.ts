/**
 * Unit tests for the LLM promise evidence miner. Verifies every guard:
 * LOREG freeze, hallucinated-URL rejection, V1-status gate, confidence gate,
 * retriever shortlist behavior.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { minePromiseEvidence } from '../../src/scraper/promise-llm-inference'
import { mockCallLLM, resetMock, stubResponse } from './mockClient'
import {
  PROMISE_EVIDENCE_PROMPT_VERSION,
  buildPromiseEvidenceSystemPrompt,
  buildPromiseEvidenceUserPrompt,
} from '../../src/llm/prompts'
import type { RetrievalInput } from '../../src/llm/retriever'

const BASE_INPUT: RetrievalInput = {
  promise: {
    id: 'psoe-escuelas-2026',
    title: 'Dos millones de euros para obras escolares en 2026',
    quote: 'Destinaremos 2M€ a obras en centros escolares durante 2026',
    topic: 'educacion',
  },
  corpora: [
    {
      corpus: 'press',
      documents: [
        {
          url: 'https://www.levante-emv.com/riba-roja/2026/03/17/obras-escuelas',
          title: 'El pleno aprueba 2M€ para obras en escuelas',
          date: '2026-03-17',
          publisher: 'Levante-EMV',
          text: 'El pleno aprobó esta mañana una partida de dos millones para obras escolares en 2026',
        },
        {
          url: 'https://example.com/unrelated-fiesta',
          title: 'Riba-roja celebra las fallas',
          date: '2026-03-19',
          publisher: 'Las Provincias',
          text: 'Fiestas tradicionales con churros y música',
        },
      ],
    },
  ],
}

function userPrompt(input: RetrievalInput, publisher = 'Levante-EMV') {
  // Build the exact user prompt the engine will produce. Mirrors
  // buildPromiseEvidenceUserPrompt with the same shortlisting the retriever
  // will do for this input (press corpus, snippet clipped to 300 chars).
  return buildPromiseEvidenceUserPrompt({
    promise: {
      id: input.promise.id,
      party: 'unknown',
      title: input.promise.title,
      quote: input.promise.quote,
      topic: input.promise.topic,
      madeAt: '',
    },
    candidates: [
      {
        corpus: 'press',
        items: [
          {
            url: input.corpora[0].documents[0].url,
            title: input.corpora[0].documents[0].title,
            date: input.corpora[0].documents[0].date,
            publisher,
            snippet: input.corpora[0].documents[0].text.slice(0, 300),
          },
        ],
      },
    ],
  })
}

beforeEach(() => { resetMock() })

describe('promise-llm-inference · LOREG freeze', () => {
  it('returns no items when the snapshot is frozen until a future date', async () => {
    const farFuture = new Date()
    farFuture.setFullYear(farFuture.getFullYear() + 1)
    const res = await minePromiseEvidence(
      BASE_INPUT,
      { snapshot: { frozenUntil: farFuture.toISOString().slice(0, 10) } },
      mockCallLLM,
    )
    expect(res.stats.frozen).toBe(true)
    expect(res.items).toHaveLength(0)
  })

  it('processes normally when frozenUntil is null', async () => {
    const sys = buildPromiseEvidenceSystemPrompt()
    const user = userPrompt(BASE_INPUT)
    stubResponse(sys, user, {
      evidence: [
        {
          promiseId: 'psoe-escuelas-2026',
          corpus: 'press',
          evidenceUrl: BASE_INPUT.corpora[0].documents[0].url,
          publisher: 'Levante-EMV',
          date: '2026-03-17',
          quote: 'El pleno aprobó esta mañana una partida de dos millones para obras escolares en 2026.',
          reasoning: 'Direct match on the 2M€ amount + 2026 school context.',
          confidence: 0.88,
        },
      ],
    })
    const res = await minePromiseEvidence(
      BASE_INPUT,
      { snapshot: { frozenUntil: null } },
      mockCallLLM,
    )
    expect(res.stats.frozen).toBe(false)
    expect(res.items).toHaveLength(1)
    expect(res.items[0].publisher).toBe('Levante-EMV')
  })
})

describe('promise-llm-inference · URL hallucination guard', () => {
  it('rejects evidence pointing at a URL outside the retriever allowlist', async () => {
    const sys = buildPromiseEvidenceSystemPrompt()
    const user = userPrompt(BASE_INPUT)
    stubResponse(sys, user, {
      evidence: [
        {
          promiseId: 'psoe-escuelas-2026',
          corpus: 'press',
          // This URL was NEVER in the candidates the LLM saw — it hallucinated it.
          evidenceUrl: 'https://www.example-hallucinated.com/fake-article',
          publisher: 'Fake Publisher',
          date: '2026-03-17',
          quote: 'This quote does not correspond to any real source.',
          reasoning: 'Hallucinated citation — must be rejected.',
          confidence: 0.9,
        },
      ],
    })
    const res = await minePromiseEvidence(
      BASE_INPUT,
      { snapshot: { frozenUntil: null } },
      mockCallLLM,
    )
    expect(res.items).toHaveLength(0)
    expect(res.stats.itemsRejected.hallucinatedUrl).toBe(1)
  })
})

describe('promise-llm-inference · confidence gate', () => {
  it('drops evidence below minConfidence', async () => {
    const sys = buildPromiseEvidenceSystemPrompt()
    const user = userPrompt(BASE_INPUT)
    stubResponse(sys, user, {
      evidence: [
        {
          promiseId: 'psoe-escuelas-2026',
          corpus: 'press',
          evidenceUrl: BASE_INPUT.corpora[0].documents[0].url,
          publisher: 'Levante-EMV',
          date: '2026-03-17',
          quote: 'Generic quote that only mentions schools briefly.',
          reasoning: 'Weak match; primarily about other topics.',
          confidence: 0.3,
        },
      ],
    })
    const res = await minePromiseEvidence(
      BASE_INPUT,
      { snapshot: { frozenUntil: null }, minConfidence: 0.7 },
      mockCallLLM,
    )
    expect(res.items).toHaveLength(0)
    expect(res.stats.itemsRejected.belowConfidence).toBe(1)
  })
})

describe('promise-llm-inference · V1 status gate', () => {
  it('accepts proposedStatus=documentada', async () => {
    const sys = buildPromiseEvidenceSystemPrompt()
    const user = userPrompt(BASE_INPUT)
    stubResponse(sys, user, {
      evidence: [
        {
          promiseId: 'psoe-escuelas-2026',
          proposedStatus: 'documentada',
          corpus: 'press',
          evidenceUrl: BASE_INPUT.corpora[0].documents[0].url,
          publisher: 'Levante-EMV',
          date: '2026-03-17',
          quote: 'Evidence quote.',
          reasoning: 'Direct match.',
          confidence: 0.8,
        },
      ],
    })
    const res = await minePromiseEvidence(
      BASE_INPUT,
      { snapshot: { frozenUntil: null } },
      mockCallLLM,
    )
    expect(res.items).toHaveLength(1)
    expect(res.items[0].proposedStatus).toBe('documentada')
  })
})

describe('promise-llm-inference · empty retriever', () => {
  it('returns no items when nothing matches the promise keywords', async () => {
    const input: RetrievalInput = {
      promise: {
        id: 'fake-promise',
        title: 'Completely unrelated xyzzy topic',
        quote: 'Pure foobar babble',
        topic: 'foo',
      },
      corpora: [
        {
          corpus: 'press',
          documents: [
            {
              url: 'https://example.com/culture',
              title: 'Cultural events',
              date: '2026-03-01',
              text: 'Music, dance, theater',
            },
          ],
        },
      ],
    }
    const res = await minePromiseEvidence(input, { snapshot: { frozenUntil: null } }, mockCallLLM)
    expect(res.stats.candidatesRetrieved).toBe(0)
    expect(res.items).toHaveLength(0)
  })
})

describe('promise-llm-inference · prompt version', () => {
  it('passes PROMISE_EVIDENCE_PROMPT_VERSION through to the caller', async () => {
    let seen = ''
    await minePromiseEvidence(
      BASE_INPUT,
      { snapshot: { frozenUntil: null } },
      async (opts) => {
        seen = opts.promptVersion
        stubResponse(opts.systemPrompt, opts.userPrompt, { evidence: [] })
        return mockCallLLM(opts)
      },
    )
    expect(seen).toBe(PROMISE_EVIDENCE_PROMPT_VERSION)
  })
})
