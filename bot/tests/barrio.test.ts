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

/**
 * El borde de cada barrio: el radio es la mitad de la distancia a su vecino más
 * cercano, y nunca más de RADIO_MAXIMO_M.
 *
 * Ninguna prueba medía el borde, así que quitar el tope o quitar la mitad seguía
 * en verde (las dos mutaciones sobrevivían, revisión de #131). Aquí r se deriva
 * de geo.json barrio a barrio y se mira a 0,9 r —dentro— y a 1,1 r —fuera—, y
 * se exige que haya barrios de las DOS clases: los que limita el tope y los que
 * limita la mitad. Sin una de las dos, su mutación volvería a pasar.
 */
describe('situar: el borde de cada barrio', () => {
  const R = 6371000
  const rad = (x: number) => (x * Math.PI) / 180
  const deg = (x: number) => (x * 180) / Math.PI
  const distancia = (a: [number, number], b: [number, number]) => {
    const h =
      Math.sin(rad(b[0] - a[0]) / 2) ** 2 +
      Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2
    return 2 * R * Math.asin(Math.sqrt(h))
  }
  const radioDe = (n: { slug: string; centroid: [number, number] }) =>
    Math.min(
      Math.min(
        ...GEO.neighborhoods.filter((m) => m !== n).map((m) => distancia(n.centroid, m.centroid)),
      ) / 2,
      RADIO_MAXIMO_M,
    )
  /** Un punto a `metros` del centroide, en la primera de cuatro direcciones que siga en el término. */
  const aDistancia = (c: [number, number], metros: number): [number, number] | null => {
    const pasos: Array<[number, number]> = [
      [deg(metros / R), 0],
      [-deg(metros / R), 0],
      [0, deg(metros / (R * Math.cos(rad(c[0]))))],
      [0, -deg(metros / (R * Math.cos(rad(c[0]))))],
    ]
    for (const [dLat, dLng] of pasos) {
      const p: [number, number] = [c[0] + dLat, c[1] + dLng]
      if (situar(...p).situacion !== 'fuera-del-termino') return p
    }
    return null
  }

  it('a 0,9 r cae en su barrio y a 1,1 r ya no, en todos', () => {
    let porTope = 0
    let porMitad = 0
    let probados = 0
    for (const n of GEO.neighborhoods) {
      const r = radioDe(n)
      const dentro = aDistancia(n.centroid, 0.9 * r)
      const fuera = aDistancia(n.centroid, 1.1 * r)
      if (!dentro || !fuera) continue
      probados += 1
      if (r === RADIO_MAXIMO_M) porTope += 1
      else porMitad += 1
      expect(situar(...dentro), `${n.slug} a 0,9 r`).toMatchObject({
        situacion: 'barrio',
        slug: n.slug,
      })
      expect(situar(...fuera), `${n.slug} a 1,1 r`).not.toMatchObject({
        situacion: 'barrio',
        slug: n.slug,
      })
    }
    expect(probados).toBeGreaterThan(GEO.neighborhoods.length * 0.8)
    expect(porTope, 'barrios que limita el tope').toBeGreaterThan(0)
    expect(porMitad, 'barrios que limita la mitad').toBeGreaterThan(0)
  })

  it('con el término pero sin barrios, lo de fuera sigue fuera', () => {
    // Antes, sin barrios devolvía `sin-geo` sin mirar el término, y el bot
    // aceptaba una ubicación de otro municipio.
    const soloTermino = { boundary: GEO.boundary }
    expect(situarEn(soloTermino, ...VALENCIA)).toEqual({ situacion: 'fuera-del-termino' })
    expect(situarEn(soloTermino, ...AJUNTAMENT)).toEqual({ situacion: 'sin-geo' })
  })
})
