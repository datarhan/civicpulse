import { describe, it, expect } from 'vitest'
import {
  foldTitle,
  streetCore,
  buildGazetteer,
  resolvePlace,
  resolveUnambiguousPlace,
  matchNameToGazetteer,
  type Candidate,
} from '../src/scraper/place-resolver'
import { ZONE_ALIASES } from '../src/scraper/tender-geo'

// Gazetteer for the fuzzy LLM-name matcher (needles unused — it matches on the
// candidate NAME, since the LLM already vetted that a place is referenced).
const NAME_CANDS: Candidate[] = [
  {
    kind: 'poi',
    name: 'CEIP Camp de Túria',
    point: [39.54, -0.57],
    sourceId: 'poi-ceip',
    needles: [],
    specificity: 4,
  },
  {
    kind: 'street',
    name: 'Carrer Major',
    point: [39.53, -0.58],
    sourceId: 'carrer-major',
    needles: [],
    specificity: 3,
  },
  {
    kind: 'street',
    name: 'Carrer de Sagunt',
    point: [39.55, -0.56],
    sourceId: 'carrer-de-sagunt',
    needles: [],
    specificity: 3,
  },
  {
    kind: 'urbanizacion',
    name: 'Urbanització La Reva',
    point: [39.5, -0.6],
    sourceId: 'la-reva',
    needles: [],
    specificity: 2,
  },
]

describe('place-resolver — matchNameToGazetteer (LLM name → real point)', () => {
  it('matches a cross-language name (Calle Mayor → Carrer Major) via edit distance', () => {
    const m = matchNameToGazetteer('Calle Mayor', NAME_CANDS)
    expect(m?.sourceId).toBe('carrer-major')
    expect(m?.point).toEqual([39.53, -0.58])
  })

  it('matches an inflected toponym (Sagunto → Carrer de Sagunt)', () => {
    expect(matchNameToGazetteer('Sagunto', NAME_CANDS)?.sourceId).toBe('carrer-de-sagunt')
  })

  it('matches a POI by its distinctive core', () => {
    expect(matchNameToGazetteer('Camp de Túria', NAME_CANDS)?.kind).toBe('poi')
    expect(matchNameToGazetteer('CEIP Camp de Túria', NAME_CANDS)?.sourceId).toBe('poi-ceip')
  })

  it('matches an urbanización name', () => {
    expect(matchNameToGazetteer('La Reva', NAME_CANDS)?.sourceId).toBe('la-reva')
  })

  it('returns null for a place not in the gazetteer', () => {
    expect(matchNameToGazetteer('Calle Inexistente', NAME_CANDS)).toBeNull()
  })

  it('returns null for a municipality/province-only name (not a locator)', () => {
    expect(matchNameToGazetteer('Riba-roja de Túria', NAME_CANDS)).toBeNull()
    expect(matchNameToGazetteer('València', NAME_CANDS)).toBeNull()
  })

  it('is empty/null safe', () => {
    expect(matchNameToGazetteer('', NAME_CANDS)).toBeNull()
    expect(matchNameToGazetteer(null, NAME_CANDS)).toBeNull()
    expect(matchNameToGazetteer('Carrer Major', [])).toBeNull()
  })

  it('the coordinate always comes from the gazetteer, never fabricated', () => {
    const m = matchNameToGazetteer('calle mayor 37', NAME_CANDS)
    // Even with a house number in the LLM name, the point is the OSM street point.
    expect(m?.point).toEqual([39.53, -0.58])
  })

  it('matches a facility across its type word (CEIP → Col·legi …, distinctive name)', () => {
    const cands: Candidate[] = [
      {
        kind: 'poi',
        name: "Col·legi d'Educació Infantil i Primària Cervantes",
        point: [39.54, -0.57],
        sourceId: 'ceip-cervantes',
        needles: [],
        specificity: 4,
      },
      {
        kind: 'poi',
        name: 'Complex Esportiu La Mallà',
        point: [39.55, -0.58],
        sourceId: 'complex-malla',
        needles: [],
        specificity: 4,
      },
    ]
    // "CEIP Cervantes" (Spanish acronym) → OSM "Col·legi … Cervantes" (Valencian).
    expect(matchNameToGazetteer('CEIP Cervantes', cands)?.sourceId).toBe('ceip-cervantes')
    // "Complejo deportivo La Malla" → "Complex Esportiu La Mallà" (type word differs).
    expect(matchNameToGazetteer('Complejo deportivo La Malla', cands)?.sourceId).toBe(
      'complex-malla',
    )
  })

  it('matches a cross-language school name (CEIP Eras Altas → Eres Altes)', () => {
    const cands: Candidate[] = [
      {
        kind: 'poi',
        name: "Col·legi d'Educació Infantil i Primària Eres Altes",
        point: [39.54, -0.57],
        sourceId: 'ceip-eres-altes',
        needles: [],
        specificity: 4,
      },
    ]
    expect(matchNameToGazetteer('CEIP Eras Altas', cands)?.sourceId).toBe('ceip-eres-altes')
  })

  it('still returns null for a bare facility type with no distinctive name', () => {
    const cands: Candidate[] = [
      {
        kind: 'poi',
        name: 'Poliesportiu Municipal de Riba-Roja de Túria',
        point: [39.54, -0.57],
        sourceId: 'poli',
        needles: [],
        specificity: 4,
        // No osmKind → not eligible for the singleton facility fallback.
      },
    ]
    // "Polideportivo Municipal" strips to nothing distinctive → no confident match.
    expect(matchNameToGazetteer('Polideportivo Municipal', cands)).toBeNull()
  })

  const FACILITY_CANDS: Candidate[] = [
    {
      kind: 'poi',
      name: 'Ajuntament de Riba-roja de Túria',
      point: [39.54, -0.56],
      sourceId: 'townhall',
      needles: [],
      specificity: 4,
      osmKind: 'townhall',
    },
    {
      kind: 'poi',
      name: 'Cementerio de San Jaime',
      point: [39.47, -0.58],
      sourceId: 'cem',
      needles: [],
      specificity: 4,
      osmKind: 'cemetery',
    },
    {
      kind: 'poi',
      name: 'Biblioteca Pública',
      point: [39.54, -0.56],
      sourceId: 'lib',
      needles: [],
      specificity: 4,
      osmKind: 'library',
    },
  ]

  it('matches a generic facility to the town singleton (Cementerio municipal → the one cemetery)', () => {
    expect(matchNameToGazetteer('Cementerio municipal', FACILITY_CANDS)?.sourceId).toBe('cem')
  })

  it('maps Ayuntamiento / Casa Consistorial to the single townhall', () => {
    expect(matchNameToGazetteer('Ayuntamiento', FACILITY_CANDS)?.sourceId).toBe('townhall')
    expect(matchNameToGazetteer('Casa Consistorial', FACILITY_CANDS)?.sourceId).toBe('townhall')
  })

  it('does NOT singleton-match when a facility type has several instances (ambiguous)', () => {
    const two = [
      ...FACILITY_CANDS,
      {
        kind: 'poi' as const,
        name: 'Cementerio Viejo',
        point: [39.48, -0.59] as [number, number],
        sourceId: 'cem2',
        needles: [],
        specificity: 4,
        osmKind: 'cemetery',
      },
    ]
    expect(matchNameToGazetteer('Cementerio municipal', two)).toBeNull()
  })

  it('bridges Spanish↔Valencian synonyms too far for an edit (Paz→Pau, Castaño→Castanyer)', () => {
    const cands: Candidate[] = [
      {
        kind: 'street',
        name: 'Avinguda de la Pau',
        point: [39.54, -0.57],
        sourceId: 'pau',
        needles: [],
        specificity: 3,
      },
      {
        kind: 'street',
        name: 'Avinguda del Castanyer',
        point: [39.55, -0.58],
        sourceId: 'castanyer',
        needles: [],
        specificity: 3,
      },
    ]
    expect(matchNameToGazetteer('Avenida de la Paz', cands)?.sourceId).toBe('pau')
    expect(matchNameToGazetteer('Avenida Castaño', cands)?.sourceId).toBe('castanyer')
    // A non-synonym distinct word still misses.
    expect(matchNameToGazetteer('Avenida de la Guerra', cands)).toBeNull()
  })

  it('a distinctive proper-noun name still wins over the facility fallback', () => {
    // "Biblioteca Cervantes" has a proper noun → proper-noun path (no such
    // candidate here) rather than blindly hitting the singleton library.
    const m = matchNameToGazetteer('Cervantes', FACILITY_CANDS)
    expect(m).toBeNull() // no "Cervantes" facility → not force-mapped to the library
  })
})

