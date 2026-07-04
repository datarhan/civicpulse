import { describe, it, expect } from 'vitest'
import {
  foldTitle,
  streetCore,
  buildGazetteer,
  resolvePlace,
  type Candidate,
} from '../src/scraper/place-resolver'

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
