import { describe, it, expect } from 'vitest'
import {
  validatePlaceSuggestions,
  validatePlaceOverrides,
  overrideFromSuggestion,
  type PlaceSuggestion,
  type PlaceOverride,
} from '../src/scraper/place-suggestion'

const SUG: PlaceSuggestion = {
  contractId: 'c1',
  title: 'Obras de mejora en C/ Sagunt',
  amount: 50000,
  date: '2024-05-01',
  llmPlaceName: 'Calle Sagunto',
  confidence: 0.82,
  reasoning: 'El título nombra la calle Sagunt.',
  match: {
    sourceId: 'carrer-de-sagunt',
    name: 'Carrer de Sagunt',
    kind: 'street',
    point: [39.55, -0.56],
  },
  requiresHumanApproval: true,
}

const snap = (over = {}) => ({
  generatedAt: '2026-07-05T00:00:00.000Z',
  promptVersion: 'place-geocode-v1',
  backend: 'gemini',
  stats: { candidatesScanned: 10, suggested: 1, unmatched: 2, lowConfidence: 1 },
  suggestions: [{ ...SUG, ...over }],
})

describe('place-suggestion — validatePlaceSuggestions', () => {
  it('accepts a well-formed snapshot', () => {
    expect(() => validatePlaceSuggestions(snap())).not.toThrow()
  })

  it('rejects a suggestion missing requiresHumanApproval:true', () => {
    expect(() => validatePlaceSuggestions(snap({ requiresHumanApproval: false }))).toThrow(
      /requiresHumanApproval/i,
    )
  })

  it('rejects out-of-range confidence', () => {
    expect(() => validatePlaceSuggestions(snap({ confidence: 1.5 }))).toThrow(/confidence/i)
  })

  it('rejects a coordinate outside the municipality', () => {
    expect(() =>
      validatePlaceSuggestions(snap({ match: { ...SUG.match, point: [0, 0] } })),
    ).toThrow(/point|coordinate|bbox/i)
  })

  it('rejects an unknown place kind', () => {
    expect(() =>
      validatePlaceSuggestions(snap({ match: { ...SUG.match, kind: 'planet' } })),
    ).toThrow(/kind/i)
  })
})

const OVR: PlaceOverride = {
  contractId: 'c1',
  sourceId: 'carrer-de-sagunt',
  name: 'Carrer de Sagunt',
  kind: 'street',
  point: [39.55, -0.56],
  matchedText: 'Carrer de Sagunt',
  curator: 'ada',
  approvedAt: '2026-07-05T10:00:00.000Z',
}
const ovSnap = (over = {}) => ({
  generatedAt: '2026-07-05T00:00:00.000Z',
  overrides: [{ ...OVR, ...over }],
})

describe('place-suggestion — validatePlaceOverrides', () => {
  it('accepts a well-formed override snapshot', () => {
    expect(() => validatePlaceOverrides(ovSnap())).not.toThrow()
  })

  it('rejects an override that carries requiresHumanApproval (defense in depth)', () => {
    expect(() => validatePlaceOverrides(ovSnap({ requiresHumanApproval: true }))).toThrow(
      /requiresHumanApproval/i,
    )
  })

  it('rejects an override with no curator', () => {
    expect(() => validatePlaceOverrides(ovSnap({ curator: '' }))).toThrow(/curator/i)
  })

  it('rejects an unknown kind', () => {
    expect(() => validatePlaceOverrides(ovSnap({ kind: 'nope' }))).toThrow(/kind/i)
  })
})

describe('place-suggestion — overrideFromSuggestion', () => {
  it('builds a valid override from a suggestion + curator + timestamp', () => {
    const ov = overrideFromSuggestion(SUG, 'ada', '2026-07-05T10:00:00.000Z', 'looks right')
    expect(ov).toMatchObject({
      contractId: 'c1',
      sourceId: 'carrer-de-sagunt',
      kind: 'street',
      point: [39.55, -0.56],
      curator: 'ada',
      note: 'looks right',
    })
    // Never carries the machine-only flag.
    expect('requiresHumanApproval' in ov).toBe(false)
    expect(() => validatePlaceOverrides({ generatedAt: 'x', overrides: [ov] })).not.toThrow()
  })
})