describe('place-resolver — foldTitle', () => {
  it('folds accents, case and punctuation to space-separated tokens', () => {
    expect(foldTitle('Reforma en C/ Mayor, 37')).toBe('reforma en c mayor 37')
    expect(foldTitle('Camí de Xest (tramo 2)')).toBe('cami de xest tramo 2')
  })

  it('funde las siglas con puntos en un token («C.D.» no es «C/»)', () => {
    // «C.D. La Mallá» se plegaba a «c d la malla», y la «c» suelta cuenta como
    // indicador de calle: el contrato 85485 acabó en «Carrer de la Piscina».
    expect(foldTitle('Servicio de limpieza del C.D. La Mallá')).toBe(
      'servicio de limpieza del cd la malla',
    )
    expect(foldTitle('C/Mas de Montes en P.I. Mas de Balo.')).toBe(
      'c mas de montes en pi mas de balo',
    )
    expect(foldTitle('Obras en el C.E.I.P. Cervantes')).toBe('obras en el ceip cervantes')
    expect(foldTitle('eficiencia energética en C.E.I.P Eres Altes')).toBe(
      'eficiencia energetica en ceip eres altes',
    )
    expect(foldTitle('bar C.D La Mallá')).toBe('bar cd la malla')
    // La letra de una meta ODS («meta 9.5.c») tampoco es una «C/».
    expect(foldTitle('en relación a la meta 9.5.c para')).toBe('en relacion a la meta 9 5c para')
    // Una abreviatura suelta no es una sigla: «C/» y «Ctra.» siguen igual.
    expect(foldTitle('Ctra. Vilamarxant a C/ Sagunt')).toBe('ctra vilamarxant a c sagunt')
  })
})

describe('place-resolver — streetCore', () => {
  it('strips the leading street type + connectors, leaving the distinctive core', () => {
    expect(streetCore('carrer de sagunt')).toBe('sagunt')
    expect(streetCore('avinguda del camp de turia')).toBe('camp de turia')
    expect(streetCore('cami dels pagos')).toBe('pagos')
    expect(streetCore('carretera de vilamarxant')).toBe('vilamarxant')
  })
})

// Small hand-built gazetteer for deterministic resolver tests.
const CANDS: Candidate[] = [
  {
    kind: 'poi',
    name: 'CEIP Camp de Túria',
    point: [39.54, -0.57],
    sourceId: 'poi-ceip',
    needles: ['ceip camp de turia', 'camp de turia'],
    specificity: 4,
  },
  {
    kind: 'street',
    name: 'Carrer de Sagunt',
    point: [39.55, -0.56],
    sourceId: 'carrer-de-sagunt',
    needles: ['carrer de sagunt', 'sagunt'],
    specificity: 3,
  },
  {
    kind: 'street',
    name: 'Carrer Major',
    point: [39.53, -0.58],
    sourceId: 'carrer-major',
    // "major" is a short common core → intentionally NOT a needle (under-match).
    needles: ['carrer major'],
    specificity: 3,
  },
  {
    kind: 'urbanizacion',
    name: 'Urbanització La Reva',
    point: [39.5, -0.6],
    sourceId: 'urbanitzacio-la-reva',
    needles: ['la reva'],
    specificity: 2,
  },
  {
    kind: 'barrio',
    name: 'Barri del Castell',
    point: [39.545, -0.571],
    sourceId: 'barri-del-castell',
    needles: ['barri del castell', 'castell'],
    specificity: 1,
  },
]

