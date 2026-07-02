import { describe, it, expect } from 'vitest'
import {
  quoteFoundInText,
  partyDateOk,
  stripHtml,
  groundDraft,
  type FetchLike,
} from '../src/scraper/promise-grounding'
import type { DraftNewPromise } from '../src/scraper/promise-draft'

const NOW = new Date('2026-07-02T00:00:00.000Z')

function draft(overrides: Partial<DraftNewPromise['proposed']> = {}): DraftNewPromise {
  return {
    draftId: 'dnp-psoe-abc',
    kind: 'new-promise',
    requiresHumanApproval: true,
    confidence: 0.9,
    grounding: { grounded: false, urlResolved: false, quoteFound: false, checkedAt: '' },
    decision: 'queue',
    proposed: {
      party: 'PSOE',
      title: 'Carril bici',
      quote: 'Construiremos un carril bici en la Avenida del Camp de Túria antes de 2027',
      source: { url: 'https://example.com/n', publisher: 'Levante-EMV' },
      madeAt: '2026-06-20',
      topic: 'movilidad',
      kind: 'anuncio-gobierno',
      status: 'documentada',
      ...overrides,
    },
    reasoning: [],
    generatedAt: '2026-07-02T00:00:00.000Z',
  }
}

describe('promise-grounding', () => {
  it('stripHtml removes tags and collapses whitespace', () => {
    expect(stripHtml('<p>Hola   <b>mundo</b></p>')).toBe('Hola mundo')
  })

  it('quoteFoundInText matches ignoring case/diacritics', () => {
    expect(quoteFoundInText('Construiremos un CARRIL bici', 'nota: construiremos un carril bici pronto')).toBe(true)
  })

  it('quoteFoundInText rejects an absent quote', () => {
    expect(quoteFoundInText('Bajaremos el IBI un 10%', 'la noticia habla de otra cosa distinta')).toBe(false)
  })

  it('partyDateOk rejects future dates and bad party', () => {
    expect(partyDateOk('PSOE', '2026-06-20', NOW)).toBe(true)
    expect(partyDateOk('PSOE', '2099-01-01', NOW)).toBe(false)
    expect(partyDateOk('PODEMOS', '2026-06-20', NOW)).toBe(false)
  })

  it('groundDraft returns grounded when URL resolves and quote is present', async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: true,
      url: 'https://real-publisher.example/n',
      text: async () => '<article>Construiremos un carril bici en la Avenida del Camp de Túria antes de 2027, dijo el alcalde.</article>',
    })
    const g = await groundDraft(draft(), fetchImpl, NOW)
    expect(g.grounded).toBe(true)
    expect(g.urlResolved).toBe(true)
    expect(g.quoteFound).toBe(true)
    expect(g.resolvedUrl).toBe('https://real-publisher.example/n')
  })

  it('groundDraft fails safe when quote is absent', async () => {
    const fetchImpl: FetchLike = async () => ({ ok: true, url: 'https://x/n', text: async () => '<p>texto sin la cita</p>' })
    const g = await groundDraft(draft(), fetchImpl, NOW)
    expect(g.grounded).toBe(false)
    expect(g.quoteFound).toBe(false)
  })

  it('groundDraft fails safe on network error', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error('ECONNREFUSED')
    }
    const g = await groundDraft(draft(), fetchImpl, NOW)
    expect(g.grounded).toBe(false)
    expect(g.urlResolved).toBe(false)
  })

  it('groundDraft fails safe on non-200', async () => {
    const fetchImpl: FetchLike = async () => ({ ok: false, url: 'https://x/404', text: async () => '' })
    const g = await groundDraft(draft(), fetchImpl, NOW)
    expect(g.grounded).toBe(false)
    expect(g.urlResolved).toBe(false)
  })

  it('groundDraft fails safe when body is unreadable', async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: true,
      url: 'https://x/n',
      text: async () => {
        throw new Error('decode error')
      },
    })
    const g = await groundDraft(draft(), fetchImpl, NOW)
    expect(g.grounded).toBe(false)
    expect(g.urlResolved).toBe(true)
  })

  it('quoteFoundInText rejects a short quote', () => {
    expect(quoteFoundInText('Sí', 'sí, claro que sí')).toBe(false)
  })

  it('partyDateOk rejects a non-ISO date', () => {
    expect(partyDateOk('PSOE', '20/06/2026', NOW)).toBe(false)
  })
})
