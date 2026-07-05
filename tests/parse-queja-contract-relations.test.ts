import { describe, it, expect } from 'vitest'
import {
  placeSignal,
  departmentSignal,
  temporalModifier,
  expedienteSignal,
  scoreRelation,
  buildRelations,
} from '../src/scraper/queja-contract-relations'
import type { RelQueja, RelContract } from '../src/scraper/queja-contract-relations'

const q = (o: Partial<RelQueja> = {}): RelQueja => ({
  id: 'Q-1',
  serviceCode: 'via_publica',
  department: 'movilidad',
  placeSlug: 'valencia-la-vella',
  description: '',
  createdAt: '2025-01-01',
  ...o,
})
const c = (o: Partial<RelContract> = {}): RelContract => ({
  id: 'c1',
  permalink: 'p',
  title: 't',
  department: 'movilidad',
  cpvs: [],
  places: [],
  zones: [],
  awardDate: '2025-03-01',
  amount: 1,
  assignee: null,
  expediente: null,
  ...o,
})

describe('placeSignal', () => {
  it('matches an exact situated place (diacritics/ca-es folded)', () => {
    expect(
      placeSignal(q({ placeSlug: 'valencia-la-vella' }), c({ places: ['valència-la-vella'] })),
    ).toEqual({ granularity: 'exact', slug: 'valencia-la-vella' })
  })
  it('matches a barrio (zone) when the exact place does not', () => {
    expect(
      placeSignal(q({ placeSlug: 'barri-masia' }), c({ places: ['x'], zones: ['barri-masia'] })),
    ).toEqual({ granularity: 'barrio', slug: 'barri-masia' })
  })
  it('returns null when the queja has no place', () => {
    expect(placeSignal(q({ placeSlug: null }), c({ places: ['valencia-la-vella'] }))).toBeNull()
  })
  it('returns null when nothing co-locates', () => {
    expect(placeSignal(q({ placeSlug: 'a' }), c({ places: ['b'], zones: ['c'] }))).toBeNull()
  })
})

describe('departmentSignal', () => {
  it('matches on canonical department equality', () => {
    expect(departmentSignal(q({ department: 'urbanismo' }), c({ department: 'urbanismo' }))).toEqual(
      { slug: 'urbanismo' },
    )
  })
  it('matches on CPV theme even when departments differ/null', () => {
    // via_publica → construction div 45; contract carries a paving CPV
    expect(
      departmentSignal(
        q({ serviceCode: 'via_publica', department: null }),
        c({ department: null, cpvs: ['45233222'] }),
      ),
    ).toEqual({ slug: 'movilidad' })
  })
  it('returns null when neither dept nor theme align', () => {
    expect(
      departmentSignal(
        q({ serviceCode: 'cultura', department: 'cultura' }),
        c({ department: 'medio-ambiente', cpvs: ['90000000'] }),
      ),
    ).toBeNull()
  })
})

describe('temporalModifier', () => {
  it('fires for an award within +18 months after the queja', () => {
    expect(
      temporalModifier(q({ createdAt: '2025-01-01' }), c({ awardDate: '2025-05-01' }))?.monthsAfter,
    ).toBeCloseTo(4, 0)
  })
  it('is null for an award long before the queja', () => {
    expect(
      temporalModifier(q({ createdAt: '2025-01-01' }), c({ awardDate: '2020-01-01' })),
    ).toBeNull()
  })
})

describe('expedienteSignal', () => {
  it('matches normalized expediente when department aligns', () => {
    expect(
      expedienteSignal(
        q({ department: 'urbanismo' }),
        c({ department: 'urbanismo', expediente: '251/2023 BSDA' }),
      ),
    ).toEqual({ value: '251/2023BSDA' })
  })
  it('is null when the contract has no expediente', () => {
    expect(expedienteSignal(q(), c({ expediente: null }))).toBeNull()
  })
})

describe('scoreRelation — tiering + honesty gates', () => {
  it('Tier A: shared expediente → publishable, neutral label', () => {
    const r = scoreRelation(
      q({ department: 'urbanismo' }),
      c({ department: 'urbanismo', expediente: '251/2023' }),
    )!
    expect(r.tier).toBe('A')
    expect(r.requiresHumanApproval).toBe(false)
    expect(r.relationLabel).toBe('mismo expediente')
  })
  it('Tier A: place + department → publishable "misma zona y materia"', () => {
    const r = scoreRelation(
      q({ placeSlug: 'valencia-la-vella', department: 'movilidad' }),
      c({ places: ['valencia-la-vella'], department: 'movilidad' }),
    )!
    expect(r.tier).toBe('A')
    expect(r.relationLabel).toBe('misma zona y materia')
  })
  it('Tier B: department/theme only → requiresHumanApproval', () => {
    const r = scoreRelation(
      q({ placeSlug: null, department: 'urbanismo' }),
      c({ department: 'urbanismo' }),
    )!
    expect(r.tier).toBe('B')
    expect(r.requiresHumanApproval).toBe(true)
    expect(r.relationLabel).toBe('misma materia')
  })
  it('GATE: department/theme alone never becomes Tier A', () => {
    const r = scoreRelation(q({ placeSlug: null }), c({ department: q().department }))
    expect(r?.tier).not.toBe('A')
  })
  it('GATE: temporal alone → no link', () => {
    expect(
      scoreRelation(
        q({ placeSlug: null, department: null, serviceCode: 'x' }),
        c({ department: 'z', cpvs: [], places: [], zones: [], awardDate: '2025-02-01' }),
      ),
    ).toBeNull()
  })
  it('place only (no dept) → Tier B "misma zona"', () => {
    const r = scoreRelation(
      q({ placeSlug: 'valencia-la-vella', department: null, serviceCode: 'x' }),
      c({ places: ['valencia-la-vella'], department: 'z', cpvs: [] }),
    )!
    expect(r.tier).toBe('B')
    expect(r.relationLabel).toBe('misma zona')
  })
})

describe('buildRelations', () => {
  it('emits one link per matching pair and counts tiers', () => {
    const res = buildRelations(
      [q({ id: 'Q-1', placeSlug: 'valencia-la-vella', department: 'movilidad' })],
      [
        c({ id: 'c1', places: ['valencia-la-vella'], department: 'movilidad' }),
        c({ id: 'c2', places: ['elsewhere'], department: 'cultura', cpvs: ['92000000'] }),
      ],
    )
    expect(res.links).toHaveLength(1)
    expect(res.stats).toMatchObject({ quejasScanned: 1, contractsScanned: 2, tierA: 1, tierB: 0 })
  })
  it('returns empty under LOREG freeze', () => {
    const res = buildRelations([q()], [c({ places: ['valencia-la-vella'] })], { frozen: true })
    expect(res.links).toEqual([])
    expect(res.stats.frozen).toBe(true)
    expect(res.stats.reason).toBe('frozen')
  })
})