describe('place-resolver — resolvePlace', () => {
  it('places a contract at a named street (toponym core)', () => {
    const m = resolvePlace(foldTitle('Obras de reurbanización en C/ Sagunt'), CANDS)
    expect(m?.kind).toBe('street')
    expect(m?.name).toBe('Carrer de Sagunt')
    expect(m?.point).toEqual([39.55, -0.56])
  })

  it('prefers the more specific POI over a barrio when both match', () => {
    const m = resolvePlace(
      foldTitle('Pavimentación pista deportiva CEIP Camp de Túria (Barri del Castell)'),
      CANDS,
    )
    expect(m?.kind).toBe('poi')
    expect(m?.name).toBe('CEIP Camp de Túria')
  })

  it('prefers a street over an urbanización when both match', () => {
    const m = resolvePlace(foldTitle('Asfaltado C/ Sagunt en La Reva'), CANDS)
    expect(m?.kind).toBe('street')
  })

  it('falls back to the barrio when only the barrio name is present', () => {
    const m = resolvePlace(foldTitle('Mejora del alumbrado en el Barri del Castell'), CANDS)
    expect(m?.kind).toBe('barrio')
  })

  it('does NOT match a short common street core (Mayor/Major) — conservative', () => {
    const m = resolvePlace(foldTitle('Reforma en C/ Mayor, 37'), CANDS)
    expect(m).toBeNull()
  })

  it('returns null for a non-spatial service contract', () => {
    expect(resolvePlace(foldTitle('Servicio postal del Ayuntamiento'), CANDS)).toBeNull()
    expect(resolvePlace(foldTitle('Taller de pilates y suelo pélvico'), CANDS)).toBeNull()
  })

  it('accepts the plural street indicator ("calles X, Y") — PLACSP objetos enumerate streets', () => {
    const cands: Candidate[] = [
      {
        kind: 'street',
        name: 'Carrer de Luis Santàngel',
        point: [39.54, -0.57],
        sourceId: 'carrer-de-luis-santangel',
        needles: ['luis santangel'],
        specificity: 3,
      },
    ]
    const m = resolvePlace(
      foldTitle('Reasfaltado casco urbano calles Furs del Regne, Luis Santangel y Lepanto'),
      cands,
    )
    expect(m?.sourceId).toBe('carrer-de-luis-santangel')
  })

  it('requires a street-type word in the title to trust a street match (toponym guard)', () => {
    const cands: Candidate[] = [
      {
        kind: 'street',
        name: 'Carrer de València',
        point: [39.5, -0.5],
        sourceId: 'carrer-de-valencia',
        needles: ['valencia'],
        specificity: 3,
      },
    ]
    // "Valencia" as a generic toponym, no street word → no placement.
    expect(
      resolvePlace(foldTitle('Subvención de la Generalitat Valenciana en Valencia'), cands),
    ).toBeNull()
    // Same toponym, now clearly a street → placed.
    expect(resolvePlace(foldTitle('Asfaltado en C/ València'), cands)?.kind).toBe('street')
  })

  it('only trusts a POI match for works contracts (allowPoi gate)', () => {
    const cands: Candidate[] = [
      {
        kind: 'poi',
        name: 'Policía Local',
        point: [39.5, -0.5],
        sourceId: 'poi-policia',
        needles: ['policia local'],
        specificity: 4,
      },
    ]
    // Supplies FOR the department → not located at the building.
    expect(
      resolvePlace(foldTitle('Suministro de armas para la Policía Local'), cands, {
        allowPoi: false,
      }),
    ).toBeNull()
    // Works ON the building → placed.
    expect(
      resolvePlace(foldTitle('Reforma del edificio de la Policía Local'), cands, { allowPoi: true })
        ?.kind,
    ).toBe('poi')
  })

  it('«C.D. La Mallá» no da permiso de calle a «piscina» ni a «Mallà» (85485)', () => {
    const cands: Candidate[] = [
      {
        kind: 'street',
        name: 'Carrer de la Piscina',
        point: [39.5518584, -0.5277984],
        sourceId: 'carrer-de-la-piscina',
        needles: ['carrer de la piscina', 'piscina'],
        specificity: 3,
      },
      {
        kind: 'street',
        name: 'Carrer de la Mallà',
        point: [39.5468976, -0.5820025],
        sourceId: 'carrer-de-la-malla',
        needles: ['carrer de la malla', 'malla'],
        specificity: 3,
      },
    ]
    const titulo = 'Servicio de limpieza de piscina cubierta y demás dependencias del C.D. La Mallá'
    expect(resolvePlace(foldTitle(titulo), cands)).toBeNull()
  })

  it('records provenance (matchedText) for the map disclosure', () => {
    const m = resolvePlace(foldTitle('Obras en Camino dels Pagos'), [
      {
        kind: 'street',
        name: 'Camí dels Pagos',
        point: [39.52, -0.59],
        sourceId: 'cami-dels-pagos',
        needles: ['cami dels pagos', 'pagos'],
        specificity: 3,
      },
    ])
    expect(m?.matchedText).toBeTruthy()
  })
})

describe('place-resolver — buildGazetteer', () => {
  const gaz = buildGazetteer({
    streets: [
      { slug: 'carrer-de-sagunt', name: 'Carrer de Sagunt', kind: 'calle', point: [39.55, -0.56] },
    ],
    pois: [
      { id: 'poi-1', name: 'Polideportivo Municipal', category: 'deporte', lat: 39.54, lng: -0.57 },
    ],
    zones: [{ slug: 'la-reva', name: 'La Reva', centroid: [39.5, -0.6] }],
    zoneAliases: { 'la-reva': ['la reva'] },
  })

  it('emits candidates across every kind with folded needles + points', () => {
    const kinds = new Set(gaz.map((c) => c.kind))
    expect(kinds.has('poi')).toBe(true)
    expect(kinds.has('street')).toBe(true)
    expect(kinds.has('urbanizacion')).toBe(true)
    expect(kinds.has('barrio')).toBe(true)
    for (const c of gaz) {
      expect(c.needles.length).toBeGreaterThan(0)
      expect(Array.isArray(c.point)).toBe(true)
    }
  })

  it('resolves a real title end-to-end through the built gazetteer', () => {
    const m = resolvePlace(foldTitle('Obras de mejora en C/ Sagunt'), gaz)
    expect(m?.kind).toBe('street')
  })
})

