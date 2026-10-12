import { describe, expect, it } from 'vitest'
import {
  RADIO_PUNTO_BARRIO,
  barriosBajoElPin,
  barriosQueCeden,
} from '../../src/lib/barrios-bajo-pines'

// Coordenadas en píxeles de pantalla, como las da `map.latLngToContainerPoint`.
const LLOBATERA = { id: 'llobatera', x: 100, y: 100 }
const CARASOLES = { id: 'carasoles', x: 300, y: 100 }

describe('barriosQueCeden', () => {
  it('cede el punto que tapa el centro de un pin: el del propio barrio, en el mismo punto', () => {
    const ceden = barriosQueCeden([LLOBATERA, CARASOLES], [{ x: 100, y: 100, radio: 9 }])
    expect([...ceden]).toEqual(['llobatera'])
  })

  it('y también el de otro lugar a menos de un radio de punto', () => {
    const cerca = { x: 100 + RADIO_PUNTO_BARRIO - 0.5, y: 100, radio: 9 }
    expect([...barriosQueCeden([LLOBATERA], [cerca])]).toEqual(['llobatera'])
  })

  it('no cede el que sólo roza el borde del pin: el centro del pin queda libre', () => {
    // El punto cae dentro del círculo, pero lejos del centro: el pin se sigue
    // pulsando por su centro y el barrio por su punto, como antes.
    const grande = { x: 100 + RADIO_PUNTO_BARRIO + 2, y: 100, radio: 26 }
    expect(barriosQueCeden([LLOBATERA], [grande]).size).toBe(0)
  })

  it('un pin de radio cero no se pinta, así que no se lleva ningún toque', () => {
    expect(barriosQueCeden([LLOBATERA], [{ x: 100, y: 100, radio: 0 }]).size).toBe(0)
  })
})

describe('barriosBajoElPin', () => {
  const ceden = new Set(['llobatera'])

  it('lleva al barrio que cede si su punto queda dentro del círculo del pin', () => {
    // No sólo el pin concéntrico: el que va encima en ese punto puede ser otro
    // pin mayor, y es el que recibe el toque, así que también lleva el enlace.
    const mayor = { x: 115, y: 100, radio: 20 }
    expect(barriosBajoElPin(mayor, [LLOBATERA, CARASOLES], ceden)).toEqual([LLOBATERA])
  })

  it('no lleva a un barrio que no cede: ése se abre por su punto', () => {
    const sobreCarasoles = { x: 300, y: 100, radio: 20 }
    expect(barriosBajoElPin(sobreCarasoles, [LLOBATERA, CARASOLES], ceden)).toEqual([])
  })

  it('ni a uno que cede pero queda fuera de este pin', () => {
    const lejos = { x: 160, y: 100, radio: 20 }
    expect(barriosBajoElPin(lejos, [LLOBATERA], ceden)).toEqual([])
  })
})
