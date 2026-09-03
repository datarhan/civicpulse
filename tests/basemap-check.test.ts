/**
 * La guarda del mapa base, probada por donde puede fallar.
 *
 * El defecto que persigue no es un error: es un 200 con una imagen correcta y
 * una marca de agua encima. Así que la prueba que importa no es «¿aprueba
 * cuando todo va bien?» sino «¿suspende cuando la clave no sirve?» — y ése es
 * justo el caso en el que CARTO devuelve exactamente lo mismo que sin clave.
 */
import { describe, expect, it } from 'vitest'
import {
  DESENLACES_QUE_BLOQUEAN,
  bloquea,
  sinClaveConfigurada,
  valorar,
} from '../src/scraper/basemap-check'

describe('check:basemap · valoración', () => {
  it('dos teselas idénticas son una clave que no se honra', () => {
    // Inyección de fallo: es literalmente lo medido contra el CDN el 3-sep —
    // una clave inventada devolvió el mismo md5 que no mandar clave ninguna.
    const p = valorar('abc123', 'abc123')
    expect(p.desenlace).toBe('marcada')
    expect(bloquea(p.desenlace)).toBe(true)
    expect(p.mensaje).toMatch(/IDÉNTICA/)
  })

  it('teselas distintas son una clave viva', () => {
    const p = valorar('conclave', 'sinclave')
    expect(p.desenlace).toBe('ok')
    expect(bloquea(p.desenlace)).toBe(false)
  })

  it('«no contestó» no se dobla dentro de «bien»', () => {
    // Tres formas de no poder mirar, y ninguna puede imprimir el visto bueno:
    // es el defecto `r?.findings ?? []` otra vez.
    for (const par of [
      [null, 'x'],
      ['x', null],
      [null, null],
    ] as const) {
      const p = valorar(par[0], par[1])
      expect(p.desenlace).toBe('inalcanzable')
      expect(p.mensaje).toMatch(/NO COMPROBADO/)
      // No bloquea —una red ajena caída no debe poner roja la nocturna— pero
      // tampoco afirma nada.
      expect(bloquea(p.desenlace)).toBe(false)
      expect(p.mensaje).not.toMatch(/se honra/)
    }
  })

  it('sin clave configurada lo dice, y bloquea', () => {
    const p = sinClaveConfigurada()
    expect(p.desenlace).toBe('sin-clave')
    expect(bloquea(p.desenlace)).toBe(true)
    expect(p.mensaje).toMatch(/VITE_CARTO_API_KEY/)
  })

  it('la lista de desenlaces que bloquean se importa, no se repite', () => {
    // Una prueba que reescribe la constante no puede notar que la constante
    // dejó de ser cierta: es la regla 1 de DATA_INTEGRITY.
    expect([...DESENLACES_QUE_BLOQUEAN].sort()).toEqual(['marcada', 'sin-clave'])
    for (const d of DESENLACES_QUE_BLOQUEAN) expect(bloquea(d)).toBe(true)
  })
})
