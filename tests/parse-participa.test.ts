import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseParticipaPosts } from '../src/scraper/participa'

const POSTS = join(__dirname, 'fixtures', 'participa_posts_2026-04-19.json')
const CATS = join(__dirname, 'fixtures', 'participa_categories_2026-04-19.json')

describe('scraper/participa — parseParticipaPosts', () => {
  let items: ReturnType<typeof parseParticipaPosts>

  beforeAll(() => {
    items = parseParticipaPosts(readFileSync(POSTS, 'utf8'), {
      categoriesJson: readFileSync(CATS, 'utf8'),
    })
  })

  it('parses every published post (6 on the snapshot)', () => {
    expect(items.length).toBe(6)
  })

  it('every item has a title, link, iso date, and category labels', () => {
    for (const it of items) {
      expect(it.title.length).toBeGreaterThan(3)
      expect(it.link).toMatch(/^https?:\/\//)
      expect(it.date).toMatch(/^\d{4}-\d{2}-\d{2}/)
      expect(Array.isArray(it.categories)).toBe(true)
      for (const c of it.categories) {
        expect(typeof c).toBe('string')
        expect(c.length).toBeGreaterThan(0)
      }
    }
  })

  it('strips HTML from the excerpt (no tags leaking through)', () => {
    for (const it of items) {
      expect(it.excerpt).not.toMatch(/<\/?[a-z][^>]*>/i)
    }
  })

  it('maps category IDs 21 and 22 to human labels (activities / surveys)', () => {
    const labels = new Set(items.flatMap((i) => i.categories))
    expect(labels.has('Actividades participativas')).toBe(true)
    expect(labels.has('Encuestas')).toBe(true)
  })

  it('is sorted newest-first', () => {
    for (let i = 0; i < items.length - 1; i++) {
      const a = new Date(items[i].date).getTime()
      const b = new Date(items[i + 1].date).getTime()
      expect(a).toBeGreaterThanOrEqual(b)
    }
  })

  it('produces a unique slug per item', () => {
    const slugs = items.map((i) => i.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('kind classifies each post as "activity" or "survey"', () => {
    const valid = new Set(['activity', 'survey', 'other'])
    for (const it of items) {
      expect(valid.has(it.kind)).toBe(true)
    }
  })
})
