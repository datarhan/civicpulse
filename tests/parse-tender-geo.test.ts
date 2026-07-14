import { describe, it, expect } from 'vitest'
import { matchContractsToZones, foldText } from '../src/scraper/tender-geo'
import { buildGazetteer } from '../src/scraper/place-resolver'

const ZONES = [
  { slug: 'monte-alcedo', name: 'Monte Alcedo', centroid: [39.5558, -0.5425] as [number, number] },
  {
    slug: 'urbanitzacio-valencia-la-vella',
    name: 'Urbanització València la Vella',
    centroid: [39.5344, -0.5307] as [number, number],
  },
  {
    slug: 'urbanitzacio-la-reva',
    name: 'Urbanització La Reva',
    centroid: [39.484, -0.572] as [number, number],
  },
  {
    slug: 'poligon-industrial-poio-de-reva',
    name: 'Polígon Industrial Poio de Reva',
    centroid: [39.4786, -0.5717] as [number, number],
  },
  { slug: 'el-molinet', name: 'el Molinet', centroid: [39.5544, -0.551] as [number, number] },
]
const OPTS = {
  generatedAt: '2026-06-20T00:00:00.000Z',
  tendersGeneratedAt: 't',
  geoGeneratedAt: 'g',
}

describe('scraper/tender-geo — matchContractsToZones', () => {
  it('places a contract by a zone-specific alias and records the matched alias', () => {
    const snap = matchContractsToZones(
      [
        {
          id: 'c1',
          title: 'Reurbanización Zona Verde Monte Alcedo',
          status: 'awarded',
          finalAmount: 100000,
          awardDate: '2024-05-01',
          contractType: 'construction',
          categoryTitle: 'construction',
        },
      ],
      ZONES,
      OPTS,
    )
    const a = snap.assignments.find((x) => x.id === 'c1')!
    expect(a.zones).toEqual(['monte-alcedo'])
    expect(a.matchedAlias['monte-alcedo']).toBe('monte alcedo')
    expect(snap.zones.find((z) => z.slug === 'monte-alcedo')!.amount).toBe(100000)
  })

  it('zone-locates "Residencial Reva" (sin artículo) onto urbanitzacio-la-reva', () => {
    const snap = matchContractsToZones(
      [
        {
          id: 'c-reva',
          title: 'OBRAS acometida eléctrica ascensores Residencial Reva',
          status: 'awarded',
          finalAmount: 27265,
          awardDate: '2025-08-05',
          contractType: 'construction',
          categoryTitle: 'construction',
        },
      ],
      ZONES,
      OPTS,
    )
    const a = snap.assignments.find((x) => x.id === 'c-reva')!
    expect(a.zones).toEqual(['urbanitzacio-la-reva'])
  })

  it('assigns a contract naming two zones to both, but counts it once in locatedAmount', () => {
    const snap = matchContractsToZones(
      [
        {
          id: 'c2',
          title: 'Centros Culturales en Urb. Monte Alcedo y Valencia La Vella',
          status: 'awarded',
          finalAmount: 200000,
        },
      ],
      ZONES,
      OPTS,
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
        {
          id: 'd1',
          title:
            'Alumbrado público urbanización La Reva como consecuencia del temporal de lluvias (DANA)',
          status: 'awarded',
          finalAmount: 50000,
        },
        {
          id: 'p1',
          title: 'Glorieta acceso Polígon Industrial Poio de Reva',
          status: 'awarded',
          finalAmount: 40000,
        },
      ],
      ZONES,
      OPTS,
    )
    expect(snap.assignments.find((x) => x.id === 'd1')!.zones).toEqual(['urbanitzacio-la-reva'])
    expect(snap.assignments.find((x) => x.id === 'd1')!.dana).toBe(true)
    expect(snap.assignments.find((x) => x.id === 'p1')!.zones).toEqual([
      'poligon-industrial-poio-de-reva',
    ])
    expect(snap.assignments.find((x) => x.id === 'p1')!.dana).toBe(false)
  })

  it('counts an awarded no-alias contract in the universe but not as located', () => {
    const snap = matchContractsToZones(
      [
        {
          id: 'n1',
          title: '1 vehículo híbrido todoterreno uso gabinete alcaldía',
          status: 'awarded',
          finalAmount: 30000,
        },
      ],
      ZONES,
      OPTS,
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
        {
          id: 'inprog1',
          title: 'Adecuación Senda Molinet',
          status: 'in_progress',
          finalAmount: 90000,
        },
        { id: 'open2', title: 'Servicio limpieza viaria', status: 'open', finalAmount: 50000 },
        { id: 'awz', title: 'Obras Monte Alcedo', status: 'awarded', finalAmount: 0 },
      ],
      ZONES,
      OPTS,
    )
    expect(snap.assignments.length).toBe(0)
    expect(snap.universe.totalContracts).toBe(0)
    expect(snap.universe.totalAmount).toBe(0)
  })

  it('counts full-universe awarded DANA separately from located DANA', () => {
    const snap = matchContractsToZones(
      [
        {
          id: 'dz',
          title: 'Alumbrado urbanización La Reva por DANA',
          status: 'awarded',
          finalAmount: 50000,
        },
        {
          id: 'du',
          title: 'Reparación de viales varios por el temporal de lluvias (DANA)',
          status: 'awarded',
          finalAmount: 60000,
        },
      ],
      ZONES,
      OPTS,
    )
    expect(snap.universe.danaAwardedAmount).toBe(110000) // both DANA-awarded contracts
    expect(snap.universe.danaAwardedContracts).toBe(2)
    expect(snap.universe.danaAmount).toBe(50000) // only the located one (dz)
    expect(snap.assignments.length).toBe(1) // 'du' names no zone
  })

  it('aggregates the sin-IVA (finalAmountNoTaxes) amount, matching PLACSP, not the tax-included figure', () => {
    const snap = matchContractsToZones(
      [
        {
          id: 'iva1',
          title: 'Reurbanización Zona Verde Monte Alcedo',
          status: 'awarded',
          finalAmount: 121000,
          finalAmountNoTaxes: 100000,
          awardDate: '2024-05-01',
        },
      ],
      ZONES,
      OPTS,
    )
    expect(snap.universe.totalAmount).toBe(100000)
    expect(snap.universe.locatedAmount).toBe(100000)
    expect(snap.zones.find((z) => z.slug === 'monte-alcedo')!.amount).toBe(100000)
    expect(snap.assignments.find((x) => x.id === 'iva1')!.amount).toBe(100000)
  })

  it('falls back to the tax-included amount when a contract carries no sin-IVA figure', () => {
    const snap = matchContractsToZones(
      [{ id: 'nofig', title: 'Obras Monte Alcedo', status: 'awarded', finalAmount: 50000 }],
      ZONES,
      OPTS,
    )
    expect(snap.universe.totalAmount).toBe(50000)
    expect(snap.zones.find((z) => z.slug === 'monte-alcedo')!.amount).toBe(50000)
  })

  it('foldText lowercases, strips accents, and turns apostrophes into spaces', () => {
    expect(foldText("Mas d'Escoto")).toBe('mas d escoto')
    expect(foldText('València la Vella')).toBe('valencia la vella')
  })
})

