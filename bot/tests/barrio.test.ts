import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  matchNeighborhood,
  situar,
  situarEn,
  SITUACIONES,
  RADIO_MAXIMO_M,
} from '../src/services/neighborhoods'

/**
 * Dónde cae un punto: en un barrio, en el término pero en ninguno, o fuera.
 *
 * Hasta el 2026-09-27 se tomaba el centroide más cercano a menos de 2 km, sin
 * mirar el término. El propio Ajuntament caía en `poligono-industrial-entrevias`,
 * a 1.752 m, porque el casco —donde vive la mayor parte del pueblo— no tiene
 * centroide en geo.json; y un punto de otro municipio se atribuía a la
 * urbanización más próxima. Un fallo honesto es mejor que un pin equivocado.
 *
 * Se mide contra el geo.json de verdad, el que lee el bot.
 */
const GEO = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'public', 'data', 'geo.json'), 'utf8'),
) as {
  boundary: { polygon: [number, number][] }
  neighborhoods: Array<{ slug: string; centroid: [number, number] }>
}

const AJUNTAMENT: [number, number] = [39.5467, -0.5697]
const VALENCIA: [number, number] = [39.4699, -0.3763]

describe('situar', () => {
  it('mira algo: el término tiene su polígono y hay barrios con centroide', () => {
    expect(GEO.boundary.polygon.length).toBeGreaterThan(100)
    expect(GEO.neighborhoods.length).toBeGreaterThan(10)
  })

  it('cada situación declarada sale de algún punto: ninguna es letra muerta', () => {
    // Se lee el enum exportado, no se copia (regla 1 de DATA_INTEGRITY).
    const vistas = new Set([
      situar(...AJUNTAMENT).situacion,
      situar(...VALENCIA).situacion,
      situar(...GEO.neighborhoods[0].centroid).situacion,
      situarEn({}, ...AJUNTAMENT).situacion,
    ])
    expect([...vistas].sort()).toEqual([...SITUACIONES].sort())
  })

  it('el Ajuntament está en el término y en ningún barrio (no en Entrevías)', () => {
    expect(situar(...AJUNTAMENT)).toEqual({ situacion: 'sin-barrio' })
    expect(matchNeighborhood(...AJUNTAMENT)).toBeNull()
  })

  it('cada centroide cae en su propio barrio (el control)', () => {
    for (const n of GEO.neighborhoods) {
      const s = situar(...n.centroid)
      expect(s, n.slug).toMatchObject({ situacion: 'barrio', slug: n.slug })
    }
  })

  it('un punto de otro municipio está fuera del término', () => {
    expect(situar(...VALENCIA)).toEqual({ situacion: 'fuera-del-termino' })
    expect(matchNeighborhood(...VALENCIA)).toBeNull()
  })

  it('más allá del radio de un barrio no se le atribuye, aunque sea el más cercano', () => {
    // A 1,5 km al norte de un centroide cualquiera ya no es ese barrio.
    const n = GEO.neighborhoods[0]
    const lejos: [number, number] = [n.centroid[0] + 1500 / 111_000, n.centroid[1]]
    const s = situar(...lejos)
    expect(s.situacion === 'barrio' && s.slug === n.slug).toBe(false)
    expect(RADIO_MAXIMO_M).toBeLessThan(1500)
  })

  it('sin geo.json no se inventa un barrio: lo dice', () => {
    expect(situarEn({}, ...AJUNTAMENT)).toEqual({ situacion: 'sin-geo' })
  })
})