// 2026-10-17 — auditoría de lugares sin situar. Títulos REALES de
// public/data/tenders.json que nombran un sitio que el nomenclátor sí tiene y que
// el resolutor determinista no alcanzaba. Cada caso trae su contraprueba: la
// puerta que lo vuelve fiable sigue cerrando.
describe('place-resolver — «poli-deportivo» no es el pabellón (4863213)', () => {
  // El 18-10-2026, al rehacer el mapa de /reportajes/reconstruccion-dana: el
  // contrato DANA de 114.211 € «cambio de pavimento de las pistas del
  // poli-deportivo municipal» estaba pinchado en el Pavelló, a unos 600 m del
  // Poliesportiu. El alias «Pabellón deportivo municipal» dejaba, sin su
  // «pabellón», la aguja «deportivo municipal», y el guion de «poli-deportivo»
  // la destapaba. Era el segundo lugar con más gasto DANA situado.
  const POLI = {
    id: 'way-39586076',
    name: 'Polideportivo Municipal',
    category: 'deporte',
    kind: 'sports_centre',
    lat: 39.5460249,
    lng: -0.5806981,
  }
  const PAVELLO = {
    id: 'pavello-municipal',
    name: 'Pabellón deportivo municipal',
    category: 'deporte',
    kind: 'sports_hall',
    lat: 39.54395,
    lng: -0.57328,
  }
  const gaz = buildGazetteer({ pois: [POLI, PAVELLO] })
  const TITULO =
    'Contrato Administrativo Obras de recuperación de instalación deportiva con el cambio de pavimento de las pistas del poli-deportivo municipal por daños sufridos tras la DANA 2024'

  it('«poli-deportivo» se pliega como «polideportivo»', () => {
    expect(foldTitle('pistas del poli-deportivo municipal')).toBe(
      'pistas del polideportivo municipal',
    )
  })

  it('el contrato va al polideportivo que nombra, no al pabellón', () => {
    expect(resolvePlace(foldTitle(TITULO), gaz, { allowPoi: true })?.sourceId).toBe('way-39586076')
  })

  it('«deportivo municipal» no es una aguja: dos palabras genéricas no sitúan nada', () => {
    const soloPavello = buildGazetteer({ pois: [PAVELLO] })
    expect(soloPavello[0].needles).not.toContain('deportivo municipal')
    expect(
      resolvePlace(
        foldTitle('Obras en la pista deportiva del campo deportivo municipal'),
        soloPavello,
        {
          allowPoi: true,
        },
      ),
    ).toBeNull()
    // El pabellón se sigue situando cuando el título lo nombra.
    expect(
      resolvePlace(
        foldTitle('instalación de ACS con mezcladores para duchas en pabellón deportivo municipal'),
        soloPavello,
        { allowPoi: true },
      )?.sourceId,
    ).toBe('pavello-municipal')
  })
})

describe('place-resolver — lugares que el nomenclátor tiene y el resolutor no alcanzaba', () => {
  const CEMENTERIO = {
    id: 'way-740051593',
    name: 'Cementerio de San Jaime',
    category: 'civico',
    kind: 'cemetery',
    lat: 39.4767673,
    lng: -0.585373,
  }

  it('«Cementerio Municipal» de una obra va al único cementerio del nomenclátor (24098)', () => {
    const gaz = buildGazetteer({ pois: [CEMENTERIO] })
    const m = resolvePlace(
      foldTitle(
        'obras de ampliación del Cementerio Municipal, por procedimiento abierto simplificado, mejor relación calidad-precio',
      ),
      gaz,
      { allowPoi: true },
    )
    expect(m?.sourceId).toBe('way-740051593')
    expect(m?.point).toEqual([39.4767673, -0.585373])
  })

  it('con dos cementerios en el nomenclátor «Cementerio Municipal» no se sitúa (ambiguo)', () => {
    const gaz = buildGazetteer({
      pois: [CEMENTERIO, { ...CEMENTERIO, id: 'way-2', name: 'Cementeri Vell', lat: 39.55 }],
    })
    expect(
      resolvePlace(
        foldTitle('Contrato de obras de bloque de nichos en el Cementerio Municipal'),
        gaz,
        {
          allowPoi: true,
        },
      ),
    ).toBeNull()
  })

  it('un servicio «del cementerio municipal» sigue sin situarse: la puerta de obras no cambia (78068)', () => {
    const gaz = buildGazetteer({ pois: [CEMENTERIO] })
    expect(
      resolvePlace(
        foldTitle('Servicio de mantenimiento del elevador portaféretros del cementerio municipal'),
        gaz,
        { allowPoi: false },
      ),
    ).toBeNull()
  })

  it('«cementerio» a secas no basta: hace falta «cementerio municipal»', () => {
    const gaz = buildGazetteer({ pois: [CEMENTERIO] })
    expect(
      resolvePlace(foldTitle('Obras de cerramiento junto al antiguo cementerio'), gaz, {
        allowPoi: true,
      }),
    ).toBeNull()
  })

  it('«Entrenaranjos» (name:es en OSM) sitúa en la Urbanització Entretarongers (77637)', () => {
    const gaz = buildGazetteer({
      zones: [
        {
          slug: 'urbanitzacio-entretarongers',
          name: 'Urbanització Entretarongers',
          centroid: [39.5533441, -0.5383653],
        },
      ],
      zoneAliases: ZONE_ALIASES,
    })
    const m = resolvePlace(
      foldTitle('Suministro e instalación alumbrado urbanización Entrenaranjos'),
      gaz,
      { allowPoi: false },
    )
    expect(m?.sourceId).toBe('urbanitzacio-entretarongers')
  })

  it('«calle Garelli y Pastor» alcanza «Carrer de Garelli i Pastor» (6126538)', () => {
    const gaz = buildGazetteer({
      streets: [
        {
          slug: 'carrer-de-garelli-i-pastor',
          name: 'Carrer de Garelli i Pastor',
          kind: 'calle',
          point: [39.5475725, -0.5679],
        },
      ],
    })
    const m = resolvePlace(
      foldTitle(
        'Contrato Menor:Realización de pruebas de carga en cada uno de los forjados (…) en la Casa del Abogado sita en calle Garelli y Pastor, 10. 46190, Riba-roja de Túria, València.',
      ),
      gaz,
      { allowPoi: false },
    )
    expect(m?.sourceId).toBe('carrer-de-garelli-i-pastor')
  })

  it('una «I» final es un ordinal, no la conjunción: «Jaume I» no se lee «Jaume y»', () => {
    const gaz = buildGazetteer({
      streets: [
        {
          slug: 'carrer-de-jaume-i',
          name: 'Carrer de Jaume I',
          kind: 'calle',
          point: [39.54, -0.57],
        },
      ],
    })
    expect(resolvePlace(foldTitle('Asfaltado de la calle Jaume y Pere'), gaz)).toBeNull()
  })
})