describe('scraper/tender-geo — precise placement via gazetteer', () => {
  const CANDIDATES = buildGazetteer({
    streets: [
      { slug: 'carrer-de-sagunt', name: 'Carrer de Sagunt', kind: 'calle', point: [39.55, -0.56] },
    ],
    pois: [
      {
        id: 'poi-poli',
        name: 'Polideportivo Municipal',
        category: 'deporte',
        lat: 39.54,
        lng: -0.57,
      },
    ],
    zones: ZONES.map((z) => ({ slug: z.slug, name: z.name, centroid: z.centroid })),
    zoneAliases: { 'urbanitzacio-la-reva': ['la reva'] },
  })

  it('situates a street-named contract at the street point (no barrio alias needed)', () => {
    const snap = matchContractsToZones(
      [
        {
          id: 's1',
          title: 'Obras de reurbanización en C/ Sagunt',
          status: 'awarded',
          finalAmount: 80000,
        },
      ],
      ZONES,
      OPTS,
      CANDIDATES,
    )
    const a = snap.assignments.find((x) => x.id === 's1')!
    expect(a.zones).toEqual([]) // no barrio alias
    expect(a.point).toEqual([39.55, -0.56])
    expect(a.place?.kind).toBe('street')
    expect(a.place?.name).toBe('Carrer de Sagunt')
    expect(snap.universe.situatedContracts).toBe(1)
    expect(snap.universe.situatedAmount).toBe(80000)
    expect(snap.places.find((p) => p.slug === 'carrer-de-sagunt')?.amount).toBe(80000)
  })

  it('prefers the more specific POI point over a barrio centroid', () => {
    const snap = matchContractsToZones(
      [
        {
          id: 'p1',
          title: 'Reforma pista del Polideportivo Municipal en La Reva',
          status: 'awarded',
          finalAmount: 120000,
          contractType: 'construction',
        },
      ],
      ZONES,
      OPTS,
      CANDIDATES,
    )
    const a = snap.assignments.find((x) => x.id === 'p1')!
    // Still counts toward the barrio aggregate (alias "la reva")…
    expect(a.zones).toEqual(['urbanitzacio-la-reva'])
    // …but the precise pin sits on the POI, not the barrio centroid.
    expect(a.place?.kind).toBe('poi')
    expect(a.point).toEqual([39.54, -0.57])
  })

  it('applies a curator override (LLM-suggested, human-approved) over the resolver', () => {
    const snap = matchContractsToZones(
      // A title the deterministic resolver can't situate (Mayor/Major is skipped).
      [
        {
          id: 'ov1',
          title: 'Reforma en edificio sito en C/ Mayor, 37',
          status: 'awarded',
          finalAmount: 60000,
        },
      ],
      ZONES,
      {
        ...OPTS,
        overrides: {
          ov1: {
            sourceId: 'carrer-major',
            name: 'Carrer Major',
            kind: 'street',
            point: [39.53, -0.58],
            matchedText: 'Carrer Major',
          },
        },
      },
      CANDIDATES,
    )
    const a = snap.assignments.find((x) => x.id === 'ov1')!
    expect(a.point).toEqual([39.53, -0.58])
    expect(a.place?.name).toBe('Carrer Major')
    expect(a.place?.sourceId).toBe('carrer-major')
    expect(snap.universe.situatedContracts).toBe(1)
    expect(snap.places.find((p) => p.slug === 'carrer-major')?.amount).toBe(60000)
  })

  it('leaves genuinely non-spatial contracts unplaced (no point, no zone)', () => {
    const snap = matchContractsToZones(
      [
        {
          id: 'x1',
          title: 'Servicio postal del Ayuntamiento',
          status: 'awarded',
          finalAmount: 20000,
        },
      ],
      ZONES,
      OPTS,
      CANDIDATES,
    )
    expect(snap.assignments.length).toBe(0)
    expect(snap.universe.situatedContracts).toBe(0)
    expect(snap.places.length).toBe(0)
  })
})
