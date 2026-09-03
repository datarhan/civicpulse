import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsePlenosIndex, parseRegmeetSessions, mergePlenoSessions } from '../src/scraper/plenos'

const Y2025 = join(__dirname, 'fixtures', 'rr_plenos_2025_2026-04-19.html')
const Y2024 = join(__dirname, 'fixtures', 'rr_plenos_2024_2026-04-19.html')
const REGMEET_Y2026 = join(__dirname, 'fixtures', 'regmeet_aytoribarroja_2026_2026-05-25.html')

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

  it('captures at least one ordinario plus some special session (extraordinario or urgente)', () => {
    const kinds = new Set(items2025.map((i) => i.kind))
    expect(kinds.has('ordinario')).toBe(true)
    expect(kinds.has('extraordinario') || kinds.has('urgente')).toBe(true)
  })

  it('unique id per pleno', () => {
    const ids = items2025.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('scraper/plenos — parseRegmeetSessions', () => {
  let items: ReturnType<typeof parseRegmeetSessions>

  beforeAll(() => {
    items = parseRegmeetSessions(readFileSync(REGMEET_Y2026, 'utf8'), { year: 2026 })
  })

  it('parses every session row in the 2026 fixture (7 sessions)', () => {
    expect(items.length).toBe(7)
  })

  it('every item has a valid date, title, kind, and absolute regmeet link', () => {
    const valid = new Set(['ordinario', 'extraordinario', 'urgente', 'otro'])
    for (const it of items) {
      expect(it.date).toMatch(/^2026-\d{2}-\d{2}$/)
      expect(it.title.length).toBeGreaterThan(5)
      expect(valid.has(it.kind)).toBe(true)
      expect(it.link).toMatch(/^https:\/\/regmeet\.com\/aytoribarroja\/participaciones\//)
    }
  })

  it('classifies "Sesiones plenarias extraordinarias y urgentes" rows as urgente', () => {
    // The 2026-03-16 and 2026-01-07 sessions are extraordinarias y urgentes per the fixture.
    const urgentes = items.filter((i) => i.kind === 'urgente').map((i) => i.date)
    expect(urgentes).toContain('2026-03-16')
    expect(urgentes).toContain('2026-01-07')
  })

  it('sorts newest-first', () => {
    for (let i = 0; i < items.length - 1; i++) {
      expect(items[i].date >= items[i + 1].date).toBe(true)
    }
  })

  it('reuses an existing id when existingIdByDate has a match for the date', () => {
    const map = new Map<string, string>([['2026-05-11', 'legacy-id-aaa']])
    const withMap = parseRegmeetSessions(readFileSync(REGMEET_Y2026, 'utf8'), {
      year: 2026,
      existingIdByDate: map,
    })
    const may11 = withMap.find((i) => i.date === '2026-05-11')
    expect(may11?.id).toBe('legacy-id-aaa')
    // Other rows mint a fresh id (not 'legacy-id-aaa')
    const others = withMap.filter((i) => i.date !== '2026-05-11')
    for (const o of others) expect(o.id).not.toBe('legacy-id-aaa')
  })

  it('unique id per pleno', () => {
    const ids = items.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

// ---------------------------------------------------------------------------
/**
 * La ventana de cuatro años no puede TIRAR lo que ya se publicó.
 *
 * `scrape-plenos` pide `[hoy, hoy-1, hoy-2, hoy-3]` y reconstruía el fichero
 * entero con lo que devolvieran esos cuatro. Dos consecuencias, las dos
 * medidas el 2026-09-03:
 *
 *  · El 1 de enero de 2027 las 17 sesiones de 2023 desaparecen solas, y con
 *    ellas 2 trozos de declaraciones (255 filas) y 5 órdenes del día.
 *  · `fetchYear` devolvía `[]` ante cualquier respuesta que no fuera 200, con
 *    un `console.warn`, y el proceso salía 0. Un año que da 404 y un año sin
 *    sesiones eran indistinguibles en la salida: `stats.total` bajaba y nadie
 *    se enteraba.
 *
 * Se copia la forma del adaptador hermano (`mergeAgendaPlenos`): lo ya visto
 * se arrastra, lo nuevo pisa. Arrastrar es lo que hace que fallar en alto no
 * sea destructivo — la lista no puede encoger, así que el guión puede
 * permitirse salir 1 sin borrar nada.
 */
describe('mergePlenoSessions — la ventana no puede encoger la lista', () => {
  const s = (id: string, date: string, kind = 'ordinario') => ({
    id,
    title: `Pleno ${date}`,
    date,
    kind: kind as never,
    link: `https://regmeet.com/${id}`,
  })

  it('arrastra una sesión que la ventana ya no pide', () => {
    const r = mergePlenoSessions(
      [s('a', '2023-01-23'), s('b', '2026-07-27')],
      [s('b', '2026-07-27')],
    )
    expect(r.items.map((x) => x.id)).toEqual(['b', 'a'])
    expect(r.carriedForward).toBe(1)
    expect(r.refreshed).toBe(1)
  })

  it('lo recién traído pisa a lo guardado con el mismo id', () => {
    const r = mergePlenoSessions(
      [{ ...s('a', '2026-03-09'), title: 'viejo' }],
      [{ ...s('a', '2026-03-09'), title: 'nuevo' }],
    )
    expect(r.items).toHaveLength(1)
    expect(r.items[0].title).toBe('nuevo')
  })

  it('un año caído no borra nada: sin nada traído se conserva todo', () => {
    const previas = [s('a', '2023-01-23'), s('b', '2024-05-05'), s('c', '2026-07-27')]
    const r = mergePlenoSessions(previas, [])
    expect(r.items).toHaveLength(3)
    expect(r.refreshed).toBe(0)
    expect(r.carriedForward).toBe(3)
  })

  it('ordena de más nueva a más vieja', () => {
    const r = mergePlenoSessions(
      [],
      [s('a', '2024-01-01'), s('c', '2026-07-27'), s('b', '2025-06-06')],
    )
    expect(r.items.map((x) => x.date)).toEqual(['2026-07-27', '2025-06-06', '2024-01-01'])
  })

  it('arranque en limpio: sin nada guardado publica lo traído', () => {
    const r = mergePlenoSessions([], [s('a', '2026-07-27')])
    expect(r.items).toHaveLength(1)
    expect(r.carriedForward).toBe(0)
    expect(r.refreshed).toBe(1)
  })
})
