import { describe, it, expect } from 'vitest'
import {
  validateVote,
  validateSnapshot,
  PlenoVoteValidationError,
} from '../src/scraper/pleno-votes'

const baseVote = {
  id: 'k4olcs-03',
  plenoId: 'k4olcs',
  plenoDate: '2026-04-20',
  itemNumber: 3,
  title: 'Aprobación inicial del presupuesto municipal para 2026',
  outcome: 'aprobado',
  votes: [
    { bloc: 'PSOE', direction: 'a_favor', seats: 11 },
    { bloc: 'PP', direction: 'en_contra', seats: 7 },
    { bloc: 'VOX', direction: 'abstencion', seats: 2 },
    { bloc: 'Compromís', direction: 'a_favor', seats: 1 },
  ],
  department: 'Hacienda',
  expediente: '4305/2026/GEN',
  sourceUrl: 'http://www.ribarroja.es/plenos/2026/acta-20-abril',
  sourcePublisher: 'Ayuntamiento de Riba-roja de Túria',
  retrievedAt: '2026-04-20',
}

describe('pleno-votes validator', () => {
  it('accepts a well-formed vote', () => {
    const v = validateVote(baseVote)
    expect(v.id).toBe('k4olcs-03')
    expect(v.votes).toHaveLength(4)
    expect(v.outcome).toBe('aprobado')
  })

  it('rejects invalid id format', () => {
    expect(() => validateVote({ ...baseVote, id: 'INVALID' })).toThrow(PlenoVoteValidationError)
  })

  it('rejects non-ISO plenoDate', () => {
    expect(() => validateVote({ ...baseVote, plenoDate: '20/04/2026' })).toThrow(/ISO/)
  })

  it('rejects title shorter than 20 chars', () => {
    expect(() => validateVote({ ...baseVote, title: 'Corto' })).toThrow(/20 chars/)
  })

  it('rejects outcome outside enum', () => {
    expect(() => validateVote({ ...baseVote, outcome: 'quizas' })).toThrow(/outcome/)
  })

  it('rejects bloc outside enum', () => {
    expect(() =>
      validateVote({ ...baseVote, votes: [{ bloc: 'PODEMOS', direction: 'a_favor' }] }),
    ).toThrow(/bloc/)
  })

  it('rejects duplicate blocs in votes array', () => {
    expect(() =>
      validateVote({
        ...baseVote,
        votes: [
          { bloc: 'PSOE', direction: 'a_favor' },
          { bloc: 'PSOE', direction: 'en_contra' },
        ],
      }),
    ).toThrow(/listed more than once/)
  })

  it('rejects invalid direction', () => {
    expect(() =>
      validateVote({ ...baseVote, votes: [{ bloc: 'PSOE', direction: 'maybe' }] }),
    ).toThrow(/direction/)
  })

  it('rejects non-http source URL', () => {
    expect(() => validateVote({ ...baseVote, sourceUrl: 'file:///tmp/acta.pdf' })).toThrow(/http/)
  })

  it('rejects empty votes array', () => {
    expect(() => validateVote({ ...baseVote, votes: [] })).toThrow(/non-empty/)
  })

  it('rejects negative or non-integer seats', () => {
    expect(() =>
      validateVote({ ...baseVote, votes: [{ bloc: 'PSOE', direction: 'a_favor', seats: -1 }] }),
    ).toThrow(/seats/)
    expect(() =>
      validateVote({ ...baseVote, votes: [{ bloc: 'PSOE', direction: 'a_favor', seats: 1.5 }] }),
    ).toThrow(/seats/)
  })

  it('aggregates stats correctly in a snapshot', () => {
    const snap = validateSnapshot({
      generatedAt: '2026-04-20T00:00:00Z',
      source: {
        description: 'Curated from published actas',
        contract: 'Human-edited; CLI-validated',
      },
      items: [
        baseVote,
        { ...baseVote, id: 'k4olcs-04', itemNumber: 4, outcome: 'rechazado' },
        { ...baseVote, id: 'ma87e0-01', itemNumber: 1, plenoId: 'ma87e0', plenoDate: '2026-03-16' },
      ],
    })
    expect(snap.stats.total).toBe(3)
    expect(snap.stats.byOutcome.aprobado).toBe(2)
    expect(snap.stats.byOutcome.rechazado).toBe(1)
    expect(snap.stats.byPleno.k4olcs).toBe(2)
    expect(snap.stats.byPleno.ma87e0).toBe(1)
  })

  it('rejects duplicate ids at the snapshot level', () => {
    expect(() =>
      validateSnapshot({
        generatedAt: '2026-04-20T00:00:00Z',
        source: { description: '', contract: '' },
        items: [baseVote, baseVote],
      }),
    ).toThrow(/duplicate id/)
  })

  it('accepts an empty snapshot (no votes registered yet)', () => {
    const snap = validateSnapshot({
      generatedAt: '2026-04-20T00:00:00Z',
      source: { description: 'empty', contract: 'empty' },
      items: [],
    })
    expect(snap.stats.total).toBe(0)
    expect(snap.items).toEqual([])
  })
})
