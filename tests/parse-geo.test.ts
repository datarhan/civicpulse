import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseOsmBoundary, parseOsmNeighborhoods } from '../src/scraper/geo'

const BOUNDARY = join(__dirname, 'fixtures', 'osm_boundary_2026-04-19.json')
const NEIGH = join(__dirname, 'fixtures', 'osm_neighborhoods_2026-04-19.json')

describe('scraper/geo — parseOsmBoundary', () => {
  let out: ReturnType<typeof parseOsmBoundary>

  beforeAll(() => {
    out = parseOsmBoundary(readFileSync(BOUNDARY, 'utf8'))
  })

  it('returns a non-null result with tags', () => {
    expect(out).not.toBeNull()
    expect(out!.name).toMatch(/Riba-roja/i)
    expect(out!.ineCode).toBe('46214')
  })

  it('returns a bbox that contains Riba-roja town centre (39.5439, -0.5711)', () => {
    const b = out!.bbox
    expect(39.5439).toBeGreaterThanOrEqual(b.south)
    expect(39.5439).toBeLessThanOrEqual(b.north)
    expect(-0.5711).toBeGreaterThanOrEqual(b.west)
    expect(-0.5711).toBeLessThanOrEqual(b.east)
  })

  it('centroid sits inside the bbox', () => {
    const [lat, lng] = out!.centroid
    const b = out!.bbox
    expect(lat).toBeGreaterThanOrEqual(b.south)
    expect(lat).toBeLessThanOrEqual(b.north)
    expect(lng).toBeGreaterThanOrEqual(b.west)
    expect(lng).toBeLessThanOrEqual(b.east)
  })

  it('polygon has >=100 points (municipal boundaries are detailed)', () => {
    expect(out!.polygon.length).toBeGreaterThanOrEqual(100)
    for (const [lat, lng] of out!.polygon) {
      expect(typeof lat).toBe('number')
      expect(typeof lng).toBe('number')
    }
  })
})

describe('scraper/geo — parseOsmNeighborhoods', () => {
  let items: ReturnType<typeof parseOsmNeighborhoods>

  beforeAll(() => {
    items = parseOsmNeighborhoods(readFileSync(NEIGH, 'utf8'))
  })

  it('parses >= 20 neighborhoods', () => {
    expect(items.length).toBeGreaterThanOrEqual(20)
  })

  it('every item has an id, name, centroid, and kind', () => {
    const kinds = new Set(['neighbourhood', 'suburb', 'quarter', 'hamlet', 'village'])
    for (const n of items) {
      expect(n.id.length).toBeGreaterThan(0)
      expect(n.name.length).toBeGreaterThan(1)
      expect(n.centroid.length).toBe(2)
      expect(kinds.has(n.kind)).toBe(true)
    }
  })

  it('includes the real industrial estates (Polígon/Polígono) and urbanizations', () => {
    const names = items.map((n) => n.name.toLowerCase())
    expect(names.some((n) => n.includes("l'oliveral"))).toBe(true)
    expect(names.some((n) => n.includes('mas de traver'))).toBe(true)
  })

  it('sums populated neighborhoods > 1000 residents', () => {
    const total = items.reduce((s, n) => s + (n.population ?? 0), 0)
    expect(total).toBeGreaterThan(1000)
  })

  it('produces unique slugs', () => {
    const slugs = items.map((n) => n.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })
})
