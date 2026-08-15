import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  groupPoiByCategory,
  poiShapePath,
  POI_CATEGORIES,
  POI_INK,
  POI_SHAPES,
} from '../../src/lib/civic-poi'

/**
 * Las categorías vivían dos veces: el enum `PoiCategory` del scraper y las
 * claves de POI_CATEGORIES, unidas por un comentario que pedía «keep the two in
 * sync» y por nada más. Este fichero las lee del scraper en vez de volver a
 * escribirlas a mano — copiar una forma dentro del test que la vigila es cómo
 * seis suites de este repo se quedaron verdes midiendo nada.
 */
const SCRAPER = readFileSync(join(__dirname, '../../src/scraper/civic-poi.ts'), 'utf8')
const CATEGORIAS_DEL_SCRAPER = (SCRAPER.match(/export type PoiCategory =([^\n]+)/)?.[1] ?? '')
  .match(/'([a-z]+)'/g)
  ?.map((s) => s.replace(/'/g, ''))

describe('lib/civic-poi', () => {
  it('0 · el enum del scraper se leyó de verdad', () => {
    // Si el `match` falla devuelve undefined y todas las comparaciones de abajo
    // pasarían contra una lista vacía: el desenlace exacto que este repo llama
    // «verde por no ejecutarse».
    expect(CATEGORIAS_DEL_SCRAPER, 'PoiCategory no se pudo leer del scraper').toBeDefined()
    expect(CATEGORIAS_DEL_SCRAPER.length).toBeGreaterThan(3)
  })

  it('1 · POI_CATEGORIES cubre el enum del scraper, sin sobras', () => {
    expect([...Object.keys(POI_CATEGORIES)].sort()).toEqual([...CATEGORIAS_DEL_SCRAPER].sort())
  })

  it('2 · cada categoría tiene etiqueta y una silueta que existe', () => {
    for (const key of CATEGORIAS_DEL_SCRAPER) {
      expect(POI_CATEGORIES[key], key).toBeDefined()
      expect(typeof POI_CATEGORIES[key].label).toBe('string')
      expect(POI_CATEGORIES[key].label.length).toBeGreaterThan(0)
      expect(POI_SHAPES[POI_CATEGORIES[key].shape], `silueta de ${key}`).toBeTruthy()
      expect(poiShapePath(key)).toBe(POI_SHAPES[POI_CATEGORIES[key].shape])
    }
  })

  it('3 · las categorías se DISTINGUEN entre sí', () => {
    // La puerta que faltaba. La rampa de pizarra anterior pasaba «cada categoría
    // tiene un color» con seis grises que el lector no podía separar: el test
    // comprobaba que el campo estaba relleno, no que hiciera su trabajo. Una
    // codificación repetida es una leyenda que promete una distinción que el
    // mapa no dibuja.
    const siluetas = Object.values(POI_CATEGORIES).map((c) => c.shape)
    expect(new Set(siluetas).size, 'dos categorías comparten silueta').toBe(siluetas.length)
    const geometrias = siluetas.map((s) => POI_SHAPES[s])
    expect(new Set(geometrias).size, 'dos siluetas dibujan lo mismo').toBe(geometrias.length)
  })

  it('4 · una silueta desconocida no se inventa', () => {
    // El scraper tiene el enum cerrado; una séptima categoría significa que los
    // dos ficheros se han desincronizado. Repartir una forma al azar la haría
    // pasar por una categoría de verdad.
    expect(poiShapePath('parking')).toBeNull()
    expect(poiShapePath(undefined)).toBeNull()
  })

  it('5 · la tinta es un hex opaco único', () => {
    expect(POI_INK).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  it('6 · groupPoiByCategory agrupa, omite vacías y trae la geometría', () => {
    const pois = [
      { id: 'a', name: 'CEIP', category: 'educacion', lat: 39.5, lng: -0.5 },
      { id: 'b', name: 'Parc', category: 'verde', lat: 39.5, lng: -0.5 },
      { id: 'c', name: 'IES', category: 'educacion', lat: 39.5, lng: -0.5 },
    ]
    const grouped = groupPoiByCategory(pois)
    expect(grouped.get('educacion').items).toHaveLength(2)
    expect(grouped.get('educacion').label).toBe(POI_CATEGORIES.educacion.label)
    // La leyenda pinta esta `path`; el marcador del mapa pinta la suya desde el
    // mismo módulo. Que sean la misma cadena es lo que impide que el swatch
    // explique una forma que el mapa dejó de dibujar.
    expect(grouped.get('educacion').path).toBe(poiShapePath('educacion'))
    expect(grouped.get('verde').items).toHaveLength(1)
    expect(grouped.has('salud')).toBe(false) // no salud pois → omitted
  })

  it('7 · groupPoiByCategory returns an empty map for no pois', () => {
    expect(groupPoiByCategory([]).size).toBe(0)
    expect(groupPoiByCategory(undefined).size).toBe(0)
  })
})
