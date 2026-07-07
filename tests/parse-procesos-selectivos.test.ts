import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseProcesosList } from '../src/scraper/procesos-selectivos'

const html = readFileSync(join(__dirname, 'fixtures', 'procesos-selectivos_2026-07.html'), 'utf8')

describe('parseProcesosList', () => {
  const rows = parseProcesosList(html)

  it('extracts the municipal hiring processes (deduped)', () => {
    expect(rows.length).toBeGreaterThanOrEqual(8)
    const urls = rows.map((r) => r.url)
    expect(new Set(urls).size).toBe(urls.length) // no dup URLs
    for (const r of rows) {
      expect(r.titulo.length).toBeGreaterThan(6)
      expect(r.url).toMatch(/^https?:\/\//)
      expect(r.id.length).toBeGreaterThan(0)
    }
  })

  it('classifies tipo from the title', () => {
    const byTitle = (needle: string) => rows.find((r) => r.titulo.toLowerCase().includes(needle))
    // "Bolsa de trabajo …" → bolsa; "Procesos estabilización Ley 20/21" → estabilizacion
    expect(byTitle('bolsa de trabajo')?.tipo).toBe('bolsa')
    expect(byTitle('estabilizaci')?.tipo).toBe('estabilizacion')
    // "Proceso selectivo … Conserje" / "Provisión … plazas" → oposicion
    expect(rows.some((r) => r.tipo === 'oposicion')).toBe(true)
  })
})
