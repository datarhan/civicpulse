import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseEventsRss, type EventItem } from '../src/scraper/events'

const FIXTURE = join(__dirname, 'fixtures', 'ribarroja_eventos_2026-06-18.xml')

describe('scraper/events — parseEventsRss (ribarroja.es agenda feed)', () => {
  let items: EventItem[]

  beforeAll(() => {
    items = parseEventsRss(readFileSync(FIXTURE, 'utf8'))
  })

  it('parses every <item> from the events feed', () => {
    expect(items.length).toBe(3)
  })

  it('links point into the official /es/evento path', () => {
    for (const e of items) {
      expect(e.link).toMatch(/^https:\/\/www\.ribarroja\.es\/es\/evento/)
    }
  })

  it('lifts the machine event datetime (ISO) + the human text', () => {
    const withDate = items.filter((e) => e.eventDate)
    expect(withDate.length).toBeGreaterThanOrEqual(1)
    for (const e of withDate) {
      expect(e.eventDate).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(e.eventDateText).toBeTruthy()
    }
    expect(items.map((e) => e.eventDate)).toContain('2026-06-14T07:00:00.000Z')
  })

  it('keeps the RSS publish date as ISO, distinct from the event date', () => {
    for (const e of items) expect(e.publishedDate).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('strips HTML markup from title and excerpt', () => {
    for (const e of items) {
      expect(e.title).not.toMatch(/[<>]/)
      if (e.excerpt) expect(e.excerpt).not.toMatch(/<[a-z]/i)
    }
  })

  it('assigns unique ids', () => {
    expect(new Set(items.map((e) => e.id)).size).toBe(items.length)
  })

  it('sorts chronologically by event date (soonest first, nulls last)', () => {
    const dated = items
      .filter((e) => e.eventDate)
      .map((e) => new Date(e.eventDate as string).getTime())
    for (let k = 0; k < dated.length - 1; k++) {
      expect(dated[k]).toBeLessThanOrEqual(dated[k + 1])
    }
  })
})