// ─── Un título, un lugar: la regla de contención ─────────────────────────────
// Gazetteer construido con los nombres y puntos REALES de streets.json, geo.json
// y gazetteer-supplement.json: la regla mide distancias, y un fixture con puntos
// inventados probaría una geografía que no existe.
const REAL = buildGazetteer({
  streets: [
    { slug: 'carrer-dolcaina', name: 'Carrer Dolçaina', point: [39.5609297, -0.5598736] },
    { slug: 'carrer-tabalet', name: 'Carrer Tabalet', point: [39.5637115, -0.5651402] },
    {
      slug: 'carrer-del-mas-de-montes',
      name: 'Carrer del Mas de Montes',
      point: [39.4805062, -0.5875882],
    },
    {
      slug: 'carrer-del-mas-de-balo',
      name: 'Carrer del Mas de Baló',
      point: [39.4805108, -0.590225],
    },
    { slug: 'passeig-del-molinet', name: 'Passeig del Molinet', point: [39.5557928, -0.5531642] },
    { slug: 'passeig-el-molinet', name: 'Passeig el Molinet', point: [39.5540442, -0.5495984] },
    { slug: 'carrer-arrosals', name: 'Carrer Arrosals', point: [39.5451001, -0.5757313] },
    { slug: 'avinguda-pacadar', name: 'Avinguda Pacadar', point: [39.5414467, -0.571304] },
    { slug: 'carrer-de-la-malla', name: 'Carrer de la Mallà', point: [39.5468976, -0.5820025] },
    { slug: 'carrer-de-la-piscina', name: 'Carrer de la Piscina', point: [39.5518584, -0.5277984] },
    {
      slug: 'avinguda-de-la-industria',
      name: 'Avinguda de la Indústria',
      point: [39.4843186, -0.5531345],
    },
    { slug: 'carrer-de-mallorca', name: 'Carrer de Mallorca', point: [39.4778375, -0.5704932] },
    { slug: 'carrer-de-toledo', name: 'Carrer de Toledo', point: [39.5408141, -0.5716581] },
    { slug: 'cami-de-les-animes', name: 'Camí de les Ànimes', point: [39.5487019, -0.5619531] },
    { slug: 'peatonal', name: 'Peatonal', point: [39.5530651, -0.535206] },
    {
      slug: 'carretera-de-vilamarxant',
      name: 'Carretera de Vilamarxant',
      point: [39.5484923, -0.5816335],
    },
    {
      slug: 'carrer-de-luis-santangel',
      name: 'Carrer de Luis Santàngel',
      point: [39.5427, -0.5749],
    },
  ],
  zones: [
    { slug: 'santa-rosa', name: 'Santa Rosa', centroid: [39.5508312, -0.5333969] },
    { slug: 'monte-alcedo', name: 'Monte Alcedo', centroid: [39.5558464, -0.5425281] },
    { slug: 'el-molinet', name: 'el Molinet', centroid: [39.5544196, -0.5510476] },
    {
      slug: 'urbanitzacio-els-pous',
      name: 'Urbanització Els Pous',
      centroid: [39.5233167, -0.5191743],
    },
    { slug: 'l-oliveral', name: "l'Oliveral", centroid: [39.4710524, -0.5366921] },
    { slug: 'gallipont', name: 'Gallipont', centroid: [39.55865, -0.55638] },
    { slug: 'zona-pacadar', name: 'Zona Pacadar', centroid: [39.54148, -0.57145] },
  ],
  zoneAliases: {
    'santa-rosa': ['santa rosa'],
    'monte-alcedo': ['monte alcedo'],
    'el-molinet': ['molinet'],
    'urbanitzacio-els-pous': ['els pous'],
    'l-oliveral': ['oliveral'],
    gallipont: ['Gallipont', 'Urbanización Gallipont', 'Urbanitzacio Gallipont'],
    'zona-pacadar': ['Zona Pacadar', 'Pacadar'],
  },
})

const situa = (titulo: string, allowPoi = true) =>
  resolveUnambiguousPlace(foldTitle(titulo), REAL, { allowPoi })?.sourceId ?? null

