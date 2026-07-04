import { describe, it, expect } from 'vitest'
import {
  aggregateNeighborhood,
  healthFromCounts,
  computePerNeighborhood,
} from '../../src/lib/neighborhood-aggregate'

const NEIGH = { slug: 'la-reva', name: 'La Reva', centroid: [39.5, -0.5], population: 1200 }
const ZONES = [
  {
    slug: 'la-reva',
    name: 'La Reva',
    centroid: [39.5, -0.5],
    contractCount: 3,
    amount: 274000,
    danaAmount: 274000,
  },
]
const QUEJAS = [
  { address_string: 'la-reva', status: 'resuelta' },
  { address_string: 'la-reva', status: 'silencio_negativo' },
  { address_string: 'la-reva', status: 'capturada' },
  { address_string: 'otro-barrio', status: 'resuelta' },
]

describe('lib/neighborhood-aggregate', () => {
  it('healthFromCounts is NEUTRAL when there are zero quejas (never infers health from absence)', () => {
    const h = healthFromCounts(0, 0, 0)
    expect(h.level).toBe('neutral')
    expect(h.resolvedPct).toBe(0)
    expect(h.silencioPct).toBe(0)
  })
  it('healthFromCounts grades silencio then resolution', () => {
    expect(healthFromCounts(10, 1, 4).level).toBe('crit') // 40% silencio
    expect(healthFromCounts(10, 1, 1).level).toBe('warn') // 10% silencio
    expect(healthFromCounts(10, 6, 0).level).toBe('ok') // 60% resuelto, 0 silencio
    expect(healthFromCounts(10, 2, 0).level).toBe('civic') // nothing notable
  })

  it('aggregateNeighborhood joins money + quejas for a located zone', () => {
    const agg = aggregateNeighborhood({ neighborhood: NEIGH, zones: ZONES, quejaItems: QUEJAS })
    expect(agg.population).toBe(1200)
    expect(agg.amount).toBe(274000)
    expect(agg.danaAmount).toBe(274000)
    expect(agg.contractCount).toBe(3)
    expect(agg.quejas).toEqual({ total: 3, resueltas: 1, pendientes: 1, silencios: 1 })
    expect(agg.health.level).toBe('crit') // 1/3 silencio ≥ 30%
  })

  it('aggregateNeighborhood reports honest zeros for a barrio with no zone and no quejas', () => {
    const empty = { slug: 'sense-res', name: 'Sense Res', centroid: [39.5, -0.5], population: 300 }
    const agg = aggregateNeighborhood({ neighborhood: empty, zones: ZONES, quejaItems: QUEJAS })
    expect(agg.population).toBe(300)
    expect(agg.amount).toBe(0)
    expect(agg.contractCount).toBe(0)
    expect(agg.quejas).toEqual({ total: 0, resueltas: 0, pendientes: 0, silencios: 0 })
    expect(agg.health.level).toBe('neutral')
  })

  it('computePerNeighborhood buckets quejas by slug and drops empty barrios', () => {
    const neighborhoods = [
      { slug: 'la-reva', name: 'La Reva', centroid: [39.5, -0.5] },
      { slug: 'el-molinet', name: 'El Molinet', centroid: [39.5, -0.5] },
    ]
    const rows = computePerNeighborhood(QUEJAS, neighborhoods)
    // 'otro-barrio' has no geo entry → ignored; el-molinet has 0 → dropped.
    expect(rows.map((r) => r.slug)).toEqual(['la-reva'])
    expect(rows[0]).toMatchObject({ total: 3, resueltas: 1, silencios: 1, pendientes: 1 })
  })
})
