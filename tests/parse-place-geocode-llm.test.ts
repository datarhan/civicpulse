import { describe, it, expect } from 'vitest'
import { geocodeContractsWithLlm } from '../src/scraper/place-geocode-llm'
import { buildGazetteer } from '../src/scraper/place-resolver'
import { validatePlaceSuggestions } from '../src/scraper/place-suggestion'

const GAZ = buildGazetteer({
  streets: [
    { slug: 'carrer-major', name: 'Carrer Major', kind: 'calle', point: [39.53, -0.58] },
    { slug: 'carrer-de-sagunt', name: 'Carrer de Sagunt', kind: 'calle', point: [39.55, -0.56] },
  ],
  pois: [],
  zones: [],
  zoneAliases: {},
})

// A mock caller keyed by the title in the user prompt → a canned LLM response.
const mockCaller = (byTitle: Record<string, any>) => async (opts: any) => {
  for (const [title, resp] of Object.entries(byTitle)) {
    if (opts.userPrompt.includes(title)) return resp
  }
  return { placeName: null, confidence: 0.9, reasoning: 'no place' }
}

const C = (id: string, title: string) => ({ id, title, amount: 50000, date: '2024-05-01' })

describe('place-geocode-llm — geocodeContractsWithLlm', () => {
  it('emits a human-gated suggestion when the LLM name resolves to a gazetteer point', async () => {
    const caller = mockCaller({
      'C/ Mayor': { placeName: 'Calle Mayor', confidence: 0.85, reasoning: 'Nombra C/ Mayor' },
    })
    const { suggestions, stats } = await geocodeContractsWithLlm(
      [C('c1', 'Reforma en edificio sito en C/ Mayor, 37')],
      GAZ,
      {},
      caller,
    )
    expect(suggestions.length).toBe(1)
    expect(suggestions[0]).toMatchObject({
      contractId: 'c1',
      llmPlaceName: 'Calle Mayor',
      requiresHumanApproval: true,
      match: { sourceId: 'carrer-major', kind: 'street', point: [39.53, -0.58] },
    })
    expect(stats.suggested).toBe(1)
    // The whole snapshot passes the validator.
    expect(() =>
      validatePlaceSuggestions({
        generatedAt: 'x',
        promptVersion: 'place-geocode-v1',
        backend: 'mock',
        stats,
        suggestions,
      }),
    ).not.toThrow()
  })

  it('drops a title the LLM says names no place (placeName null)', async () => {
    const caller = mockCaller({}) // default → placeName null
    const { suggestions, stats } = await geocodeContractsWithLlm(
      [C('c2', 'Servicio postal del Ayuntamiento')],
      GAZ,
      {},
      caller,
    )
    expect(suggestions.length).toBe(0)
    expect(stats.noPlace).toBe(1)
  })

  it('counts an unmatched name (LLM place not in the gazetteer)', async () => {
    const caller = mockCaller({
      Inexistente: { placeName: 'Calle Inexistente', confidence: 0.9, reasoning: 'x' },
    })
    const { suggestions, stats } = await geocodeContractsWithLlm(
      [C('c3', 'Obras en Calle Inexistente')],
      GAZ,
      {},
      caller,
    )
    expect(suggestions.length).toBe(0)
    expect(stats.unmatched).toBe(1)
  })

  it('drops low-confidence extractions below the threshold', async () => {
    const caller = mockCaller({
      Sagunt: { placeName: 'Sagunto', confidence: 0.3, reasoning: 'weak' },
    })
    const { suggestions, stats } = await geocodeContractsWithLlm(
      [C('c4', 'Algo en C/ Sagunt')],
      GAZ,
      { minConfidence: 0.5 },
      caller,
    )
    expect(suggestions.length).toBe(0)
    expect(stats.lowConfidence).toBe(1)
  })

  it('treats a null LLM call (error/circuit) as no suggestion', async () => {
    const caller = async () => null
    const { suggestions } = await geocodeContractsWithLlm(
      [C('c5', 'Obras en C/ Major')],
      GAZ,
      {},
      caller,
    )
    expect(suggestions.length).toBe(0)
  })

  it('respects the limit (caps how many titles are sent to the LLM)', async () => {
    let calls = 0
    const caller = async () => {
      calls++
      return { placeName: null, confidence: 0.9, reasoning: 'x' }
    }
    await geocodeContractsWithLlm(
      [C('a', 'x C/ Major'), C('b', 'y C/ Major'), C('c', 'z C/ Major')],
      GAZ,
      { limit: 2 },
      caller,
    )
    expect(calls).toBe(2)
  })
})