describe('place-resolver — resolveUnambiguousPlace (un título que nombra varios sitios no se pincha)', () => {
  describe('pines equivocados publicados → sin pin', () => {
    it('74419: un carril bici por cinco zonas no es un punto', () => {
      expect(
        situa(
          'Obras de ejecución de carril bici en la zona Molinet, Montealcedo, entrenaranjos, Santa Rosa y El Clot',
        ),
      ).toBeNull()
    })

    it('85485: «C.D. La Mallá» no es una calle', () => {
      expect(
        situa(
          'Servicio de limpieza de piscina cubierta y demás dependencias del C.D. La Mallá',
          false,
        ),
      ).toBeNull()
    })

    it('4510789: el «ODS 9 Industria…» del pliego no sitúa nada; queda la C/ Mallorca', () => {
      expect(
        situa(
          'Contrato administrativo de obras para la ejecución del proyecto de _obras de mejora viaria y señalización en C/ Mallorca, P.I. Sector 12 y Bassa_ por procedimiento abierto simplificado, varios criterios de adjudicación, con condición de ejecución de carácter social y medioambiental, contribuyendo al cumplimiento del ODS 9 “Industria, innovación e infraestructura” (Ctto. 22/2024).',
        ),
      ).toBe('carrer-de-mallorca')
      // Y una app municipal (1402847) no está en ninguna avenida por citar el
      // mismo ODS: la «c» de «meta 9.5.c» le daba permiso de calle.
      expect(
        situa(
          'contrato de servicio de mantenimiento de la APP RIBA-ROJA INFO, por procedimiento abierto súper simplificado, único criterio de adjudicación, con condición especial de ejecución de carácter social y medioambiental contribuyendo al ODS 9 INDUSTRIA, INNOVACION E INFRAESTRUCTURA en relación a la meta 9.5.c para aumentar significativamente el acceso a la tecnología de la información y las comunicaciones y esforzarse por proporcionar acceso universal y asequible a Internet.',
          false,
        ),
      ).toBeNull()
    })

    it('dos calles distintas son dos sitios (enlace, tres aceras)', () => {
      expect(situa('LOTE 3 : Enlace camino c/ Dolçaina – c/ Tabalet')).toBeNull()
      expect(
        situa(
          'Obras de reurbanización de las aceras ubicadas en la Ctra. Vilamarxant, C/ Arrosals y C/ Luís Santángel',
        ),
      ).toBeNull()
    })

    it('una calle que NO está dentro de la urbanización nombrada no la contiene', () => {
      // C/ Toledo queda a 4,9 km del centroide de Els Pous: son dos obras.
      expect(situa('Obras de pavimentación c/ Toledo y camí urbanización Els pous')).toBeNull()
      expect(
        situa(
          'Contrato verbal de servicio de oficiales con maquinaria para limpiar y recoger escombro en la vía pública (Els Pous, c/ Ànimes y Pedanía del Oliveral)',
          false,
        ),
      ).toBeNull()
    })
  })

  describe('pines anidados legítimos → siguen en su calle', () => {
    it('una calle dentro de su partida', () => {
      expect(situa('LOTE 2 : C/ Dolçaina (Partida Gallipont)')).toBe('carrer-dolcaina')
      expect(situa('LOTE 1: C/ del Tabalet (Partida Gallipont)')).toBe('carrer-tabalet')
    })

    it('una calle dentro de su polígono, aunque el polígono se llame como otra calle', () => {
      expect(
        situa(
          'Contrato Menor de obras de eliminación de Isleta en C/Mas de Montes en P.I. Mas de Balo.',
        ),
      ).toBe('carrer-del-mas-de-montes')
    })

    it('una parcela de una zona «sita en» una calle', () => {
      expect(
        situa(
          'Obras para la ejecución del proyecto de ACONDICIONAMIENTO PROVISIONAL DE LA PARCELA DE PACADAR sita en C/ Arrosals de Riba-roja de Túria',
        ),
      ).toBe('carrer-arrosals')
    })

    it('dos grafías de la misma calle y la zona que le da nombre son un sitio', () => {
      expect(situa('Adecuación Paseo Molinet')).toBe('passeig-del-molinet')
      expect(
        situa(
          'Contrato de obras de ejecución del CARRIL CICLOPEATONAL ZONA NORTE: ADECUACIÓN SENDA MOLINET, ALUMBRADO Y CONEXIÓN CON CASCO URBANO',
        ),
      ).toBe('passeig-del-molinet')
      expect(situa('Obras en el Passeig del Molinet y el Passeig el Molinet')).toBe(
        'passeig-del-molinet',
      )
    })

    it('«peatonal» es un adjetivo, no la calle Peatonal', () => {
      expect(
        situa(
          'Contrato para el suministro, adquisición de jardineras para separar el carril para paso de vehículos en calle Vilamarxant, del carril peatonal',
          false,
        ),
      ).toBe('carretera-de-vilamarxant')
    })

    it('un solo sitio sigue resolviendo como antes', () => {
      expect(situa('Obras de reurbanización en C/ Arrosals')).toBe('carrer-arrosals')
      expect(situa('Reurbanización Zona Verde Monte Alcedo')).toBe('monte-alcedo')
      expect(situa('Servicio postal del Ayuntamiento')).toBeNull()
    })
  })
})

