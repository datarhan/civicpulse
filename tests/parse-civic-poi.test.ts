import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseOsmPoi, categorizePoi, type CivicPoi } from '../src/scraper/civic-poi'

const FIXTURE = join(__dirname, 'fixtures/overpass_civic-poi_2026-07-04.json')

describe('scraper/civic-poi — categorizePoi', () => {
  it('maps OSM tags onto civic categories, else null', () => {
    expect(categorizePoi({ amenity: 'school' })).toBe('educacion')
    expect(categorizePoi({ amenity: 'pharmacy' })).toBe('salud')
    expect(categorizePoi({ healthcare: 'centre' })).toBe('salud')
    expect(categorizePoi({ leisure: 'park' })).toBe('verde')
    expect(categorizePoi({ leisure: 'sports_centre' })).toBe('deporte')
    expect(categorizePoi({ amenity: 'townhall' })).toBe('civico')
    expect(categorizePoi({ tourism: 'museum' })).toBe('cultura')
    expect(categorizePoi({ amenity: 'restaurant' })).toBeNull()
    expect(categorizePoi({})).toBeNull()
  })
})

describe('scraper/civic-poi — parseOsmPoi', () => {
  let pois: CivicPoi[]
  beforeAll(() => {
    pois = parseOsmPoi(readFileSync(FIXTURE, 'utf8'))
  })

  it('keeps only named, categorised POIs with coordinates', () => {
    expect(pois.length).toBeGreaterThanOrEqual(20)
    for (const p of pois) {
      expect(p.name.length).toBeGreaterThan(0)
      expect(['educacion', 'salud', 'verde', 'deporte', 'cultura', 'civico']).toContain(p.category)
      expect(typeof p.lat).toBe('number')
      expect(typeof p.lng).toBe('number')
      expect(p.id).toMatch(/^(node|way|relation)-\d+$/)
    }
  })

  it('drops unnamed noise (private swimming pools / pitches carry no name)', () => {
    // The fixture seeds 4 unnamed leisure elements; none may survive.
    const unnamed = pois.filter((p) => !p.name)
    expect(unnamed.length).toBe(0)
  })

  it('categorises real Riba-roja civic landmarks correctly', () => {
    const byName = (needle: string) => pois.find((p) => p.name.includes(needle))
    expect(byName('Ajuntament')?.category).toBe('civico')
    expect(byName('Centre de Salut')?.category).toBe('salud')
    expect(byName('Policía Local')?.category).toBe('civico')
  })
})
