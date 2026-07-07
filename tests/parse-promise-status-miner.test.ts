import { describe, it, expect } from 'vitest'
import { mineStatusChanges } from '../src/scraper/promise-status-miner'
import type { RetrievalInput } from '../src/llm/retriever'

const input: RetrievalInput = {
  promise: {
    id: 'psoe-obra',
    title: 'Reforma del pabellón',
    quote: 'reformaremos el pabellón municipal',
    topic: 'urbanismo',
  },
  corpora: [
    {
      corpus: 'tender',
      documents: [
        {
          url: 'https://placsp/t1',
          title: 'Adjudicación reforma pabellón municipal',
          date: '2026-05-01',
          publisher: 'PLACSP',
          text: 'contrato de obra reforma pabellón adjudicado awarded 240000',
        },
      ],
    },
  ],
}
const notFrozen = { snapshot: { frozenUntil: null } }

describe('mineStatusChanges', () => {
  it('resolves a valid candidateIndex into a grounded StatusChangeCandidate', async () => {
    const stub = async () => ({
      changes: [
        {
          promiseId: 'psoe-obra',
          proposedStatus: 'en-progreso',
          candidateIndex: 0,
          corpus: 'tender',
          quote: 'reforma pabellón adjudicado',
          fieldCite: 'tender[0].status=awarded',
          confidence: 0.85,
          reasoning: 'adjudicada la obra prometida',
        },
      ],
    })
    const out = await mineStatusChanges(input, notFrozen, stub as never)
    expect(out.candidates).toHaveLength(1)
    expect(out.candidates[0].proposedStatus).toBe('en-progreso')
    expect(out.candidates[0].evidence.url).toBe('https://placsp/t1')
    expect(out.candidates[0].evidence.kind).toBe('tender')
  })

  it('rejects a candidateIndex out of range (hallucinated cite)', async () => {
    const stub = async () => ({
      changes: [
        {
          promiseId: 'psoe-obra',
          proposedStatus: 'en-progreso',
          candidateIndex: 9,
          corpus: 'tender',
          quote: 'x'.repeat(12),
          confidence: 0.9,
          reasoning: 'y'.repeat(12),
        },
      ],
    })
    const out = await mineStatusChanges(input, notFrozen, stub as never)
    expect(out.candidates).toHaveLength(0)
    expect(out.stats.rejected.hallucinatedCite).toBe(1)
  })

  it('honors freeze (empty, no LLM call)', async () => {
    let called = false
    const stub = async () => {
      called = true
      return { changes: [] }
    }
    const out = await mineStatusChanges(
      input,
      { snapshot: { frozenUntil: '2999-01-01' } },
      stub as never,
    )
    expect(called).toBe(false)
    expect(out.stats.frozen).toBe(true)
  })

  it('rejects below-confidence', async () => {
    const stub = async () => ({
      changes: [
        {
          promiseId: 'psoe-obra',
          proposedStatus: 'en-progreso',
          candidateIndex: 0,
          corpus: 'tender',
          quote: 'x'.repeat(12),
          confidence: 0.3,
          reasoning: 'y'.repeat(12),
        },
      ],
    })
    const out = await mineStatusChanges(input, { ...notFrozen, minConfidence: 0.6 }, stub as never)
    expect(out.candidates).toHaveLength(0)
    expect(out.stats.rejected.belowConfidence).toBe(1)
  })

  it('rejects a change whose echoed promiseId is not the mined promise', async () => {
    // Reproducer for the 2026-07-07 FATAL: the LLM echoed an invented id
    // ("infraestructura_transporte") instead of the mined promise's, and the
    // trusted echo crashed applyStatusChange downstream. All 7 queued drafts
    // that day carried invented ids for news about THIRD PARTIES — so a
    // mismatched echo means subject drift, and the change must be dropped
    // (forcing our id would mis-attach unrelated news to a real promise).
    const stub = async () => ({
      changes: [
        {
          promiseId: 'infraestructura_transporte',
          proposedStatus: 'en-progreso',
          candidateIndex: 0,
          corpus: 'tender',
          quote: 'reforma pabellón adjudicado',
          fieldCite: 'tender[0].status=awarded',
          confidence: 0.85,
          reasoning: 'adjudicada la obra prometida',
        },
      ],
    })
    const out = await mineStatusChanges(input, notFrozen, stub as never)
    expect(out.candidates).toHaveLength(0)
    expect(out.stats.rejected.idMismatch).toBe(1)
  })
})
