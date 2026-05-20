import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseStandardRss, mergeNewsItems } from '../src/scraper/press'

const FIXTURE = join(__dirname, 'fixtures', 'infoturia_2026-05-20.xml')

describe('scraper/press — parseStandardRss (infoturia.com)', () => {
  let items: ReturnType<typeof parseStandardRss>

  beforeAll(() => {
    items = parseStandardRss(readFileSync(FIXTURE, 'utf8'), {
      defaultSource: 'Periòdic del Camp de Túria',
      defaultHost: 'infoturia.com',
    })
  })

  it('parses every <item> from the WordPress feed', () => {
    expect(items.length).toBeGreaterThanOrEqual(5)
    expect(items.length).toBeLessThanOrEqual(50)
  })

  it('stamps every row with the supplied publisher + host', () => {
    for (const i of items) {
      expect(i.source).toBe('Periòdic del Camp de Túria')
      expect(i.sourceHost).toBe('infoturia.com')
    }
  })

  it('does not strip a Google-News " - Pub" suffix from standard RSS titles', () => {
    for (const i of items) {
      expect(i.title).not.toMatch(/ - Periòdic del Camp de Túria$/)
    }
  })

  it('every item link points into infoturia.com', () => {
    for (const i of items) {
      expect(i.link).toMatch(/^https:\/\/(www\.)?infoturia\.com\//)
    }
  })

  it('emits ISO dates and sorts newest-first', () => {
    for (const i of items) expect(i.date).toMatch(/^\d{4}-\d{2}-\d{2}/)
    for (let k = 0; k < items.length - 1; k++) {
      expect(new Date(items[k].date).getTime()).toBeGreaterThanOrEqual(
        new Date(items[k + 1].date).getTime(),
      )
    }
  })

  it('assigns unique fingerprints + ids', () => {
    expect(new Set(items.map((i) => i.fingerprint)).size).toBe(items.length)
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
  })
})

describe('scraper/press — mergeNewsItems', () => {
  const a = parseStandardRss(readFileSync(FIXTURE, 'utf8'), {
    defaultSource: 'Periòdic del Camp de Túria',
    defaultHost: 'infoturia.com',
  })

  it('merging a list with itself dedupes by fingerprint', () => {
    const merged = mergeNewsItems(a, a)
    expect(merged.length).toBe(a.length)
  })

  it('preserves first-list rows when fingerprints collide (first-wins)', () => {
    if (a.length === 0) return
    const dup = { ...a[0], source: 'Other Publisher', sourceHost: 'other.example' }
    const merged = mergeNewsItems(a, [dup])
    const found = merged.find((m) => m.fingerprint === a[0].fingerprint)
    expect(found?.source).toBe('Periòdic del Camp de Túria')
  })

  it('keeps non-overlapping rows from both lists', () => {
    const fake = [
      {
        id: 'zzzz',
        title: 'Synthetic test row that should survive merge',
        link: 'https://example.test/x',
        source: 'Test',
        sourceHost: 'example.test',
        date: new Date('2026-01-01').toISOString(),
        fingerprint: 'fp-synthetic-row-unique',
      },
    ]
    const merged = mergeNewsItems(a, fake)
    expect(merged.length).toBe(a.length + 1)
  })

  it('output is sorted newest-first', () => {
    const merged = mergeNewsItems(a)
    for (let k = 0; k < merged.length - 1; k++) {
      expect(new Date(merged[k].date).getTime()).toBeGreaterThanOrEqual(
        new Date(merged[k + 1].date).getTime(),
      )
    }
  })
})
