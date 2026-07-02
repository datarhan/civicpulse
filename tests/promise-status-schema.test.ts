import { describe, it, expect } from 'vitest'
import { PromiseStatusChangeBatchSchema } from '../src/llm/schemas'
import {
  PROMISE_STATUS_PROMPT_VERSION,
  buildPromiseStatusSystemPrompt,
  buildPromiseStatusUserPrompt,
} from '../src/llm/prompts'

describe('promise status-change schema + prompt', () => {
  it('accepts a valid status-change batch (progress statuses, cite-by-index)', () => {
    const parsed = PromiseStatusChangeBatchSchema.safeParse({
      changes: [
        {
          promiseId: 'psoe-x',
          proposedStatus: 'en-progreso',
          candidateIndex: 2,
          corpus: 'tender',
          quote: 'Contrato de obra adjudicado por 240.000 €',
          fieldCite: 'tenders.contracts[12].status=awarded',
          confidence: 0.82,
          reasoning: 'La adjudicación cubre la obra prometida.',
        },
      ],
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects a non-progress status', () => {
    const parsed = PromiseStatusChangeBatchSchema.safeParse({
      changes: [
        {
          promiseId: 'x',
          proposedStatus: 'no-ejecutada',
          candidateIndex: 0,
          corpus: 'press',
          quote: 'y'.repeat(12),
          confidence: 0.5,
          reasoning: 'z'.repeat(12),
        },
      ],
    })
    expect(parsed.success).toBe(false)
  })

  it('version + prompts present; user prompt numbers candidates 0-based', () => {
    expect(PROMISE_STATUS_PROMPT_VERSION).toBe('promise-status-v1')
    expect(buildPromiseStatusSystemPrompt().length).toBeGreaterThan(100)
    const u = buildPromiseStatusUserPrompt({
      promise: {
        id: 'p1',
        party: 'PSOE',
        title: 'Obra X',
        quote: 'haremos la obra X',
        topic: 'urbanismo',
      },
      candidates: [
        {
          corpus: 'tender',
          ref: 'https://x/t',
          title: 'Adjudicación obra X',
          date: '2026-05-01',
          publisher: 'PLACSP',
          snippet: 'awarded 240k',
        },
      ],
    })
    expect(u).toContain('[0]')
    expect(u).toContain('Adjudicación obra X')
    expect(u).toContain('Obra X')
  })
})
