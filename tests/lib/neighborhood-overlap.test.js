import { describe, it, expect } from 'vitest'
import { computeOverlapRows } from '../../src/lib/neighborhood-aggregate'

const neighborhoods = [
  { slug: 'a', name: 'Barrio A', centroid: [0, 0] },
  { slug: 'b', name: 'Barrio B', centroid: [0, 0] },
  { slug: 'c', name: 'Barrio C', centroid: [0, 0] },
  { slug: 'z', name: 'Barrio Z', centroid: [0, 0] },
]
const zones = [
  { slug: 'a', contractCount: 2, amount: 50000 },
  { slug: 'b', contractCount: 1, amount: 10000 },
]
const quejaItems = [
  { address_string: 'a', status: 'pendiente' },
  { address_string: 'a', status: 'resuelta' },
  { address_string: 'c', status: 'pendiente' }, // gap: quejas but no situated spend
]
const instantanea = { stats: { total: quejaItems.length }, items: quejaItems }

describe('computeOverlapRows', () => {
  it('joins quejas + situated spend per barrio, sorts (quejas desc, amount desc), flags gaps', () => {
    const rows = computeOverlapRows({ neighborhoods, zones, instantanea })
    // a: 2 quejas + 50k; c: 1 queja + 0; b: 0 quejas + 10k; z: nothing (dropped)
    expect(rows.map((r) => r.slug)).toEqual(['a', 'c', 'b'])
    const c = rows.find((r) => r.slug === 'c')
    expect(c.quejas).toBe(1)
    expect(c.amount).toBe(0)
    expect(c.gap).toBe(true)
    const b = rows.find((r) => r.slug === 'b')
    expect(b.quejas).toBe(0)
    expect(b.amount).toBe(10000)
    expect(b.gap).toBe(false)
  })

  it('drops barrios with neither quejas nor situated spend', () => {
    const rows = computeOverlapRows({
      neighborhoods: [{ slug: 'z', name: 'Z' }],
      zones: [],
      instantanea: { stats: { total: 0 }, items: [] },
    })
    expect(rows).toEqual([])
  })

  /**
   * Estas cifras NO se gatean por el registro, y conviene fijarlo: `quejas` es
   * cuántas pusieron los vecinos y `gap` es si hay gasto situado allí. Ninguna
   * de las dos afirma que el ayuntamiento deba una respuesta, así que esconderlas
   * cuando nada está registrado ocultaría un dato legítimo — al contrario que
   * ✓ ⏳ ⚠, que sí son respuestas suyas.
   */
  it('sin ninguna queja registrada, el cruce sigue publicando sus cifras', () => {
    const sinRegistro = quejaItems.map((q) => ({ ...q, registered_at: null }))
    const rows = computeOverlapRows({
      neighborhoods,
      zones,
      instantanea: { stats: { total: sinRegistro.length }, items: sinRegistro },
    })
    expect(rows.find((r) => r.slug === 'a').quejas).toBe(2)
    expect(rows.find((r) => r.slug === 'c').gap).toBe(true)
  })
})
