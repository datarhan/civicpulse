import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  groupPoiByCategory,
  poiShapePath,
  POI_CATEGORIES,
  POI_HALO,
  POI_INK,
  POI_SHAPES,
} from '../../src/lib/civic-poi'
import { PARTY_COLORS } from '../../src/lib/party-colors'

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

  it('2 · cada categoría tiene etiqueta, color y una silueta que existe', () => {
    for (const key of CATEGORIAS_DEL_SCRAPER) {
      expect(POI_CATEGORIES[key], key).toBeDefined()
      expect(typeof POI_CATEGORIES[key].label).toBe('string')
      expect(POI_CATEGORIES[key].label.length).toBeGreaterThan(0)
      expect(POI_CATEGORIES[key].color, `color de ${key}`).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(POI_SHAPES[POI_CATEGORIES[key].shape], `silueta de ${key}`).toBeTruthy()
      expect(poiShapePath(key)).toBe(POI_SHAPES[POI_CATEGORIES[key].shape])
    }
  })

  it('3 · las categorías se DISTINGUEN entre sí, en LOS DOS canales', () => {
    // La puerta que faltaba. La rampa de pizarra anterior pasaba «cada categoría
    // tiene un color» con seis grises que el lector no podía separar: el test
    // comprobaba que el campo estaba relleno, no que hiciera su trabajo. Una
    // codificación repetida es una leyenda que promete una distinción que el
    // mapa no dibuja.
    const siluetas = Object.values(POI_CATEGORIES).map((c) => c.shape)
    expect(new Set(siluetas).size, 'dos categorías comparten silueta').toBe(siluetas.length)
    const geometrias = siluetas.map((s) => POI_SHAPES[s])
    expect(new Set(geometrias).size, 'dos siluetas dibujan lo mismo').toBe(geometrias.length)
    const colores = Object.values(POI_CATEGORIES).map((c) => c.color.toLowerCase())
    expect(new Set(colores).size, 'dos categorías comparten color').toBe(colores.length)
  })

  it('3b · dos colores no se parecen tanto como para no distinguirse', () => {
    // «Distintos» como cadena no basta: #0F172A y #243044 son distintos y eran el
    // defecto. La rampa vieja tenía vecinos a ΔRGB≈37; los seis tonos de ahora
    // están a cientos. El umbral es deliberadamente bajo —esto caza una rampa
    // reintroducida, no arbitra matices— pero no es cero, que es lo que la
    // comparación por igualdad medía.
    const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
    const cats = Object.entries(POI_CATEGORIES)
    let peor = { dist: Infinity, par: null }
    for (let i = 0; i < cats.length; i++) {
      for (let j = i + 1; j < cats.length; j++) {
        const [a, b] = [rgb(cats[i][1].color), rgb(cats[j][1].color)]
        const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
        if (d < peor.dist) peor = { dist: d, par: `${cats[i][0]}/${cats[j][0]}` }
      }
    }
    expect(peor.par, 'no se comparó ningún par').not.toBeNull()
    expect(peor.dist, `el par más parecido es ${peor.par}`).toBeGreaterThan(60)
  })

  it('3c · ningún color de POI roba el croma de un partido ni de un veredicto', () => {
    // §02 reserva el croma para cinco veredictos y el acento de marca, y los
    // hexes de partido viven en party-colors.js. Un POI no emite ningún juicio,
    // así que no puede vestirse con el de nadie: un colegio en el rojo de
    // «contradicho» o en el azul del PP dice algo que este proyecto no sostiene.
    // Antes esto era un párrafo de comentario; ahora falla.
    const reservados = {
      ...PARTY_COLORS,
      'veredicto:ok': '#16a34a',
      'veredicto:warn': '#d97706',
      'veredicto:crit': '#dc2626',
      'veredicto:intel': '#7c3aed',
      'marca:civic': '#0e5b62',
      'mapa:dana': '#E08600',
    }
    expect(Object.keys(reservados).length).toBeGreaterThan(8) // se leyó algo
    const choques = []
    for (const [cat, { color }] of Object.entries(POI_CATEGORIES)) {
      for (const [duenyo, hex] of Object.entries(reservados)) {
        if (color.toLowerCase() === hex.toLowerCase()) choques.push(`${cat} = ${duenyo} ${hex}`)
      }
    }
    expect(choques).toEqual([])
  })

  it('3d · cada color se ve sobre su halo blanco (WCAG 1.4.11, 3:1)', () => {
    // La rampa vieja medía su contraste contra la tesela, que cambia bajo el pie
    // —parque, agua, autovía—, y por eso su extremo claro vivía pegado al
    // mínimo. Con halo blanco el fondo es constante y la comprobación es real.
    const canal = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    const lum = (h) =>
      0.2126 * canal(parseInt(h.slice(1, 3), 16) / 255) +
      0.7152 * canal(parseInt(h.slice(3, 5), 16) / 255) +
      0.0722 * canal(parseInt(h.slice(5, 7), 16) / 255)
    const contraste = (a, b) =>
      (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)
    // control: el blanco contra sí mismo es 1:1, así que la fórmula mide algo
    expect(contraste('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5)
    expect(contraste('#000000', '#FFFFFF')).toBeCloseTo(21, 0)
    for (const [cat, { color }] of Object.entries(POI_CATEGORIES)) {
      expect(contraste(color, POI_HALO), `${cat} ${color} sobre el halo`).toBeGreaterThanOrEqual(3)
    }
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
    expect(grouped.get('educacion').color).toBe(POI_CATEGORIES.educacion.color)
    expect(grouped.get('verde').items).toHaveLength(1)
    expect(grouped.has('salud')).toBe(false) // no salud pois → omitted
  })

  it('7 · groupPoiByCategory returns an empty map for no pois', () => {
    expect(groupPoiByCategory([]).size).toBe(0)
    expect(groupPoiByCategory(undefined).size).toBe(0)
  })
})