// 2026-10-17 — «CEIP Eres Altes» no llegaba al colegio. OSM rotula los centros
// por su nombre oficial («Col·legi d'Educació Infantil i Primària Eres Altes»),
// los títulos por la sigla, y poiCore sólo quita UNA palabra genérica: la aguja
// que quedaba era «educacio infantil i primaria eres altes», que ningún título
// escribe. 266371 y 310978 se pinchaban en el Carrer de les Eres Altes (a 90 m)
// sólo porque la «c» suelta de «C.E.I.P» contaba como «C/»; #344 lo quitó y se
// quedaron sin pin. Títulos y puntos REALES (tenders.json, civic-poi.json,
// streets.json, geo.json).
describe('place-resolver — la sigla del centro educativo (CEIP, IES) alcanza su POI', () => {
  const EDUCACION = [
    {
      id: 'way-1178031442',
      name: "Col·legi d'Educació Infantil i Primària Eres Altes",
      category: 'educacion',
      kind: 'school',
      lat: 39.5473561,
      lng: -0.5639968,
    },
    {
      id: 'way-1242095512',
      name: "Col·legi d'Educació Infantil i Primària Camp de Túria",
      category: 'educacion',
      kind: 'school',
      lat: 39.5493045,
      lng: -0.5717854,
    },
    {
      id: 'way-903588096',
      name: 'Col·legi d’Educació Infantil i Primària Mas d’Escoto',
      category: 'educacion',
      kind: 'school',
      lat: 39.5504954,
      lng: -0.5811206,
    },
    {
      id: 'way-152522318',
      name: "Institut d'Educació Secundària el Quint",
      category: 'educacion',
      kind: 'school',
      lat: 39.5480338,
      lng: -0.5616616,
    },
  ]
  const gaz = buildGazetteer({
    pois: EDUCACION,
    streets: [
      {
        slug: 'carrer-de-les-eres-altes',
        name: 'Carrer de les Eres Altes',
        kind: 'calle',
        point: [39.5465682, -0.5637041],
      },
      {
        slug: 'avinguda-del-camp-de-turia',
        name: 'Avinguda del Camp de Túria',
        kind: 'avenida',
        point: [39.5517161, -0.5422703],
      },
    ],
    zones: [
      { slug: 'el-pou-d-escoto', name: "el Pou d'Escoto", centroid: [39.5484628, -0.5909944] },
    ],
    zoneAliases: ZONE_ALIASES,
  })
  const obra = (titulo: string) =>
    resolveUnambiguousPlace(foldTitle(titulo), gaz, { allowPoi: true })?.sourceId ?? null

  it('el colegio y el instituto llevan la aguja de su sigla', () => {
    const agujas = (id: string) => gaz.find((c) => c.sourceId === id)!.needles
    expect(agujas('way-1178031442')).toContain('ceip eres altes')
    expect(agujas('way-903588096')).toContain('ceip mas d escoto')
    expect(agujas('way-152522318')).toContain('ies el quint')
  })

  it('«C.E.I.P Eres Altes» (266371, 310978) se sitúa en el colegio, no en la calle', () => {
    expect(
      obra(
        'contrato de obras de mejora de la eficiencia energética en C.E.I.P Eres Altes por procedimiento abierto súper simplificado, mejor relación calidad-precio, varios criterios de adjudicación, con cláusulas socio-laborales como criterio de adjudicación y con condiciones especiales de ejecución de carácter medioambiental. ( Plan Edificant )',
      ),
    ).toBe('way-1178031442')
    expect(
      obra(
        'Contrato de obras de mejora de la instalación de climatización e iluminación en C.E.I.P Eres Altes por lotes -2 lotes- por procedimiento abierto súper simplificado, mejor relación calidad-precio, varios criterios de adjudicación, con cláusulas medioambientales como criterio de adjudicación y con condiciones especiales de ejecución de carácter medioambiental y social. (Plan Edificant)',
      ),
    ).toBe('way-1178031442')
  })

  it('«CEIP Eres Altes» (256906) y «CEIP Camp de Túria» (86822) se sitúan en su colegio', () => {
    expect(
      obra(
        'Contrato de obras de reforma de aseos en el CEIP Eres Altes por procedimiento abierto súper simplificado, mejor relación calidad-precio, varios criterios de adjudicación, con cláusulas socio-laborales como criterio de adjudicación y con condiciones especiales de ejecución de carácter medioambiental',
      ),
    ).toBe('way-1178031442')
    expect(obra('Construcción cubierta en pista deportiva CEIP Camp de Túria')).toBe(
      'way-1242095512',
    )
  })

  it('«CEIP Mas d’Escoto» (269749, 632456) va al colegio y no al centroide de el Pou d’Escoto', () => {
    expect(
      obra(
        'contrato de ejecución de las obras de construcción de pabellón deportivo cubierto en CEIP Mas d’Escoto – Fase I (movimiento de tierras y muro de contención) por procedimiento abierto súper simplificado, mejor relación calidad-precio, varios criterios de adjudicación con cláusula socio-laboral como criterio de adjudicación y con condición especial de ejecución de carácter medioambiental',
      ),
    ).toBe('way-903588096')
    expect(obra("Obras de reforma de aseos en CEIP Mas d'escoto")).toBe('way-903588096')
  })

  it('un servicio en el colegio sigue sin situarse: la puerta de obras no cambia (840300)', () => {
    expect(
      resolveUnambiguousPlace(
        foldTitle(
          'servicio de limpieza EEII Riu Túria y CEIP Camp de Túria, por procedimiento abierto, 2 lotes, mejor relación calidad-precio, varios criterios de adjudicación',
        ),
        gaz,
        { allowPoi: false },
      ),
    ).toBeNull()
  })

  it('sin la sigla no hay aguja nueva: «Eres Altes» a secas no es el colegio', () => {
    expect(obra('Obras de urbanización en Eres Altes')).toBeNull()
    expect(obra('Obras en el Quint')).toBeNull()
  })
})

