import { describe, it, expect } from 'vitest'
import { inferPromiseSuggestions } from '../src/scraper/promise-inference'
import type { Promise as CurPromise } from '../src/scraper/promises'

const basePromise: CurPromise = {
  id: 'test-promise-1',
  party: 'PSOE',
  title: 'Plan de Refugios Climáticos',
  quote: 'Riba-roja aprueba el Plan de Refugios Climáticos',
  source: { url: 'https://x.test', publisher: 'Valencia Plaza' },
  madeAt: '2026-03-27',
  topic: 'medio-ambiente',
  kind: 'anuncio-gobierno',
  status: 'documentada',
  evidence: [],
  createdAt: '2026-04-20',
}

const press = {
  items: [
    {
      id: 'n1',
      title: 'Riba-roja pone en marcha el primer refugio climático en el Parc Cinturó',
      link: 'https://example.com/n1',
      source: 'Levante-EMV',
      sourceHost: 'www.levante-emv.com',
      date: '2026-04-05T10:00:00Z',
      fingerprint: 'abc',
    },
    {
      id: 'n2',
      title: 'El PP pide explicaciones sobre el retraso del alumbrado LED',
      link: 'https://example.com/n2',
      source: 'Las Provincias',
      sourceHost: 'www.lasprovincias.es',
      date: '2026-04-10T09:00:00Z',
      fingerprint: 'def',
    },
  ],
}

const plenos = {
  items: [
    {
      id: 'p1',
      title: 'Pleno ordinario 6 de abril de 2026',
      date: '2026-04-06',
      kind: 'ordinario',
      link: 'https://example.com/p1',
    },
  ],
}

describe('scraper/promise-inference — inferPromiseSuggestions', () => {
  it('returns one suggestion record per input promise (no mutations, no deletions)', () => {
    const out = inferPromiseSuggestions([basePromise], { press, plenos })
    expect(out.length).toBe(1)
    expect(out[0].promiseId).toBe('test-promise-1')
  })

  it('suggestion carries a proposedStatus, a confidence score [0,1], and a reasoning chain', () => {
    const out = inferPromiseSuggestions([basePromise], { press, plenos })
    const s = out[0]
    expect(['documentada', 'en-progreso', 'cumplida', 'parcial', 'no-ejecutada']).toContain(
      s.proposedStatus,
    )
    expect(s.confidence).toBeGreaterThanOrEqual(0)
    expect(s.confidence).toBeLessThanOrEqual(1)
    expect(Array.isArray(s.reasoning)).toBe(true)
    expect(s.reasoning.length).toBeGreaterThan(0)
    for (const r of s.reasoning) {
      expect(r.url).toMatch(/^https?:\/\//)
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}/)
      expect(r.quote.length).toBeGreaterThan(0)
      expect(typeof r.kind).toBe('string')
    }
  })

  it('never proposes a status without at least one reasoning entry', () => {
    // An unrelated promise with no matching press or plenos should still
    // produce a suggestion record, but its proposedStatus stays `documentada`
    // and its reasoning array is empty or carries "sin evidencia nueva".
    const unrelated: CurPromise = {
      ...basePromise,
      id: 'unrelated',
      title: 'Otra cosa totalmente distinta',
      quote: 'Una cita muy distinta sobre algún tema no relacionado',
    }
    const out = inferPromiseSuggestions([unrelated], { press, plenos })
    expect(out[0].proposedStatus).toBe('documentada')
  })

  it('never mutates the input promise array', () => {
    const copy = JSON.parse(JSON.stringify(basePromise))
    inferPromiseSuggestions([basePromise], { press, plenos })
    expect(basePromise).toEqual(copy)
  })

  it('marks the output as explicitly "human-approval-required"', () => {
    const out = inferPromiseSuggestions([basePromise], { press, plenos })
    expect(out[0].requiresHumanApproval).toBe(true)
  })

  it('finds the "refugios climáticos" press match when present', () => {
    const out = inferPromiseSuggestions([basePromise], { press, plenos })
    const urls = out[0].reasoning.map((r) => r.url)
    expect(urls.some((u) => u === 'https://example.com/n1')).toBe(true)
  })
})
