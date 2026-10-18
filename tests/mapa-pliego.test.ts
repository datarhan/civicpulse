import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  anillos,
  dentro,
  recortar,
  simplificar,
  mapaDelPliego,
  type ConfigMapa,
  type ElementoOsm,
  type Pt,
} from '../src/scraper/mapa-pliego'
import { CONFIG_MAPA_PLIEGO } from '../src/scraper/mapa-pliego-config'

// Respuesta real de Overpass (out geom) del 18-10-2026: la relación del Parc
// Natural del Túria, las tres calles que nombra el pliego, el río y el nodo de
// Porxinos.
const osm = JSON.parse(
  readFileSync('tests/fixtures/osm_matriculas-pliego_2026-10-18.json', 'utf8'),
) as { elements: ElementoOsm[] }
const parque = osm.elements.find((e) => e.type === 'relation' && e.id === 3774370) as ElementoOsm

describe('anillos', () => {
  it('une las vías de la relación en anillos cerrados, exteriores e interiores', () => {
    const r = anillos(parque)
    expect(r.length).toBeGreaterThan(30) // el parque tiene decenas de huecos
    for (const ring of r) expect(ring[0]).toEqual(ring[ring.length - 1])
  })

  it('lanza si un anillo no cierra', () => {
    const roto: ElementoOsm = {
      type: 'relation',
      id: 1,
      members: [
        {
          type: 'way',
          ref: 2,
          role: 'outer',
          geometry: [
            { lat: 0, lon: 0 },
            { lat: 0, lon: 1 },
            { lat: 1, lon: 1 },
          ],
        },
      ],
    }
    expect(() => anillos(roto)).toThrow(/no cierra/)
  })
})

describe('dentro', () => {
  const cuadrado: Pt[] = [
    [0, 0],
    [0, 10],
    [10, 10],
    [10, 0],
    [0, 0],
  ]
  const hueco: Pt[] = [
    [4, 4],
    [4, 6],
    [6, 6],
    [6, 4],
    [4, 4],
  ]
  it('par-impar: un hueco saca el punto', () => {
    expect(dentro([2, 2], [cuadrado, hueco])).toBe(true)
    expect(dentro([5, 5], [cuadrado, hueco])).toBe(false)
    expect(dentro([20, 5], [cuadrado, hueco])).toBe(false)
  })
})

describe('recortar', () => {
  it('deja dentro del rectángulo lo que lo cruza, cerrado, y descarta lo que queda fuera', () => {
    const grande: Pt[] = [
      [0, 0],
      [0, 10],
      [10, 10],
      [10, 0],
      [0, 0],
    ]
    const r = recortar(grande, [2, 2, 4, 4])
    expect(r[0]).toEqual(r[r.length - 1])
    for (const [la, lo] of r) {
      expect(la).toBeGreaterThanOrEqual(2)
      expect(la).toBeLessThanOrEqual(4)
      expect(lo).toBeGreaterThanOrEqual(2)
      expect(lo).toBeLessThanOrEqual(4)
    }
    expect(recortar(grande, [20, 20, 30, 30])).toEqual([])
  })
})

describe('simplificar', () => {
  it('conserva los extremos y quita lo que está dentro de la tolerancia', () => {
    const l: Pt[] = [
      [39.5, -0.5],
      [39.50001, -0.49],
      [39.5, -0.48],
    ]
    const s = simplificar(l, 5)
    expect(s[0]).toEqual(l[0])
    expect(s[s.length - 1]).toEqual(l[2])
    expect(s.length).toBe(2)
  })
})

describe('mapaDelPliego, con la configuración publicada', () => {
  const m = mapaDelPliego(osm.elements, CONFIG_MAPA_PLIEGO)

  it('dibuja las tres calles del pliego, cada una con sus vías', () => {
    expect(m.aparcamientos.map((a) => a.nombre)).toEqual(
      CONFIG_MAPA_PLIEGO.aparcamientos.map((a) => a.nombre),
    )
    for (const a of m.aparcamientos) {
      expect(a.ways.length, a.calle).toBeGreaterThan(0)
      expect(a.tramos.length, a.calle).toBe(a.ways.length)
    }
  })

  it('ninguna de las tres calles cae en el parque — lo que afirma la pieza', () => {
    expect(m.aparcamientos.map((a) => a.dentroDelParque)).toEqual([false, false, false])
  })

  it('la comprobación distingue: un punto del cauce, dentro del parque, sale dentro', () => {
    // Prueba de trabajo: si `dentro` devolviera siempre false, la de arriba
    // pasaría sin medir nada. El Túria a su paso por el parque, aguas abajo de
    // Riba-roja.
    const rings = anillos(parque)
    const enElCauce = m.rio!.tramos.flat().filter((p) => dentro(p, rings))
    expect(enElCauce.length).toBeGreaterThan(10)
  })

  it('el rótulo del parque cae dentro del parque y dentro del encuadre', () => {
    const [s, w, n, e] = CONFIG_MAPA_PLIEGO.encuadre
    const [la, lo] = m.parque.rotulo
    expect(dentro(m.parque.rotulo, anillos(parque))).toBe(true)
    expect(la > s && la < n && lo > w && lo < e).toBe(true)
  })

  it('el lugar es el nodo de Porxinos', () => {
    expect(m.lugar.punto).toEqual([39.53625, -0.59661])
  })

  it('lanza si una calle configurada no está en la respuesta', () => {
    const cfg: ConfigMapa = {
      ...CONFIG_MAPA_PLIEGO,
      aparcamientos: [{ nombre: 'X', calle: 'Carrer que no existeix' }],
    }
    expect(() => mapaDelPliego(osm.elements, cfg)).toThrow(/no está en la respuesta/)
  })
})
