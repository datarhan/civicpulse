import { describe, it, expect } from 'vitest'
import {
  newPromiseFromDraft,
  insertPromise,
  ensureUniqueId,
  removeAutoPublished,
  setReviewState,
  tombstoneDraftFromPromise,
  applyStatusChange,
  revertStatusChange,
  tombstoneStatusChange,
} from '../src/scraper/promise-apply'
import { validatePromisesSnapshot, type PromisesSnapshot } from '../src/scraper/promises'
import {
  makeDraftId,
  makeStatusDraftId,
  validateReviewQueue,
  type DraftNewPromise,
  type DraftStatusChange,
  type PromiseReviewQueue,
} from '../src/scraper/promise-draft'

const NOW = '2026-07-02T06:00:00.000Z'

function baseSnap(): PromisesSnapshot {
  return {
    version: '1.0',
    generatedAt: NOW,
    frozenUntil: null,
    legalNotice: 'x'.repeat(100),
    contactUrl: 'https://x.test/issues',
    methodologyUrl: '/metodologia',
    items: [],
  }
}

function draft(): DraftNewPromise {
  return {
    draftId: 'dnp-psoe-abc123',
    kind: 'new-promise',
    requiresHumanApproval: true,
    confidence: 0.83,
    grounding: { grounded: true, urlResolved: true, quoteFound: true, checkedAt: NOW },
    decision: 'auto-publish',
    proposed: {
      party: 'PSOE',
      title: 'Carril bici en la Avenida del Camp de Túria',
      quote: 'Construiremos un carril bici en la Avenida del Camp de Túria antes de 2027.',
      source: { url: 'https://x.test/n', publisher: 'Levante-EMV' },
      madeAt: '2026-06-20',
      topic: 'movilidad',
      kind: 'anuncio-gobierno',
      status: 'documentada',
    },
    reasoning: [],
    generatedAt: NOW,
  }
}

describe('promise-apply', () => {
  it('newPromiseFromDraft stamps autoPublished when auto', () => {
    const p = newPromiseFromDraft(draft(), NOW, { confidence: 0.83, at: NOW })
    expect(p.status).toBe('documentada')
    expect(p.autoPublished?.by).toBe('auto-curation-v1')
    expect(p.autoPublished?.reviewState).toBe('pending-review')
    expect(p.id.startsWith('ac-')).toBe(true)
  })

  it('newPromiseFromDraft omits autoPublished when human-approved', () => {
    const p = newPromiseFromDraft(draft(), NOW)
    expect(p.autoPublished == null).toBe(true)
  })

  it('ensureUniqueId disambiguates collisions', () => {
    const s = new Set(['ac-x', 'ac-x-2'])
    expect(ensureUniqueId('ac-x', s)).toBe('ac-x-3')
    expect(ensureUniqueId('ac-y', s)).toBe('ac-y')
  })

  it('insertPromise produces a snapshot that re-validates', () => {
    const p = newPromiseFromDraft(draft(), NOW, { confidence: 0.83, at: NOW })
    const next = insertPromise(baseSnap(), p)
    expect(next.items).toHaveLength(1)
    // whole-snapshot re-validation must pass
    validatePromisesSnapshot(JSON.stringify(next))
  })

  it('setReviewState + removeAutoPublished operate by id', () => {
    const p = newPromiseFromDraft(draft(), NOW, { confidence: 0.83, at: NOW })
    const snap = insertPromise(baseSnap(), p)
    const id = snap.items[0].id
    const reviewed = setReviewState(snap, id, 'reviewed', NOW)
    expect(reviewed.items[0].autoPublished?.reviewState).toBe('reviewed')
    expect(reviewed.items[0].autoPublished?.reviewedAt).toBe(NOW)
    const retracted = removeAutoPublished(snap, id)
    expect(retracted.items).toHaveLength(0)
  })

  it('removeAutoPublished refuses to remove a non-auto-published promise', () => {
    const snap = baseSnap()
    snap.items.push({
      id: 'human-1',
      party: 'PP',
      title: 'Promesa humana',
      quote: 'Una cita verbatim con longitud suficiente para el validador.',
      source: { url: 'https://x.test/h', publisher: 'X' },
      madeAt: '2026-01-01',
      topic: 'fiscal',
      kind: 'programa-electoral',
      status: 'documentada',
      evidence: [],
      createdAt: '2026-01-01',
    })
    expect(() => removeAutoPublished(snap, 'human-1')).toThrow(/not auto-published/)
  })

  it('tombstoneDraftFromPromise reconstructs the draftId discovery would regenerate', () => {
    const p = newPromiseFromDraft(draft(), NOW, { confidence: 0.83, at: NOW })
    const tomb = tombstoneDraftFromPromise(p, NOW)
    expect(tomb.draftId).toBe(makeDraftId(p.party, p.title, p.source.url))
  })

  it('tombstoneDraftFromPromise produces a draft that passes queue validation', () => {
    const p = newPromiseFromDraft(draft(), NOW, { confidence: 0.83, at: NOW })
    const queue: PromiseReviewQueue = {
      version: '1.0',
      generatedAt: NOW,
      drafts: [tombstoneDraftFromPromise(p, NOW)],
    }
    expect(() => validateReviewQueue(JSON.stringify(queue))).not.toThrow()
  })
})

