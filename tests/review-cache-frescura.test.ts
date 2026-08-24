import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  sirveElVeredictoCacheado,
  readCacheEntry,
  type ReviewCacheEntry,
} from '../src/scraper/reader-review'

/**
 * «Sin leer desde hace seis días» sobre una página leída hoy.
 *
 * El barrido nocturno del 24-08-2026 recorrió las 30 rutas públicas al 100 % y
 * el digest siguió publicando «9 ruta(s) sin leer desde hace más de 3 días»,
 * nombrando cuatro de ellas con su antigüedad. Las dos cosas eran ciertas a la
 * vez porque medían cosas distintas: 11 de esas rutas se resolvieron por
 * acierto de caché —el texto renderizado era idéntico— y la rama del acierto
 * hacía `continue` sin tocar la entrada, así que `at` conservaba la fecha de la
 * última LLAMADA al modelo, no la de la última comprobación.
 *
 * Un control que nombra nueve rutas como desatendidas el mismo día en que se
 * atendieron es un control que se aprende a ignorar, que es exactamente lo que
 * este repositorio lleva pagando todo el mes.
 *
 * Y al arreglarlo apareció el agujero de al lado: la caché de LLM
 * (`cacheKey` en src/llm/client.ts) SÍ lleva `promptVersion`, y ésta no. Con el
 * texto igual, un cambio de prompt no re-revisaba nada — y refrescar `at` en
 * cada acierto lo habría empeorado, dejando la entrada con pinta de recién
 * comprobada bajo una pregunta que ya no se hace.
 */

describe('reutilizar un veredicto exige texto igual Y pregunta igual', () => {
  const base: ReviewCacheEntry = {
    hash: 'aaaa',
    findings: [],
    at: '2026-08-18T05:34:00.000Z',
    promptVersion: 'reader-review-v2',
  }

  it('sirve cuando coinciden las dos cosas', () => {
    expect(sirveElVeredictoCacheado(base, 'aaaa', 'reader-review-v2')).toBe(true)
  })

  it('NO sirve si la página cambió', () => {
    expect(sirveElVeredictoCacheado(base, 'bbbb', 'reader-review-v2')).toBe(false)
  })

  it('NO sirve si cambió la versión del prompt, aunque el texto sea idéntico', () => {
    expect(sirveElVeredictoCacheado(base, 'aaaa', 'reader-review-v3')).toBe(false)
  })

  it('una entrada SIN versión se vuelve a revisar — falla hacia MÁS revisión', () => {
    const vieja: ReviewCacheEntry = { hash: 'aaaa', findings: [] }
    expect(sirveElVeredictoCacheado(vieja, 'aaaa', 'reader-review-v2')).toBe(false)
  })

  it('sin entrada previa, no sirve', () => {
    expect(sirveElVeredictoCacheado(null, 'aaaa', 'reader-review-v2')).toBe(false)
  })

  it('readCacheEntry conserva la versión, y el formato viejo no la inventa', () => {
    expect(readCacheEntry(base)?.promptVersion).toBe('reader-review-v2')
    expect(readCacheEntry('aaaa')?.promptVersion).toBeUndefined()
  })
})

// ─── Y que el acierto de caché lo ESCRIBA de verdad ─────────────────────────
//
// El predicado puro puede estar perfecto y la rama seguir haciendo `continue`
// sin escribir: ese fue literalmente el defecto. Se comprueba sobre el código
// fuente, que es donde vivía.

describe('la rama de acierto de caché refresca la entrada', () => {
  const src = readFileSync(resolve('scripts/review-surfaces.ts'), 'utf8')

  it('mide algo: el fichero se lee y usa el predicado', () => {
    expect(src.length).toBeGreaterThan(1000)
    expect(src).toContain('sirveElVeredictoCacheado')
  })

  it('escribe cache[route] dentro del acierto, con at y promptVersion', () => {
    const i = src.indexOf('sirveElVeredictoCacheado(prev, h, READER_REVIEW_PROMPT_VERSION)')
    expect(i, 'no se encuentra la rama del acierto').toBeGreaterThan(-1)
    // La ventana hasta el `continue` de esa rama.
    const rama = src.slice(i, src.indexOf('continue', i))
    expect(rama, 'el acierto no reescribe la entrada').toContain('cache[route] = {')
    expect(rama, 'el acierto no actualiza `at`').toContain('at: new Date().toISOString()')
    expect(rama, 'el acierto no registra la versión de prompt').toContain('promptVersion')
    // Lo que NO puede pasar: perder los hallazgos al refrescar la fecha.
    expect(rama, 'el acierto pierde los señalamientos vivos').toContain('findings: prev!.findings')
  })
})
