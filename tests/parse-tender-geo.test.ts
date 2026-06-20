import { describe, it, expect } from 'vitest'
import { matchContractsToZones, foldText } from '../src/scraper/tender-geo'

const ZONES = [
  { slug: 'monte-alcedo', name: 'Monte Alcedo', centroid: [39.5558, -0.5425] as [number, number] },
  { slug: 'urbanitzacio-valencia-la-vella', name: 'Urbanització València la Vella', centroid: [39.5344, -0.5307] as [number, number] },
  { slug: 'urbanitzacio-la-reva', name: 'Urbanització La Reva', centroid: [39.4840, -0.5720] as [number, number] },
  { slug: 'poligon-industrial-poio-de-reva', name: 'Polígon Industrial Poio de Reva', centroid: [39.4786, -0.5717] as [number, number] },
  { slug: 'el-molinet', name: 'el Molinet', centroid: [39.5544, -0.5510] as [number, number] },
]
const OPTS = { generatedAt: '2026-06-20T00:00:00.000Z', tendersGeneratedAt: 't', geoGeneratedAt: 'g' }

describe('scraper/tender-geo — matchContractsToZones', () => {
  it('places a contract by a zone-specific alias and records the matched alias', () => {
    const snap = matchContractsToZones(
      [{ id: 'c1', title: 'Reurbanización Zona Verde Monte Alcedo', status: 'awarded', finalAmount: 100000, awardDate: '2024-05-01', contractType: 'construction', categoryTitle: 'construction' }],
      ZONES, OPTS,
    )
    const a = snap.assignments.find((x) => x.id === 'c1')!
    expect(a.zones).toEqual(['monte-alcedo'])
    expect(a.matchedAlias['monte-alcedo']).toBe('monte alcedo')
    expect(snap.zones.find((z) => z.slug === 'monte-alcedo')!.amount).toBe(100000)
  })

  it('assigns a contract naming two zones to both, but counts it once in locatedAmount', () => {
    const snap = matchContractsToZones(
      [{ id: 'c2', title: 'Centros Culturales en Urb. Monte Alcedo y Valencia La Vella', status: 'awarded', finalAmount: 200000 }],
      ZONES, OPTS,
    )
    const a = snap.assignments.find((x) => x.id === 'c2')!
    expect(a.zones.sort()).toEqual(['monte-alcedo', 'urbanitzacio-valencia-la-vella'])
    expect(snap.universe.locatedAmount).toBe(200000) // counted once
    expect(snap.zones.find((z) => z.slug === 'monte-alcedo')!.amount).toBe(200000) // in both
    expect(snap.zones.find((z) => z.slug === 'urbanitzacio-valencia-la-vella')!.amount).toBe(200000)
  })

  it('flags DANA works and never confuses La Reva with Poio de Reva', () => {
    const snap = matchContractsToZones(
      [
        { id: 'd1', title: 'Alumbrado público urbanización La Reva como consecuencia del temporal de lluvias (DANA)', status: 'awarded', finalAmount: 50000 },
        { id: 'p1', title: 'Glorieta acceso Polígon Industrial Poio de Reva', status: 'awarded', finalAmount: 40000 },
      ],
      ZONES, OPTS,
    )
    expect(snap.assignments.find((x) => x.id === 'd1')!.zones).toEqual(['urbanitzacio-la-reva'])
    expect(snap.assignments.find((x) => x.id === 'd1')!.dana).toBe(true)
    expect(snap.assignments.find((x) => x.id === 'p1')!.zones).toEqual(['poligon-industrial-poio-de-reva'])
    expect(snap.assignments.find((x) => x.id === 'p1')!.dana).toBe(false)
  })

  it('counts an awarded no-alias contract in the universe but not as located', () => {
    const snap = matchContractsToZones(
      [{ id: 'n1', title: '1 vehículo híbrido todoterreno uso gabinete alcaldía', status: 'awarded', finalAmount: 30000 }],
      ZONES, OPTS,
    )
    expect(snap.assignments.length).toBe(0)
    expect(snap.universe.totalContracts).toBe(1)
    expect(snap.universe.totalAmount).toBe(30000)
    expect(snap.universe.locatedAmount).toBe(0)
  })

  it('excludes non-awarded contracts and awarded-with-zero-final from the universe', () => {
    const snap = matchContractsToZones(
      [
        { id: 'open1', title: 'Obras en urbanización La Reva', status: 'open', finalAmount: 0 },
        { id: 'inprog1', title: 'Adecuación Senda Molinet', status: 'in_progress', finalAmount: 90000 },
        { id: 'open2', title: 'Servicio limpieza viaria', status: 'open', finalAmount: 50000 },
        { id: 'awz', title: 'Obras Monte Alcedo', status: 'awarded', finalAmount: 0 },
      ],
      ZONES, OPTS,
    )
    expect(snap.assignments.length).toBe(0)
    expect(snap.universe.totalContracts).toBe(0)
    expect(snap.universe.totalAmount).toBe(0)
  })

  it('foldText lowercases, strips accents, and turns apostrophes into spaces', () => {
    expect(foldText("Mas d'Escoto")).toBe('mas d escoto')
    expect(foldText('València la Vella')).toBe('valencia la vella')
  })
})
