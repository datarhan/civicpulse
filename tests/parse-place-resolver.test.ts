import { describe, it, expect } from 'vitest'
import {
  foldTitle,
  streetCore,
  buildGazetteer,
  resolvePlace,
  matchNameToGazetteer,
  type Candidate,
} from '../src/scraper/place-resolver'

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
