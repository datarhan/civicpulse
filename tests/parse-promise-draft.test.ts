import { describe, it, expect } from 'vitest'
import {
  makeDraftId,
  validateReviewQueue,
  emptyQueue,
  removeDraftFromQueue,
  type DraftNewPromise,
  type PromiseReviewQueue,
} from '../src/scraper/promise-draft'

function draft(overrides: Partial<DraftNewPromise> = {}): DraftNewPromise {
  return {
    draftId: 'dnp-psoe-abc123',
    kind: 'new-promise',
    requiresHumanApproval: true,
    confidence: 0.82,
    grounding: {
      grounded: true,
      urlResolved: true,
      quoteFound: true,
      checkedAt: '2026-07-02T00:00:00.000Z',
    },
    decision: 'auto-publish',
    proposed: {
      party: 'PSOE',
      title: 'Nuevo carril bici en la Avenida del Camp de Túria',
      quote:
        'El gobierno municipal construirá un carril bici en la Avenida del Camp de Túria antes de 2027.',
      source: { url: 'https://example.com/noticia', publisher: 'Levante-EMV' },
      madeAt: '2026-06-20',
      topic: 'movilidad',
      kind: 'anuncio-gobierno',
      status: 'documentada',
    },
    reasoning: [
      {
        url: 'https://example.com/noticia',
        date: '2026-06-20',
        quote: 'carril bici',
        matchedKeywords: ['carril', 'bici'],
      },
    ],
    generatedAt: '2026-07-02T00:00:00.000Z',
    ...overrides,
  }
}

function queue(drafts: DraftNewPromise[]): string {
  const q: PromiseReviewQueue = { version: '1.0', generatedAt: '2026-07-02T00:00:00.000Z', drafts }
  return JSON.stringify(q)
}

describe('promise-draft', () => {
  it('makeDraftId is deterministic and namespaced', () => {
    const a = makeDraftId('PSOE', 'Título largo de prueba', 'https://x.test/n')
    const b = makeDraftId('PSOE', 'Título largo de prueba', 'https://x.test/n')
    expect(a).toBe(b)
    expect(a.startsWith('dnp-psoe-')).toBe(true)
  })

  it('validates a well-formed queue', () => {
    const q = validateReviewQueue(queue([draft()]))
    expect(q.drafts).toHaveLength(1)
    expect(q.drafts[0].proposed.party).toBe('PSOE')
  })

  it('rejects a quote shorter than 20 chars', () => {
    const q = JSON.parse(queue([draft()]))
    q.drafts[0].proposed.quote = 'muy corto'
    expect(() => validateReviewQueue(JSON.stringify(q))).toThrow(/quote/)
  })

  it('rejects a status other than documentada', () => {
    const q = JSON.parse(queue([draft()]))
    q.drafts[0].proposed.status = 'cumplida'
    expect(() => validateReviewQueue(JSON.stringify(q))).toThrow(/status/)
  })

  it('rejects an unknown party', () => {
    const q = JSON.parse(queue([draft()]))
    q.drafts[0].proposed.party = 'PODEMOS'
    expect(() => validateReviewQueue(JSON.stringify(q))).toThrow(/party/)
  })

  it('rejects requiresHumanApproval !== true', () => {
    const q = JSON.parse(queue([draft()]))
    q.drafts[0].requiresHumanApproval = false
    expect(() => validateReviewQueue(JSON.stringify(q))).toThrow(/requiresHumanApproval/)
  })

  it('emptyQueue + removeDraftFromQueue behave', () => {
    const e = emptyQueue('2026-07-02T00:00:00.000Z')
    expect(e.drafts).toHaveLength(0)
    const withOne = validateReviewQueue(queue([draft()]))
    const removed = removeDraftFromQueue(withOne, 'dnp-psoe-abc123')
    expect(removed.drafts).toHaveLength(0)
    const untouched = removeDraftFromQueue(withOne, 'nope')
    expect(untouched.drafts).toHaveLength(1)
  })
})
