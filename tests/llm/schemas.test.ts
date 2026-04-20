import { describe, it, expect } from 'vitest'
import {
  PlenoVoteSuggestionSchema,
  PromiseEvidenceItemSchema,
  TenderQuejaCorrelationSchema,
  zodToJsonSchema,
} from '../../src/llm/schemas'

describe('LLM schemas · PlenoVoteSuggestionSchema', () => {
  const valid = {
    itemNumber: 3,
    outcome: 'aprobado',
    votes: [
      { bloc: 'PSOE', direction: 'a_favor', seats: 11 },
      { bloc: 'PP', direction: 'en_contra', seats: 7 },
    ],
    excerpt: 'Se somete a votación el punto tercero…',
    confidence: 0.9,
    reasoning: 'Extracted explicit outcome + bloc tuples from the segment.',
  }

  it('accepts a well-formed suggestion', () => {
    expect(PlenoVoteSuggestionSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects blocs outside the enum', () => {
    const bad = { ...valid, votes: [{ bloc: 'PODEMOS', direction: 'a_favor' }] }
    expect(PlenoVoteSuggestionSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects directions outside the enum', () => {
    const bad = { ...valid, votes: [{ bloc: 'PSOE', direction: 'maybe' }] }
    expect(PlenoVoteSuggestionSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects confidence outside [0,1]', () => {
    expect(PlenoVoteSuggestionSchema.safeParse({ ...valid, confidence: 1.5 }).success).toBe(false)
    expect(PlenoVoteSuggestionSchema.safeParse({ ...valid, confidence: -0.1 }).success).toBe(false)
  })

  it('accepts null itemNumber when header is unclear', () => {
    expect(PlenoVoteSuggestionSchema.safeParse({ ...valid, itemNumber: null }).success).toBe(true)
  })

  it('caps votes at 6 blocs', () => {
    const too_many = { ...valid, votes: Array(7).fill({ bloc: 'PSOE', direction: 'a_favor' }) }
    expect(PlenoVoteSuggestionSchema.safeParse(too_many).success).toBe(false)
  })

  it('rejects excerpts shorter than 10 chars', () => {
    expect(PlenoVoteSuggestionSchema.safeParse({ ...valid, excerpt: 'short' }).success).toBe(false)
  })
})

describe('LLM schemas · PromiseEvidenceItemSchema (V1 gate)', () => {
  const valid = {
    promiseId: 'psoe-escuelas-2026',
    corpus: 'press',
    evidenceUrl: 'https://www.levante-emv.com/riba-roja/2026/03/17/fake',
    publisher: 'Levante-EMV',
    date: '2026-03-17',
    quote: 'El pleno aprobó una partida de €2M para obras escolares en 2026.',
    reasoning: 'Direct mention of the exact amount + year from the promise.',
    confidence: 0.85,
  }

  it('accepts a well-formed evidence item', () => {
    expect(PromiseEvidenceItemSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects proposedStatus outside V1 set', () => {
    expect(PromiseEvidenceItemSchema.safeParse({ ...valid, proposedStatus: 'cumplida' }).success).toBe(false)
    expect(PromiseEvidenceItemSchema.safeParse({ ...valid, proposedStatus: 'no-ejecutada' }).success).toBe(false)
    expect(PromiseEvidenceItemSchema.safeParse({ ...valid, proposedStatus: 'inviable' }).success).toBe(false)
  })

  it('accepts V1 statuses', () => {
    expect(PromiseEvidenceItemSchema.safeParse({ ...valid, proposedStatus: 'documentada' }).success).toBe(true)
    expect(PromiseEvidenceItemSchema.safeParse({ ...valid, proposedStatus: 'en-verificacion' }).success).toBe(true)
  })

  it('rejects non-URL evidenceUrl', () => {
    expect(PromiseEvidenceItemSchema.safeParse({ ...valid, evidenceUrl: 'not-a-url' }).success).toBe(false)
  })

  it('rejects non-ISO date', () => {
    expect(PromiseEvidenceItemSchema.safeParse({ ...valid, date: '17/03/2026' }).success).toBe(false)
  })

  it('rejects corpus outside the enum', () => {
    expect(PromiseEvidenceItemSchema.safeParse({ ...valid, corpus: 'twitter' }).success).toBe(false)
  })
})

describe('LLM schemas · TenderQuejaCorrelationSchema', () => {
  const valid = {
    quejaId: 'Q-ABC12301',
    tenderPermalink: 'https://contrataciondelestado.es/wps/portal/!ut/p/b1/fake',
    confidence: 0.75,
    reasoning: 'Tender for "reparación de pavimentos" adjudicated 4 months after pothole queja.',
  }

  it('accepts a well-formed correlation', () => {
    expect(TenderQuejaCorrelationSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects non-URL permalink', () => {
    expect(TenderQuejaCorrelationSchema.safeParse({ ...valid, tenderPermalink: 'T-456' }).success).toBe(false)
  })

  it('rejects reasoning shorter than 10 chars', () => {
    expect(TenderQuejaCorrelationSchema.safeParse({ ...valid, reasoning: 'fits.' }).success).toBe(false)
  })
})

describe('zodToJsonSchema', () => {
  it('converts an object schema with required + optional fields', () => {
    const json = zodToJsonSchema(PlenoVoteSuggestionSchema) as Record<string, unknown>
    expect(json.type).toBe('object')
    const required = json.required as string[]
    expect(required).toContain('itemNumber')
    expect(required).toContain('votes')
    expect(json.additionalProperties).toBe(false)
  })

  it('converts enums with their allowed values', () => {
    const json = zodToJsonSchema(PromiseEvidenceItemSchema) as Record<string, unknown>
    const props = json.properties as Record<string, { type: string; enum?: string[] }>
    expect(props.corpus.enum).toContain('press')
    expect(props.corpus.enum).toContain('tender')
  })
})
