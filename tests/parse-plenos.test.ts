import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsePlenosIndex } from '../src/scraper/plenos'

const Y2025 = join(__dirname, 'fixtures', 'rr_plenos_2025_2026-04-19.html')
const Y2024 = join(__dirname, 'fixtures', 'rr_plenos_2024_2026-04-19.html')

describe('scraper/plenos — parsePlenosIndex', () => {
  let items2025: ReturnType<typeof parsePlenosIndex>
  let items2024: ReturnType<typeof parsePlenosIndex>

  beforeAll(() => {
    items2025 = parsePlenosIndex(readFileSync(Y2025, 'utf8'), {
      year: 2025,
      baseUrl: 'http://www.ribarroja.es',
    })
    items2024 = parsePlenosIndex(readFileSync(Y2024, 'utf8'), {
      year: 2024,
      baseUrl: 'http://www.ribarroja.es',
    })
  })

  it('finds >= 10 plenos per full year', () => {
    expect(items2025.length).toBeGreaterThanOrEqual(10)
    expect(items2024.length).toBeGreaterThanOrEqual(10)
  })

  it('every item has a date, title, kind, and link', () => {
    const valid = new Set(['ordinario', 'extraordinario', 'urgente', 'otro'])
    for (const it of [...items2025, ...items2024]) {
      expect(it.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(it.title.length).toBeGreaterThan(5)
      expect(valid.has(it.kind)).toBe(true)
      expect(it.link).toMatch(/^https?:\/\//)
    }
  })

  it('extracts the correct year in every date', () => {
    for (const it of items2025) expect(it.date).toMatch(/^2025-/)
    for (const it of items2024) expect(it.date).toMatch(/^2024-/)
  })

  it('sorts newest-first', () => {
    for (let i = 0; i < items2025.length - 1; i++) {
      expect(items2025[i].date >= items2025[i + 1].date).toBe(true)
    }
  })

  it('captures at least one extraordinario and one ordinario', () => {
    const kinds = new Set(items2025.map((i) => i.kind))
    expect(kinds.has('ordinario')).toBe(true)
    expect(kinds.has('extraordinario')).toBe(true)
  })

  it('unique id per pleno', () => {
    const ids = items2025.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