describe('applyStatusChange', () => {
  function seededSnap(): PromisesSnapshot {
    const s = baseSnap()
    s.items.push({
      id: 'psoe-obra',
      party: 'PSOE',
      title: 'Reforma del pabellón',
      quote: 'Reformaremos el pabellón municipal antes de fin de año.',
      source: { url: 'https://x.test/p', publisher: 'X' },
      madeAt: '2026-01-01',
      topic: 'urbanismo',
      kind: 'anuncio-gobierno',
      status: 'documentada',
      evidence: [],
      createdAt: '2026-01-01',
    })
    return s
  }
  function statusDraft(): DraftStatusChange {
    return {
      draftId: 'dsc-psoe-obra-en-progreso-abc',
      kind: 'status-change',
      requiresHumanApproval: true,
      confidence: 0.85,
      grounding: { grounded: true, urlResolved: true, quoteFound: true, checkedAt: NOW },
      decision: 'auto-publish',
      promiseId: 'psoe-obra',
      currentStatus: 'documentada',
      proposedStatus: 'en-progreso',
      evidence: {
        date: '2026-05-01',
        url: 'https://placsp/t1',
        quote: 'obra adjudicada por 240000 euros',
        publisher: 'PLACSP',
        kind: 'tender',
        addedBy: 'auto-curation-v1',
      },
      reasoning: [],
      generatedAt: NOW,
    }
  }

  it('sets the status + appends evidence + re-validates (V1 gate passes)', () => {
    const next = applyStatusChange(seededSnap(), statusDraft(), NOW, { confidence: 0.85, at: NOW })
    const p = next.items.find((x) => x.id === 'psoe-obra')!
    expect(p.status).toBe('en-progreso')
    expect(p.evidence).toHaveLength(1)
    expect(p.evidence[0].kind).toBe('tender')
    expect(p.autoPublished?.reviewState).toBe('pending-review')
    validatePromisesSnapshot(JSON.stringify(next)) // non-V1 + evidence → passes
  })

  it('throws when the promiseId is missing', () => {
    const d = statusDraft()
    d.promiseId = 'nope'
    expect(() => applyStatusChange(seededSnap(), d, NOW)).toThrow(/not found/)
  })

  it('refuses a stale transition when the promise status already moved', () => {
    const d = statusDraft()
    d.currentStatus = 'en-progreso' // seeded promise is still 'documentada'
    expect(() => applyStatusChange(seededSnap(), d, NOW)).toThrow(/stale/)
  })

  it('removeAutoPublished refuses to delete a pre-existing (non-ac-) promise carrying a status-change auto-publish', () => {
    const next = applyStatusChange(seededSnap(), statusDraft(), NOW, { confidence: 0.85, at: NOW })
    expect(() => removeAutoPublished(next, 'psoe-obra')).toThrow(/pre-existed|curated data/)
  })

  it('records priorStatus + appendedEvidenceUrl when auto-publishing (schema accepts them)', () => {
    const next = applyStatusChange(seededSnap(), statusDraft(), NOW, { confidence: 0.85, at: NOW })
    const p = next.items.find((x) => x.id === 'psoe-obra')!
    expect(p.autoPublished?.priorStatus).toBe('documentada')
    expect(p.autoPublished?.appendedEvidenceUrl).toBe('https://placsp/t1')
    validatePromisesSnapshot(JSON.stringify(next)) // en-progreso + evidence + prior-state stamp → valid
  })

  it('revertStatusChange restores prior status, drops the appended evidence, clears autoPublished', () => {
    const published = applyStatusChange(seededSnap(), statusDraft(), NOW, {
      confidence: 0.85,
      at: NOW,
    })
    const reverted = revertStatusChange(published, 'psoe-obra', NOW)
    const p = reverted.items.find((x) => x.id === 'psoe-obra')!
    expect(p.status).toBe('documentada')
    expect(p.evidence).toHaveLength(0) // the one appended tender evidence dropped
    expect(p.autoPublished).toBeNull()
    validatePromisesSnapshot(JSON.stringify(reverted)) // back to a V1 status → passes
  })

  it('revertStatusChange throws when the promise has no revertible status change', () => {
    expect(() => revertStatusChange(seededSnap(), 'psoe-obra', NOW)).toThrow(
      /no auto-published status change/,
    )
  })

  it('tombstoneStatusChange reconstructs the miner draftId (keyed by evidence url) + validates', () => {
    const published = applyStatusChange(seededSnap(), statusDraft(), NOW, {
      confidence: 0.85,
      at: NOW,
    })
    const p = published.items.find((x) => x.id === 'psoe-obra')!
    const tomb = tombstoneStatusChange(p, NOW)
    expect(tomb).not.toBeNull()
    expect(tomb!.draftId).toBe(makeStatusDraftId('psoe-obra', 'en-progreso', 'https://placsp/t1'))
    expect(tomb!.currentStatus).toBe('documentada')
    expect(tomb!.proposedStatus).toBe('en-progreso')
    const q = { version: '1.0', generatedAt: NOW, drafts: [tomb!] }
    expect(() => validateReviewQueue(JSON.stringify(q))).not.toThrow()
  })
})
