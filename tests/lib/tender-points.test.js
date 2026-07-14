import { describe, it, expect } from 'vitest'
import { placeAmountsAt } from '../../src/lib/tender-points'

const A = (over) => ({
  id: over.id,
  amount: over.amount,
  date: 'date' in over ? over.date : '2024-01-01',
  dana: over.dana ?? false,
  contractType: over.contractType,
  point: over.point ?? [39.5, -0.5],
  place: over.place ?? { kind: 'street', name: 'Carrer X', matchedText: 'Carrer X', sourceId: 'x' },
})

describe('lib/tender-points — placeAmountsAt', () => {
  it('groups assignments by place, summing amount and count', () => {
    const m = placeAmountsAt([
      A({ id: '1', amount: 100 }),
      A({ id: '2', amount: 50 }),
      A({
        id: '3',
        amount: 30,
        point: [39.6, -0.6],
        place: { kind: 'poi', name: 'CEIP', matchedText: 'CEIP', sourceId: 'ceip' },
      }),
    ])
    expect(m.get('x')).toMatchObject({ amount: 150, count: 2, point: [39.5, -0.5], kind: 'street' })
    expect(m.get('ceip')).toMatchObject({ amount: 30, count: 1, kind: 'poi', name: 'CEIP' })
  })

  it('is cumulative up to the timeline cursor `at` (excludes later dates)', () => {
    const m = placeAmountsAt(
      [
        A({ id: '1', amount: 100, date: '2020-01-01' }),
        A({ id: '2', amount: 50, date: '2025-01-01' }),
      ],
      { at: new Date('2022-01-01').getTime() },
    )
    expect(m.get('x')?.amount).toBe(100)
    expect(m.get('x')?.count).toBe(1)
  })

  it('restricts to DANA when danaOnly is set', () => {
    const m = placeAmountsAt(
      [A({ id: '1', amount: 100, dana: false }), A({ id: '2', amount: 50, dana: true })],
      { danaOnly: true },
    )
    expect(m.get('x')?.amount).toBe(50)
    expect(m.get('x')?.dana).toBe(true)
  })

  it('restricts to construction contracts when obrasOnly is set', () => {
    const m = placeAmountsAt(
      [
        A({ id: '1', amount: 100, contractType: 'services' }),
        A({ id: '2', amount: 50, contractType: 'construction' }),
        A({ id: '3', amount: 25 }), // no contractType at all → excluded under the filter
      ],
      { obrasOnly: true },
    )
    expect(m.get('x')?.amount).toBe(50)
    expect(m.get('x')?.count).toBe(1)
  })

  it('obrasOnly composes with danaOnly (both must hold)', () => {
    const m = placeAmountsAt(
      [
        A({ id: '1', amount: 100, contractType: 'construction', dana: false }),
        A({ id: '2', amount: 50, contractType: 'construction', dana: true }),
        A({ id: '3', amount: 25, contractType: 'services', dana: true }),
      ],
      { obrasOnly: true, danaOnly: true },
    )
    expect(m.get('x')?.amount).toBe(50)
  })

  it('excludes undated assignments (no position on the timeline)', () => {
    const m = placeAmountsAt([A({ id: '1', amount: 100, date: null })])
    expect(m.size).toBe(0)
  })

  it('ignores zone-only assignments that have no precise point/place', () => {
    const m = placeAmountsAt([
      {
        id: 'z',
        amount: 100,
        date: '2024-01-01',
        dana: false,
        point: null,
        place: null,
        zones: ['b'],
      },
    ])
    expect(m.size).toBe(0)
  })

  it('returns an empty map for empty/nullish input', () => {
    expect(placeAmountsAt([]).size).toBe(0)
    expect(placeAmountsAt(null).size).toBe(0)
  })
})