describe('place-resolver — «Mas d’Escoto» (el colegio) no es el Pou d’Escoto (la urbanización)', () => {
  // OSM los separa: el colegio (way-903588096) y la localidad «el Mas d'Escoto»
  // (node 11688398913) caen en el polígono residencial way 903588100; el
  // centroide de el Pou d'Escoto, en otro (way 905055223), a 0,55 km del
  // colegio por su vértice más cercano. Medido el 2026-10-18.
  const gaz = buildGazetteer({
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
    zones: [
      { slug: 'el-pou-d-escoto', name: "el Pou d'Escoto", centroid: [39.5484628, -0.5909944] },
    ],
    zoneAliases: ZONE_ALIASES,
  })
  const sitio = (titulo: string, allowPoi: boolean) =>
    resolveUnambiguousPlace(foldTitle(titulo), gaz, { allowPoi })?.sourceId ?? null

  it('un suministro o un servicio en el CEIP no se pincha en la urbanización (692227, 1045077)', () => {
    expect(sitio("Sustitución campana extractora CEIP Mas d'Escoto", false)).toBeNull()
    expect(
      sitio(
        'Contrato de servicio de redacción de proyecto de ejecución y dirección de las obras para la construcción de Pabellón Deportivo Cubierto en CEIP Mas d’Escoto con perspectiva de género por procedimiento abierto simplificado, mejor relación calidad-precio, varios criterios de adjudicación, con condición especial de ejecución de carácter social y medioambiental contribuyendo al cumplimiento del ODS 8 relativo al trabajo decente para todos y 5 de igualdad de género',
        false,
      ),
    ).toBeNull()
  })

  it('«colegio Mas d’Escoto» sin sigla no cae en el centroide de el Pou d’Escoto (8678128)', () => {
    expect(
      sitio(
        "Contrato menor de obras para el proyecto de “Reparación y adecuación del vallado linde patio infantil colegio Mas d'Escoto con el Barranco de Porchinos por daños sufridos tras la DANA” a favor de SERCOT SERVICIOS Y CONSTRUCCIONES TURIA, SL con CIF nº B44581510. (Ctto. 64M/2025)",
        true,
      ),
    ).not.toBe('el-pou-d-escoto')
  })

  it('«cruce Escoto» no nombra la urbanización (68394)', () => {
    expect(
      sitio('Urbanización de la carretera Villamarchante desde parque hasta cruce Escoto', true),
    ).toBeNull()
  })

  it('«acceso al Pou d’Escoto» sigue en la urbanización (1891608)', () => {
    expect(
      sitio(
        'Contrato para alumbrado público en acceso al Pou d’Escoto, derivado del sistema dinámico de adquisición (SDA) de suministro de material de electricidad. (Expte. 23/2022).',
        false,
      ),
    ).toBe('el-pou-d-escoto')
  })

  it('el CEIP con sigla sigue yendo al colegio (269749, 329628)', () => {
    expect(sitio("Pavimentación pista deportiva en CEIP Más d'Escoto", true)).toBe('way-903588096')
  })
})

describe('place-resolver — València la Vella: la urbanización se ve; el yacimiento no se confunde con ella', () => {
  // OSM da cuatro cosas con ese nombre: la urbanización (node 615180643), la
  // estación de Metrovalencia, el Carrer de València la Vella y el yacimiento
  // visigodo (BIC, «Zona arqueològica», way 1176535578), con su propio polígono a
  // 0,72 km del centroide de la urbanización. Medido el 2026-10-18.
  const gaz = buildGazetteer({
    // El yacimiento entra por gazetteer-supplement.json con estos tres nombres.
    pois: [
      'Jaciment Visigòtic de València la Vella',
      'Yacimiento arqueológico de Valencia la Vella',
      'Yacimiento de Valencia la Vella',
    ].map((name) => ({
      id: 'jaciment-valencia-la-vella',
      name,
      lat: 39.52974,
      lng: -0.52503,
    })),
    zones: [
      {
        slug: 'urbanitzacio-valencia-la-vella',
        name: 'Urbanització València la Vella',
        centroid: [39.5344276, -0.5307458],
      },
      { slug: 'monte-alcedo', name: 'Monte Alcedo', centroid: [39.5558, -0.5425] },
      {
        slug: 'poligono-industrial-entrevias',
        name: 'Polígono Industrial Entrevías',
        centroid: [39.5405303, -0.5508958],
      },
    ],
    zoneAliases: ZONE_ALIASES,
  })
  const sitio = (titulo: string, allowPoi: boolean) =>
    resolveUnambiguousPlace(foldTitle(titulo), gaz, { allowPoi })?.sourceId ?? null

  it('el alias curado «valencia la vella» es una aguja de la urbanización', () => {
    const urb = gaz.find(
      (c) => c.kind === 'urbanizacion' && c.sourceId === 'urbanitzacio-valencia-la-vella',
    )
    expect(urb?.needles).toContain('valencia la vella')
  })

  it('el área de esparcimiento «en zona verde de Valencia la Vella» va a la urbanización (5106922)', () => {
    // El anuncio de licitación lo dice: «Adecuar una parte del área verde de la
    // urbanización Valencia la Vella como zona de esparcimiento».
    expect(
      sitio(
        'Contrato administrativo obras para la ejecución del proyecto Área de esparcimiento en zona verde de Valencia la Vella en el T. M. de Riba-roja de Túria (Valencia) - Ctto.39/2026',
        true,
      ),
    ).toBe('urbanitzacio-valencia-la-vella')
  })

  it('un suministro para el yacimiento no cae en la urbanización (2739773, 1520813)', () => {
    expect(
      sitio(
        'Contrato menor de suministro de material e instalación del sistema de cctv de vigilancia para parte del perímetro del yacimiento arqueológico de Valencia la Vella, en el municipio de Riba-roja de Túria.',
        false,
      ),
    ).toBeNull()
    expect(
      sitio(
        'Contrato de suministro de paneles individuales de acceso para el yacimiento arqueológico de Valencia la vella destinado al departamento de Turismo, por procedimiento abierto súper simplificado, mejor relación calidad-precio, un único criterio de adjudicación',
        false,
      ),
    ).toBeNull()
  })

  it('una obra en el yacimiento sigue yendo al yacimiento', () => {
    expect(
      sitio('Obras de consolidación del yacimiento arqueológico de Valencia la Vella', true),
    ).toBe('jaciment-valencia-la-vella')
  })

  it('un título con dos urbanizaciones o tres zonas sigue sin pin (96520, 1554203)', () => {
    expect(
      sitio(
        'contrato de obras de colocación de Centros Culturales e instalaciones al servicio de las Urbanizaciones Monte Alcedo y Valencia La Vella, por procedimiento abierto',
        true,
      ),
    ).toBeNull()
    expect(
      sitio(
        'Contrato de obras INSTALACION ALUMBRADO PUBLICO CARRIL BICI ESCOTO, ROTONDA ENTREVIAS Y ACCESO VALENCIA LA VELLA por procedimiento abierto súper simplificado',
        true,
      ),
    ).toBeNull()
  })
})
