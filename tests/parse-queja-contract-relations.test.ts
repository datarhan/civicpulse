import { describe, it, expect } from 'vitest'
import {
  placeSignal,
  departmentSignal,
  temporalModifier,
  scoreRelation,
  buildRelations,
} from '../src/scraper/queja-contract-relations'
import type { RelQueja, RelContract } from '../src/scraper/queja-contract-relations'
import { normalizeQueja, buildRelContracts } from '../scripts/scrape-queja-contract-relations'

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
    expect(
      departmentSignal(q({ department: 'urbanismo' }), c({ department: 'urbanismo' })),
    ).toEqual({ slug: 'urbanismo' })
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

describe('scoreRelation — tiering + honesty gates', () => {
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

describe('normalizeQueja (current bot snapshot schema)', () => {
  it('maps service_code/address_string/requested_datetime/concejalia_area', () => {
    const r = normalizeQueja({
      service_request_id: 'Q-KJY6XSVG',
      service_code: 'urbanismo',
      concejalia_area: 'Urbanismo',
      address_string: 'urbanitzacio-valencia-la-vella',
      description: 'x',
      requested_datetime: '2026-07-02 10:48:16',
    })!
    expect(r).toMatchObject({
      id: 'Q-KJY6XSVG',
      serviceCode: 'urbanismo',
      department: 'urbanismo',
      placeSlug: 'urbanitzacio-valencia-la-vella',
    })
    expect(r.createdAt).toMatch(/^2026-07-02/)
  })
  it('drops rows without an id or timestamp', () => {
    expect(normalizeQueja({ service_code: 'x' })).toBeNull()
  })
})

describe('buildRelContracts (tender-geo place.sourceId + expediente join, awarded only)', () => {
  it('extracts situated place slugs + zones and joins expediente by id', () => {
    const contracts = [
      {
        id: '4379456',
        permalink: 'p',
        title: 't',
        status: 'awarded',
        categoryTitle: 'construction',
        cpvs: ['45233222'],
        awardDate: '2023-12-27',
        finalAmount: 100,
        assignee: 'X',
      },
      { id: 'draft1', status: 'open' },
    ]
    const geo = {
      assignments: [
        {
          id: '4379456',
          place: { name: 'Urbanització La Reva', sourceId: 'urbanitzacio-la-reva' },
          zones: ['urbanitzacio-la-reva', 'l-oliveral'],
        },
      ],
    }
    const tenders = [{ id: '4379456', documentNumber: '251/2023 BSDA' }]
    const out = buildRelContracts(contracts, geo, tenders)
    expect(out).toHaveLength(1) // non-awarded dropped
    expect(out[0]).toMatchObject({ id: '4379456', expediente: '251/2023 BSDA' })
    expect(out[0].zones).toContain('l-oliveral')
    expect(out[0].places).toEqual(expect.arrayContaining(['urbanitzacio-la-reva']))
  })
})
