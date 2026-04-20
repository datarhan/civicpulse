import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseWikidataEntity } from '../src/scraper/wikidata'

const FIXTURE = join(__dirname, 'fixtures', 'wikidata_Q23701_2026-04-19.json')

describe('scraper/wikidata — parseWikidataEntity', () => {
  let facts: ReturnType<typeof parseWikidataEntity>

  beforeAll(() => {
    facts = parseWikidataEntity(readFileSync(FIXTURE, 'utf8'))
  })

  it('returns facts for Q23701 (Riba-roja de Túria)', () => {
    expect(facts).not.toBeNull()
    expect(facts!.qid).toBe('Q23701')
    // Wikidata ES label is "Ribarroja del Turia" (no hyphen), CA is
    // "Riba-roja de Túria" — accept either.
    expect(facts!.label).toMatch(/Riba[-]?roja|Ribarroja/i)
  })

  it('resolves INE code 46214', () => {
    expect(facts!.identifiers.ine).toBe('46214')
  })

  it('has coordinates near Riba-roja (39.54, -0.57)', () => {
    expect(facts!.coordinates).not.toBeNull()
    expect(Math.abs(facts!.coordinates!.lat - 39.54)).toBeLessThan(0.1)
    expect(Math.abs(facts!.coordinates!.lng - -0.57)).toBeLessThan(0.1)
  })

  it('has elevation and area', () => {
    expect(facts!.elevation).toBeGreaterThan(50)
    expect(facts!.elevation).toBeLessThan(300)
    expect(facts!.areaKm2).toBeGreaterThan(30)
    expect(facts!.areaKm2).toBeLessThan(100)
  })

  it('carries external identifiers (commons, OSM, GeoNames)', () => {
    expect(facts!.identifiers.osmRelation).toBeTruthy()
    expect(facts!.identifiers.geonames).toBeTruthy()
  })

  it('image + coat of arms URLs are absolute if present', () => {
    if (facts!.images.flag) expect(facts!.images.flag).toMatch(/^https?:\/\//)
    if (facts!.images.coatOfArms) expect(facts!.images.coatOfArms).toMatch(/^https?:\/\//)
    if (facts!.images.image) expect(facts!.images.image).toMatch(/^https?:\/\//)
  })
})
