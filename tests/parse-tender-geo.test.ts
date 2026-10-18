import { describe, it, expect } from 'vitest'
import {
  matchContractsToZones,
  foldText,
  ZONE_ALIASES,
  ZONE_ALIAS_EXCLUSIONS,
} from '../src/scraper/tender-geo'
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

  it('resolves a generic lot title through the parent tender objeto (parentTitle)', () => {
    // Gobierto stores the LOT name as title for multi-lot contracts ("Obra
    // completa"); the parent licitación title carries the real objeto with the
    // place. Resolution scans both; the assignment records the parent title so
    // the popup can declare why the pin sits there.
    const candidates = buildGazetteer({
      pois: [{ id: 'barranc-dels-moros', name: 'Barranc dels Moros', lat: 39.53, lng: -0.58 }],
    })
    const snap = matchContractsToZones(
      [
        {
          id: '4558191',
          title: 'Obra completa',
          parentTitle:
            'Obras Adecuación del Barranc dels Moros como itinerario turístico y peatonal (Fase I) de Riba-roja de Túria dividido en dos lotes',
          status: 'awarded',
          finalAmount: 760217,
          awardDate: '2024-12-26',
          contractType: 'construction',
          categoryTitle: 'construction',
        },
      ],
      ZONES,
      OPTS,
      candidates,
    )
    const a = snap.assignments.find((x) => x.id === '4558191')!
    expect(a.place?.sourceId).toBe('barranc-dels-moros')
    expect(a.parentTitle).toContain('Barranc dels Moros')
  })

  it('does NOT place a lot when the parent objeto names MULTIPLE places (ambiguous)', () => {
    // A multi-lot parent enumerating per-lot places ("calles X, Y… y camino
    // rural Z, dividido en dos lotes") cannot tell which place belongs to
    // which lot — an honest miss beats a wrong pin.
    const candidates = buildGazetteer({
      streets: [
        {
          slug: 'carrer-dels-furs',
          name: 'Carrer dels Furs del Regne',
          point: [39.54, -0.57] as [number, number],
        },
        {
          slug: 'carrer-de-perpinyanet',
          name: 'Carrer de Perpinyanet',
          point: [39.55, -0.56] as [number, number],
        },
      ],
    })
    const snap = matchContractsToZones(
      [
        {
          id: '4446501',
          title: 'Asfaltado camino rural.',
          parentTitle:
            'Contrato obras, proyectos Reasfaltado casco urbano calles Furs del Regne y Perpinyanet y Asfaltado camino rural Enllaç Llidona-Potros, dividido en dos lotes',
          status: 'awarded',
          finalAmount: 71264,
          awardDate: '2024-07-08',
          contractType: 'construction',
        },
      ],
      ZONES,
      OPTS,
      candidates,
    )
    expect(snap.assignments.find((x) => x.id === '4446501')?.place ?? null).toBeNull()
  })

  it('el objeto padre que nombra una calle DENTRO de su partida sí sitúa el lote', () => {
    // «Varios sitios» se cuenta después de la contención: la partida que
    // contiene a la calle no es un segundo sitio.
    const candidates = buildGazetteer({
      streets: [
        { slug: 'carrer-dolcaina', name: 'Carrer Dolçaina', point: [39.5609297, -0.5598736] },
      ],
      zones: [{ slug: 'gallipont', name: 'Gallipont', centroid: [39.55865, -0.55638] }],
      zoneAliases: { gallipont: ['Gallipont'] },
    })
    const snap = matchContractsToZones(
      [
        {
          id: 'lote-partida',
          title: 'Obra completa',
          parentTitle: 'Asfaltado C/ Dolçaina (Partida Gallipont)',
          status: 'awarded',
          finalAmount: 10000,
          awardDate: '2024-07-08',
          contractType: 'construction',
        },
      ],
      ZONES,
      OPTS,
      candidates,
    )
    expect(snap.assignments.find((x) => x.id === 'lote-partida')?.place?.sourceId).toBe(
      'carrer-dolcaina',
    )
  })

  it('74419: un título que enumera cinco zonas cuenta en cada zona pero no tiene pin', () => {
    const zonas = [
      ...ZONES,
      {
        slug: 'santa-rosa',
        name: 'Santa Rosa',
        centroid: [39.5508312, -0.5333969] as [number, number],
      },
    ]
    const candidates = buildGazetteer({
      zones: zonas,
      zoneAliases: { 'santa-rosa': ['santa rosa'], 'el-molinet': ['molinet'] },
    })
    const snap = matchContractsToZones(
      [
        {
          id: '74419',
          title:
            'Obras de ejecución de carril bici en la zona Molinet, Montealcedo, entrenaranjos, Santa Rosa y El Clot',
          status: 'awarded',
          finalAmount: 160889,
          awardDate: '2018-05-01',
          contractType: 'construction',
        },
      ],
      zonas,
      OPTS,
      candidates,
    )
    const a = snap.assignments.find((x) => x.id === '74419')!
    // El agregado por zonas no cambia: el título nombra esas zonas.
    expect(a.zones.sort()).toEqual(['el-molinet', 'santa-rosa'])
    // Pero un pin en Santa Rosa diría que el carril está allí.
    expect(a.place).toBeNull()
    expect(a.point).toBeNull()
    expect(snap.universe.situatedContracts).toBe(0)
    expect(snap.universe.situatedAmount).toBe(0)
  })

  it('the parent objeto never overrides a place the lot title names itself', () => {
    const candidates = buildGazetteer({
      pois: [{ id: 'barranc-dels-moros', name: 'Barranc dels Moros', lat: 39.53, lng: -0.58 }],
      streets: [
        {
          slug: 'carrer-de-sagunt',
          name: 'Carrer de Sagunt',
          point: [39.55, -0.56] as [number, number],
        },
      ],
    })
    const snap = matchContractsToZones(
      [
        {
          id: 'lot-own',
          title: 'Reurbanización aceras C/ Sagunt (lote 1)',
          parentTitle: 'Obras varias junto al Barranc dels Moros, dividido en dos lotes',
          status: 'awarded',
          finalAmount: 50000,
          awardDate: '2024-07-08',
          contractType: 'construction',
        },
      ],
      ZONES,
      OPTS,
      candidates,
    )
    expect(snap.assignments.find((x) => x.id === 'lot-own')?.place?.sourceId).toBe(
      'carrer-de-sagunt',
    )
  })

  it('a contract without parentTitle keeps resolving on its own title only', () => {
    const candidates = buildGazetteer({
      pois: [{ id: 'barranc-dels-moros', name: 'Barranc dels Moros', lat: 39.53, lng: -0.58 }],
    })
    const snap = matchContractsToZones(
      [
        {
          id: 'x1',
          title: 'Obra completa',
          status: 'awarded',
          finalAmount: 1000,
          awardDate: '2024-01-01',
          contractType: 'construction',
        },
      ],
      ZONES,
      OPTS,
      candidates,
    )
    expect(snap.assignments.find((x) => x.id === 'x1')).toBeUndefined()
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

  it('totalDateMin/Max abarcan TODO el universo, no sólo lo que llega al mapa', () => {
    // Un contrato situado (2020) y uno sin lugar posterior (2026): el
    // denominador suma los dos, así que su periodo debe llegar a 2026.
    const snap = matchContractsToZones(
      [
        {
          id: 'a',
          title: 'Reurbanización Zona Verde Monte Alcedo',
          status: 'awarded',
          finalAmount: 100000,
          awardDate: '2020-03-01',
          contractType: 'construction',
        },
        {
          id: 'b',
          title: 'Servicio de limpieza viaria',
          status: 'awarded',
          finalAmount: 50000,
          awardDate: '2026-10-08',
        },
      ],
      ZONES,
      OPTS,
    )
    expect(snap.assignments.map((x) => x.id)).toEqual(['a'])
    expect(snap.universe.totalDateMin).toBe('2020-03-01')
    expect(snap.universe.totalDateMax).toBe('2026-10-08')
    expect(snap.universe.dateMin).toBe('2020-03-01')
    expect(snap.universe.dateMax).toBe('2020-03-01')
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
        // Dentro de La Reva (≈0,4 km de su centroide): la regla de contención
        // sólo deja ganar al punto más preciso si cae DENTRO de la zona que el
        // título también nombra. Hasta el 17-10-2026 este fixture lo ponía a
        // 6 km, una geografía imposible que la regla anterior no miraba.
        id: 'poi-poli',
        name: 'Polideportivo Municipal',
        category: 'deporte',
        lat: 39.4875,
        lng: -0.5705,
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
    expect(a.point).toEqual([39.4875, -0.5705])
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

describe('scraper/tender-geo — el alias de el Pou d’Escoto no recoge el colegio Mas d’Escoto', () => {
  const zonas = [
    { slug: 'el-pou-d-escoto', name: "el Pou d'Escoto", centroid: [39.5484628, -0.5909944] },
    {
      slug: 'urbanitzacio-valencia-la-vella',
      name: 'Urbanització València la Vella',
      centroid: [39.5344, -0.5307],
    },
    {
      slug: 'poligono-industrial-entrevias',
      name: 'Polígono Industrial Entrevías',
      centroid: [39.53, -0.55],
    },
  ] as Array<{ slug: string; name: string; centroid: [number, number] }>
  const candidates = buildGazetteer({
    pois: [
      {
        id: 'way-903588096',
        name: 'Col·legi d’Educació Infantil i Primària Mas d’Escoto',
        category: 'educacion',
        kind: 'school',
        lat: 39.5504954,
        lng: -0.5811206,
      },
    ],
    zones: zonas,
    zoneAliases: ZONE_ALIASES,
  })
  const fila = (id: string, contractType: string, title: string) => ({
    id,
    title,
    contractType,
    status: 'awarded',
    finalAmount: 10000,
    awardDate: '2024-01-01',
  })
  const snap = matchContractsToZones(
    [
      fila('692227', 'supplies', "Sustitución campana extractora CEIP Mas d'Escoto"),
      fila(
        '1045077',
        'services',
        'Contrato de servicio de redacción de proyecto de ejecución y dirección de las obras para la construcción de Pabellón Deportivo Cubierto en CEIP Mas d’Escoto con perspectiva de género',
      ),
      fila(
        '8678128',
        'construction',
        "Contrato menor de obras para el proyecto de “Reparación y adecuación del vallado linde patio infantil colegio Mas d'Escoto con el Barranco de Porchinos por daños sufridos tras la DANA”",
      ),
      fila('632456', 'construction', "Obras de reforma de aseos en CEIP Mas d'escoto"),
      fila(
        '68394',
        'construction',
        'Urbanización de la carretera Villamarchante desde parque hasta cruce Escoto',
      ),
      fila(
        '1891608',
        'supplies',
        'Contrato para alumbrado público en acceso al Pou d’Escoto, derivado del sistema dinámico de adquisición (SDA) de suministro de material de electricidad. (Expte. 23/2022).',
      ),
      fila(
        '1554203',
        'construction',
        'Contrato de obras INSTALACION ALUMBRADO PUBLICO CARRIL BICI ESCOTO, ROTONDA ENTREVIAS Y ACCESO VALENCIA LA VELLA',
      ),
    ],
    zonas,
    OPTS,
    candidates,
  )
  const de = (id: string) => snap.assignments.find((a) => a.id === id)

  it('lo que pasa en el colegio no cuenta en la zona de la urbanización', () => {
    for (const id of ['692227', '1045077', '8678128', '632456']) {
      expect(de(id)?.zones ?? []).not.toContain('el-pou-d-escoto')
    }
    // Y sin la zona, el suministro y el servicio no llegan al mapa: la puerta
    // de obras les niega el POI del colegio.
    expect(de('692227')).toBeUndefined()
    expect(de('1045077')).toBeUndefined()
    // La obra con sigla sigue en su colegio.
    expect(de('632456')?.place?.sourceId).toBe('way-903588096')
  })

  it('«cruce Escoto» y «carril bici Escoto» no nombran la urbanización', () => {
    expect(de('68394')).toBeUndefined()
    expect(de('1554203')?.zones.sort()).toEqual([
      'poligono-industrial-entrevias',
      'urbanitzacio-valencia-la-vella',
    ])
  })

  it('«acceso al Pou d’Escoto» sigue en la zona y en su centroide', () => {
    expect(de('1891608')?.zones).toEqual(['el-pou-d-escoto'])
    expect(de('1891608')?.matchedAlias['el-pou-d-escoto']).toBe('pou d escoto')
    expect(de('1891608')?.place?.sourceId).toBe('el-pou-d-escoto')
    expect(snap.zones.find((z) => z.slug === 'el-pou-d-escoto')?.contractCount).toBe(1)
  })
})

describe('scraper/tender-geo — una zona que el resolutor no ve también cuenta como sitio', () => {
  // «valencia la vella» no pasa needleDistinctive («valencia» es del municipio,
  // «vella» es palabra común), así que el resolutor no la ve; la capa de zonas,
  // sí. Un título que nombra otra zona más tenía pin en la que sí veía.
  const zonas = [
    ...ZONES,
    {
      slug: 'poligono-industrial-entrevias',
      name: 'Polígono Industrial Entrevías',
      centroid: [39.5405303, -0.5508958] as [number, number],
    },
  ]
  const candidates = buildGazetteer({
    streets: [
      {
        slug: 'passeig-del-molinet',
        name: 'Passeig del Molinet',
        kind: 'calle',
        point: [39.5557928, -0.5531642],
      },
    ],
    zones: zonas,
    zoneAliases: ZONE_ALIASES,
  })
  const obra = (id: string, title: string) => ({
    id,
    title,
    contractType: 'construction',
    status: 'formalized',
    finalAmount: 10000,
    awardDate: '2024-01-01',
  })
  const snap = matchContractsToZones(
    [
      obra(
        '96520',
        'contrato de obras de colocación de Centros Culturales e instalaciones al servicio de las Urbanizaciones Monte Alcedo y Valencia La Vella, por procedimiento abierto, simplificado mejor relación calidad-precio, varios criterios de adjudicación con cláusulas medioambientales como criterio de adjudicación y con condición especial de ejecución de carácter medioambiental.',
      ),
      obra(
        '1554203',
        'Contrato de obras INSTALACION ALUMBRADO PUBLICO CARRIL BICI ESCOTO, ROTONDA ENTREVIAS Y ACCESO VALENCIA LA VELLA por procedimiento abierto súper simplificado, varios criterios de adjudicación, con condición de ejecución de carácter social y medioambiental contribuyendo al cumplimiento del ODS 8 relativo al trabajo decente para todos.',
      ),
      obra('1999#2', 'Adecuación Paseo Molinet'),
    ],
    zonas,
    OPTS,
    candidates,
  )
  const de = (id: string) => snap.assignments.find((a) => a.id === id)!

  it('dos urbanizaciones a 2,6 km no se pinchan en una (96520)', () => {
    expect(de('96520').zones.sort()).toEqual(['monte-alcedo', 'urbanitzacio-valencia-la-vella'])
    expect(de('96520').place).toBeNull()
  })

  it('la rotonda de Entrevías y el acceso a València la Vella no se pinchan en Entrevías (1554203)', () => {
    expect(de('1554203').zones.sort()).toEqual([
      'poligono-industrial-entrevias',
      'urbanitzacio-valencia-la-vella',
    ])
    expect(de('1554203').place).toBeNull()
  })

  it('una calle DENTRO de la zona que el título también nombra sigue pinchada (1999#2)', () => {
    expect(de('1999#2').zones).toEqual(['el-molinet'])
    expect(de('1999#2').place?.sourceId).toBe('passeig-del-molinet')
  })
})

describe('scraper/tender-geo — el yacimiento de València la Vella no es la urbanización', () => {
  // El yacimiento visigodo (BIC, «Zona arqueològica», OSM way 1176535578) tiene su
  // propio polígono a 0,72 km del centroide de la urbanización: dentro del radio
  // de contención, así que la exclusión es explícita (ZONE_ALIAS_EXCLUSIONS).
  const zonas = [
    ...ZONES,
    {
      slug: 'urbanitzacio-valencia-la-vella',
      name: 'Urbanització València la Vella',
      centroid: [39.5344276, -0.5307458] as [number, number],
    },
  ]
  const candidates = buildGazetteer({
    zones: zonas,
    zoneAliases: ZONE_ALIASES,
    zoneAliasExclusions: ZONE_ALIAS_EXCLUSIONS,
  })
  const fila = (id: string, contractType: string, title: string) => ({
    id,
    title,
    contractType,
    status: 'awarded',
    finalAmount: 10000,
    awardDate: '2024-01-01',
  })
  const snap = matchContractsToZones(
    [
      fila(
        '2739773',
        'supplies',
        'Contrato menor de suministro de material e instalación del sistema de cctv de vigilancia para parte del perímetro del yacimiento arqueológico de Valencia la Vella, en el municipio de Riba-roja de Túria.',
      ),
      fila(
        '1520813',
        'supplies',
        'Contrato de suministro de paneles individuales de acceso para el yacimiento arqueológico de Valencia la vella destinado al departamento de Turismo, por procedimiento abierto súper simplificado, mejor relación calidad-precio, un único criterio de adjudicación',
      ),
      fila(
        '4718569',
        'services',
        'Contrato, de carácter menor, para la prestación del servicio realización del Plan especial de protección para la zona arqueológica de Valencia la Vella de Riba-roja de Túria (Ctto 180M/2023).',
      ),
      fila(
        '5106922',
        'construction',
        'Contrato administrativo obras para la ejecución del proyecto Área de esparcimiento en zona verde de Valencia la Vella en el T. M. de Riba-roja de Túria (Valencia) - Ctto.39/2026',
      ),
      fila(
        '96520',
        'construction',
        'contrato de obras de colocación de Centros Culturales e instalaciones al servicio de las Urbanizaciones Monte Alcedo y Valencia La Vella, por procedimiento abierto',
      ),
    ],
    zonas,
    OPTS,
    candidates,
  )
  const de = (id: string) => snap.assignments.find((a) => a.id === id)

  it('lo que nombra el yacimiento no cuenta en la zona ni se pincha en la urbanización', () => {
    // Su único sitio era la zona: sin ella, no llegan al mapa.
    expect(de('2739773')).toBeUndefined()
    expect(de('1520813')).toBeUndefined()
    expect(de('4718569')).toBeUndefined()
  })

  it('la urbanización sigue recogiendo lo que la nombra (5106922, 96520)', () => {
    expect(de('5106922')?.zones).toEqual(['urbanitzacio-valencia-la-vella'])
    expect(de('5106922')?.place?.sourceId).toBe('urbanitzacio-valencia-la-vella')
    expect(de('96520')?.zones.sort()).toEqual(['monte-alcedo', 'urbanitzacio-valencia-la-vella'])
    expect(snap.zones.find((z) => z.slug === 'urbanitzacio-valencia-la-vella')?.contractCount).toBe(
      2,
    )
  })

  it('la exclusión es una frase, no una palabra: no tapa la urbanización en otro tramo', () => {
    const s = matchContractsToZones(
      [
        fila(
          'x',
          'construction',
          'Camino desde la urbanización Valencia la Vella hasta el yacimiento arqueológico de Valencia la Vella',
        ),
      ],
      zonas,
      OPTS,
      candidates,
    )
    expect(s.assignments[0]?.zones).toEqual(['urbanitzacio-valencia-la-vella'])
  })
})
