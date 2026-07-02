import { describe, it, expect } from 'vitest'
import {
  STATUS_TIER,
  decideDraft,
  selectPromiseDrafts,
  AUTO_PUBLISH_MIN_CONFIDENCE,
} from '../src/scraper/promise-auto-curate'
import type { DraftNewPromise, Grounding } from '../src/scraper/promise-draft'

const GROUNDED: Grounding = { grounded: true, urlResolved: true, quoteFound: true, checkedAt: 'x' }
const UNGROUNDED: Grounding = {
  grounded: false,
  urlResolved: true,
  quoteFound: false,
  checkedAt: 'x',
}

function draft(id: string, over: Partial<DraftNewPromise> = {}): DraftNewPromise {
  return {
    draftId: id,
    kind: 'new-promise',
    requiresHumanApproval: true,
    confidence: 0.9,
    grounding: GROUNDED,
    decision: 'queue',
    proposed: {
      party: 'PSOE',
      title: `Título ${id}`,
      quote: 'Una promesa verbatim con longitud suficiente para pasar el validador de citas.',
      source: { url: `https://x.test/${id}`, publisher: 'Levante-EMV' },
      madeAt: '2026-06-20',
      topic: 'movilidad',
      kind: 'anuncio-gobierno',
      status: 'documentada',
    },
    reasoning: [],
    generatedAt: 'x',
    ...over,
  }
}

describe('promise-auto-curate — decideDraft', () => {
  it('documentada grounded + confident → auto-publish', () => {
    expect(decideDraft('documentada', 0.7, GROUNDED)).toBe('auto-publish')
  })
  it('below threshold → queue', () => {
    expect(decideDraft('documentada', 0.69, GROUNDED)).toBe('queue')
  })
  it('ungrounded → queue even if confident', () => {
    expect(decideDraft('documentada', 0.99, UNGROUNDED)).toBe('queue')
  })
  it('no-ejecutada grounded + confident → fast-track (never auto)', () => {
    expect(decideDraft('no-ejecutada', 0.99, GROUNDED)).toBe('fast-track')
  })
  it('inviable → always queue', () => {
    expect(decideDraft('inviable', 0.99, GROUNDED)).toBe('queue')
  })
  it('positive escalations map to auto', () => {
    for (const s of ['en-verificacion', 'en-progreso', 'parcial', 'cumplida'] as const) {
      expect(STATUS_TIER[s]).toBe('auto')
      expect(decideDraft(s, 0.8, GROUNDED)).toBe('auto-publish')
    }
  })
  it('threshold constant is 0.70', () => {
    expect(AUTO_PUBLISH_MIN_CONFIDENCE).toBe(0.7)
  })
})

describe('promise-auto-curate — selectPromiseDrafts', () => {
  it('frozen → everything skipped, nothing published', () => {
    const out = selectPromiseDrafts({
      candidates: [draft('a')],
      existingPromises: [],
      seenDraftIds: new Set(),
      frozen: true,
    })
    expect(out.autoPublish).toHaveLength(0)
    expect(out.queue).toHaveLength(0)
    expect(out.skipped[0].reason).toBe('frozen')
  })

  it('splits auto-publish vs queue and dedups', () => {
    const out = selectPromiseDrafts({
      candidates: [
        draft('a', { confidence: 0.9, grounding: GROUNDED }), // auto
        draft('b', { confidence: 0.5, grounding: GROUNDED }), // queue (low conf)
        draft('c', { confidence: 0.9, grounding: UNGROUNDED }), // queue (ungrounded)
      ],
      existingPromises: [],
      seenDraftIds: new Set(),
      frozen: false,
    })
    expect(out.autoPublish.map((d) => d.draftId)).toEqual(['a'])
    expect(out.queue.map((d) => d.draftId).sort()).toEqual(['b', 'c'])
  })

  it('skips drafts already seen or already tracked by title/url', () => {
    const out = selectPromiseDrafts({
      candidates: [
        draft('seen'),
        draft('dupurl', {
          proposed: {
            ...draft('x').proposed,
            source: { url: 'https://tracked.test/n', publisher: 'X' },
          },
        }),
      ],
      existingPromises: [
        { id: 'p1', party: 'PP', title: 'otra cosa', source: { url: 'https://tracked.test/n' } },
      ],
      seenDraftIds: new Set(['seen']),
      frozen: false,
    })
    expect(out.autoPublish).toHaveLength(0)
    expect(out.queue).toHaveLength(0)
    expect(out.skipped.map((s) => s.reason).sort()).toEqual(['already-tracked', 'duplicate'])
  })

  it('routes a grounded, confident no-ejecutada candidate to queue as fast-track (never auto)', () => {
    const ne = draft('ne', { confidence: 0.95, grounding: GROUNDED })
    ;(ne.proposed as { status: string }).status = 'no-ejecutada'
    const out = selectPromiseDrafts({
      candidates: [ne],
      existingPromises: [],
      seenDraftIds: new Set(),
      frozen: false,
    })
    expect(out.autoPublish).toHaveLength(0)
    expect(out.queue).toHaveLength(1)
    expect(out.queue[0].decision).toBe('fast-track')
  })

  it('stamps the decision field on auto-published drafts', () => {
    const out = selectPromiseDrafts({
      candidates: [draft('ap', { confidence: 0.9, grounding: GROUNDED })],
      existingPromises: [],
      seenDraftIds: new Set(),
      frozen: false,
    })
    expect(out.autoPublish[0].decision).toBe('auto-publish')
  })

  it('skips a candidate whose party+title already exists (normKey dedup, case/diacritic-insensitive)', () => {
    const dt = draft('dt', {
      proposed: { ...draft('dt').proposed, party: 'PSOE', title: 'Título ÚNICO de Prueba' },
    })
    const out = selectPromiseDrafts({
      candidates: [dt],
      existingPromises: [
        {
          id: 'p1',
          party: 'psoe',
          title: 'titulo unico de prueba',
          source: { url: 'https://other.test/x' },
        },
      ],
      seenDraftIds: new Set(),
      frozen: false,
    })
    expect(out.autoPublish).toHaveLength(0)
    expect(out.queue).toHaveLength(0)
    expect(out.skipped.map((s) => s.reason)).toContain('already-tracked')
  })

  it('caps accepted output at max and marks the rest max-reached', () => {
    const out = selectPromiseDrafts({
      candidates: [draft('m1'), draft('m2'), draft('m3')],
      existingPromises: [],
      seenDraftIds: new Set(),
      frozen: false,
      max: 2,
    })
    expect(out.autoPublish.length + out.queue.length).toBe(2)
    expect(out.skipped.some((s) => s.reason === 'max-reached')).toBe(true)
  })
})
