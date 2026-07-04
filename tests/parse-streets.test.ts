import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseOsmStreets, type Street } from '../src/scraper/streets'

const FIXTURE = join(__dirname, 'fixtures', 'overpass_streets_2026-07-04.json')

describe('scraper/streets — parseOsmStreets', () => {
  let streets: Street[]

  beforeAll(() => {
    streets = parseOsmStreets(readFileSync(FIXTURE, 'utf8'))
  })

  it('parses the municipal street network (deduped, several hundred names)', () => {
    // 543 distinct raw names in the fixture; case/segment merging keeps it high.
    expect(streets.length).toBeGreaterThan(300)
  })

  it('every street has a name, slug, kind and an on-map representative point', () => {
    const KINDS = new Set(['calle', 'camino', 'carretera', 'avenida', 'plaza'])
    for (const s of streets) {
      expect(s.name.length).toBeGreaterThan(1)
      expect(s.slug.length).toBeGreaterThan(0)
      expect(KINDS.has(s.kind)).toBe(true)
      expect(Array.isArray(s.point)).toBe(true)
      const [lat, lng] = s.point
      expect(Number.isFinite(lat)).toBe(true)
      expect(Number.isFinite(lng)).toBe(true)
      // Riba-roja de Túria bounding box (sanity: point lies in the municipality).
      expect(lat).toBeGreaterThan(39.4)
      expect(lat).toBeLessThan(39.7)
      expect(lng).toBeGreaterThan(-0.7)
      expect(lng).toBeLessThan(-0.4)
    }
  })

  it('produces unique slugs', () => {
    const slugs = streets.map((s) => s.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('merges case/segment variants of the same street name into one entry', () => {
    // Fixture has both "Carretera de l'Eliana" and "Carretera de L'Eliana".
    const eliana = streets.filter((s) => /^carretera de l'eliana$/i.test(s.name))
    expect(eliana.length).toBe(1)
  })

  it('classifies the street kind from the name prefix', () => {
    const byPrefix = (re: RegExp) => streets.find((s) => re.test(s.name))
    expect(byPrefix(/^Avinguda/)?.kind).toBe('avenida')
    expect(byPrefix(/^Plaça/)?.kind).toBe('plaza')
    expect(byPrefix(/^Camí/)?.kind).toBe('camino')
    expect(byPrefix(/^Carretera/)?.kind).toBe('carretera')
    expect(byPrefix(/^Carrer /)?.kind).toBe('calle')
  })

  it('ignores unnamed ways and non-way elements', () => {
    // Nothing without a name should appear; slugs are all truthy (checked above).
    expect(streets.every((s) => s.name.trim().length > 0)).toBe(true)
  })
})
