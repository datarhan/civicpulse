import { describe, it, expect } from 'vitest'
import { placeAmountsAt, obrasWithoutMoneyPin } from '../../src/lib/tender-points'

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

describe('obrasWithoutMoneyPin — no double pin for the same work', () => {
  // 6 of the 11 located obras sit on the SAME point as a contract from the
  // registry ("Asfaltado Traver", "Aparcamiento Pacadar", "Pla Edificant CEIP
  // ERES ALTES"…). Painting both layers together would show two markers, with
  // two different amounts, for one piece of work — exactly the kind of
  // double-count this project's honesty gates exist to prevent.
  const places = [
    { slug: 'traver', point: [39.5468, -0.582] },
    { slug: 'mayor', point: [39.54, -0.57] },
  ]

  it('drops an obra that already has a money pin at its point', () => {
    const obras = [{ id: 'o1', nombre: 'Asfaltado Traver', lat: 39.5468, lng: -0.582 }]
    expect(obrasWithoutMoneyPin(obras, places)).toEqual([])
  })

  it('keeps an obra the contract registry never placed', () => {
    const obras = [{ id: 'o2', nombre: 'Obra sin contrato situado', lat: 39.52, lng: -0.6 }]
    expect(obrasWithoutMoneyPin(obras, places).map((o) => o.id)).toEqual(['o2'])
  })

  it('tolerates sub-metre coordinate drift between the two sources', () => {
    // The gazetteer point and the resolver point come from the same OSM node
    // but round-trip through different pipelines.
    const obras = [{ id: 'o3', lat: 39.54680004, lng: -0.58200002 }]
    expect(obrasWithoutMoneyPin(obras, places)).toEqual([])
  })

  it('drops obras with no usable coordinates rather than guessing', () => {
    const obras = [{ id: 'a' }, { id: 'b', lat: 39.52, lng: null }, { id: 'c', lat: 'x', lng: 'y' }]
    expect(obrasWithoutMoneyPin(obras, places)).toEqual([])
  })

  it('is total on empty/missing inputs', () => {
    expect(obrasWithoutMoneyPin(null, places)).toEqual([])
    expect(obrasWithoutMoneyPin([{ id: 'o', lat: 1, lng: 2 }], null).map((o) => o.id)).toEqual([
      'o',
    ])
    expect(obrasWithoutMoneyPin(undefined, undefined)).toEqual([])
  })
})
