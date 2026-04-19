import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseGoogleNewsRss } from '../src/scraper/press'

const FIXTURE = join(__dirname, 'fixtures', 'gnews_riba-roja_2026-04-19.xml')

describe('scraper/press — parseGoogleNewsRss', () => {
  let items: ReturnType<typeof parseGoogleNewsRss>

  beforeAll(() => {
    items = parseGoogleNewsRss(readFileSync(FIXTURE, 'utf8'))
  })

  it('parses every <item> in the feed (>=80 items)', () => {
    expect(items.length).toBeGreaterThanOrEqual(80)
    expect(items.length).toBeLessThanOrEqual(200)
  })

  it('every item has a non-empty title, link, source, and pub date', () => {
    for (const i of items) {
      expect(i.title.length).toBeGreaterThan(5)
      expect(i.link).toMatch(/^https?:\/\//)
      expect(i.source.length).toBeGreaterThan(1)
      expect(i.date).toMatch(/^\d{4}-\d{2}-\d{2}/)
    }
  })

  it('strips the " - Publisher" suffix from titles (lives in source field instead)', () => {
    // Google News feeds look like: "<headline> - <publisher>"
    // parser should move the publisher into `source` and leave the clean headline.
    for (const i of items) {
      expect(i.title.endsWith(' - ' + i.source)).toBe(false)
    }
  })

  it('aggregates news from multiple Spanish outlets (>=5 distinct sources)', () => {
    const uniq = new Set(items.map((i) => i.source))
    expect(uniq.size).toBeGreaterThanOrEqual(5)
  })

  it('includes well-known regional publishers (Levante-EMV, Las Provincias, Valencia Plaza)', () => {
    const sources = items.map((i) => i.source.toLowerCase())
    expect(sources.some((s) => s.includes('levante'))).toBe(true)
    expect(sources.some((s) => s.includes('provincias'))).toBe(true)
    expect(sources.some((s) => s.includes('valencia plaza'))).toBe(true)
  })

  it('is sorted newest-first', () => {
    for (let i = 0; i < items.length - 1; i++) {
      const a = new Date(items[i].date).getTime()
      const b = new Date(items[i + 1].date).getTime()
      expect(a).toBeGreaterThanOrEqual(b)
    }
  })

  it('dedupes near-identical headlines across publishers', () => {
    // Same event covered by 3 outlets should collapse; we still want >=3
    // distinct stories total though. Dedup uses a fingerprint from the
    // first-N-words of the title.
    const fingerprints = items.map((i) => i.fingerprint)
    expect(new Set(fingerprints).size).toBe(items.length)
  })

  it('assigns a stable id per item', () => {
    const ids = items.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
