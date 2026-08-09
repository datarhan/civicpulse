import { describe, it, expect } from 'vitest'
import { gateForDisplay, sortSignalFirst, filterClaims, facetCounts } from '../src/lib/claim-ledger'

const mk = (verdict, opts = {}) => ({
  visibility: opts.visibility,
  claim: {
    type: opts.type ?? 'afirmacion_numerica',
    accusationSubtype: opts.accusationSubtype,
    plenoId: opts.plenoId ?? 'p1',
    plenoDate: opts.plenoDate ?? '2026-04-20',
    speakerGroup: opts.grupo ?? 'PP',
    verbatim: opts.verbatim ?? 'algo',
    id: opts.id ?? Math.random().toString(36).slice(2),
  },
  verification: { verdict },
})

describe('gateForDisplay', () => {
  it('drops hidden even if upstream mislabeled it shown', () => {
    const out = gateForDisplay([
      {
        ...mk('sin-datos', { type: 'acusacion_publica', accusationSubtype: 'opinativa' }),
        visibility: 'shown',
      },
      mk('verificado'),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].verification.verdict).toBe('verificado')
  })
})

describe('sortSignalFirst', () => {
  it('orders contradicho, verificado, parcial, then newest date', () => {
    const out = sortSignalFirst([
      mk('parcial'),
      mk('verificado', { plenoDate: '2026-01-01' }),
      mk('verificado', { plenoDate: '2026-05-01' }),
      mk('contradicho'),
    ])
    expect(out.map((x) => x.verification.verdict)).toEqual([
      'contradicho',
      'verificado',
      'verificado',
      'parcial',
    ])
    expect(out[1].claim.plenoDate).toBe('2026-05-01') // newest verificado first
  })
})

describe('filterClaims', () => {
  const items = [
    mk('verificado', {
      type: 'cita_obra',
      plenoId: 'pA',
      grupo: 'PP',
      verbatim: 'puente nuevo',
      visibility: 'shown',
    }),
    mk('sin-datos', {
      type: 'afirmacion_numerica',
      plenoId: 'pB',
      grupo: 'PSOE',
      verbatim: 'sin match',
      visibility: 'toggle',
    }),
  ]
  it('hides toggle (sin-datos) items unless showSinDatos', () => {
    expect(filterClaims(items, {})).toHaveLength(1)
    expect(filterClaims(items, { showSinDatos: true })).toHaveLength(2)
  })
  it('filters by verdict/type/pleno/grupo', () => {
    expect(filterClaims(items, { verdict: 'verificado' })).toHaveLength(1)
    expect(filterClaims(items, { type: 'cita_obra' })).toHaveLength(1)
    expect(filterClaims(items, { pleno: 'pA' })).toHaveLength(1)
    expect(filterClaims(items, { grupo: 'PSOE', showSinDatos: true })).toHaveLength(1)
  })
  it('searches verbatim (only over the passed set)', () => {
    expect(filterClaims(items, { query: 'puente' })).toHaveLength(1)
    expect(filterClaims(items, { query: 'inexistente' })).toHaveLength(0)
  })
})

describe('facetCounts', () => {
  it('counts verdicts and types', () => {
    const c = facetCounts([
      mk('verificado'),
      mk('verificado'),
      mk('contradicho', { type: 'cita_obra' }),
    ])
    expect(c.verdict.verificado).toBe(2)
    expect(c.type.cita_obra).toBe(1)
  })
})
