import { describe, it, expect } from 'vitest'
import { PromiseDiscoveryBatchSchema } from '../src/llm/schemas'
import {
  buildPromiseDiscoverySystemPrompt,
  buildPromiseDiscoveryUserPrompt,
  PROMISE_DISCOVERY_PROMPT_VERSION,
} from '../src/llm/prompts'

describe('promise discovery schema + prompt', () => {
  it('accepts a valid discovery batch', () => {
    const parsed = PromiseDiscoveryBatchSchema.safeParse({
      promises: [
        {
          party: 'PSOE',
          title: 'Carril bici en la Avenida del Camp de Túria',
          quote: 'Construiremos un carril bici en la Avenida del Camp de Túria antes de 2027.',
          sourceUrl: 'https://example.com/n',
          publisher: 'Levante-EMV',
          madeAt: '2026-06-20',
          topic: 'movilidad',
          kind: 'anuncio-gobierno',
          confidence: 0.82,
          reasoning: 'El alcalde anuncia el proyecto en rueda de prensa.',
        },
      ],
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects an out-of-enum topic', () => {
    const parsed = PromiseDiscoveryBatchSchema.safeParse({
      promises: [
        {
          party: 'PSOE',
          title: 'x'.repeat(5),
          quote: 'y'.repeat(25),
          sourceUrl: 'https://x/n',
          publisher: 'X',
          madeAt: '2026-01-01',
          topic: 'NOPE',
          kind: 'anuncio-gobierno',
          confidence: 0.5,
          reasoning: 'z'.repeat(15),
        },
      ],
    })
    expect(parsed.success).toBe(false)
  })

  it('version + prompts are present', () => {
    expect(PROMISE_DISCOVERY_PROMPT_VERSION).toBe('promise-discovery-v1')
    expect(buildPromiseDiscoverySystemPrompt().length).toBeGreaterThan(100)
    const u = buildPromiseDiscoveryUserPrompt({
      existingTitles: ['Ya seguida'],
      sources: [
        {
          kind: 'press',
          items: [
            {
              title: 'Nueva promesa',
              url: 'https://x/n',
              date: '2026-06-20',
              publisher: 'X',
              snippet: 's',
            },
          ],
        },
      ],
    })
    expect(u).toContain('Ya seguida')
    expect(u).toContain('Nueva promesa')
  })
})
