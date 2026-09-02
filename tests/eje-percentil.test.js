import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  geometriaEje,
  ticksRango,
  PCT_MEDIANA,
  PCT_IQR,
} from '../src/components/eficiencia/eje-percentil'
import { cruzaMediana } from '../src/scraper/indicador-areas'

/**
 * La geometría del eje, medida y no mirada.
 *
 * El defecto que abre este rediseño era exactamente esto: `BandaPares` escalaba
 * la tira al mínimo-máximo de los VALORES de los comparables, así que el punto
 * de los colegios caía al 11 % de la tira mientras el rótulo decía «percentil
 * 85». Ninguna suite lo vio porque todas comprobaban texto. Aquí se comprueba
 * el número que sale al atributo `left`.
 */
const snap = JSON.parse(readFileSync(join(__dirname, '..', 'public/data/indicadores.json'), 'utf8'))

describe('geometriaEje — el percentil ES la posición', () => {
  it('el marcador cae en su propio percentil, no en su valor', () => {
    expect(geometriaEje({ percentil: 85, banda: [73, 95] }).marcador.left).toBe(85)
    expect(geometriaEje({ percentil: 13, banda: [3, 27] }).marcador.left).toBe(13)
    expect(geometriaEje({ percentil: 0, banda: [0, 9] }).marcador.left).toBe(0)
    expect(geometriaEje({ percentil: 100, banda: [91, 100] }).marcador.left).toBe(100)
  })

  it('la escala es fija: la mediana siempre en el 50 y el grueso del 25 al 75', () => {
    expect(PCT_MEDIANA).toBe(50)
    expect(PCT_IQR).toEqual({ left: 25, width: 50 })
  })

  it('la banda plausible ocupa exactamente su intervalo', () => {
    const g = geometriaEje({ percentil: 85, banda: [73, 95] })
    expect(g.banda).toEqual({ left: 73, width: 22 })
  })

  it('una banda que cruza la mediana deja el marcador HUECO', () => {
    expect(geometriaEje({ percentil: 64, banda: [49, 77] }).marcador.hueco).toBe(true)
    expect(geometriaEje({ percentil: 85, banda: [73, 95] }).marcador.hueco).toBe(false)
  })

  it('sin banda el marcador no es hueco ni sólido por accidente: no hay banda que pintar', () => {
    const g = geometriaEje({ percentil: 44, banda: null })
    expect(g.banda).toBe(null)
    expect(g.marcador.hueco).toBe(false)
  })

  it('recorta a la escala en vez de salirse del carril', () => {
    expect(geometriaEje({ percentil: 140, banda: null }).marcador.left).toBe(100)
    expect(geometriaEje({ percentil: -8, banda: null }).marcador.left).toBe(0)
    expect(geometriaEje({ percentil: 50, banda: [-5, 130] }).banda).toEqual({ left: 0, width: 100 })
  })

  it('sin percentil no dibuja marcador: null, no un 0 que parece un puesto', () => {
    expect(geometriaEje({ percentil: null, banda: null }).marcador).toBe(null)
    expect(geometriaEje({ percentil: undefined, banda: [3, 27] }).marcador).toBe(null)
  })

  /**
   * El eje va en percentiles y la ley va en días. La fuente publica el percentil
   * de Riba-roja y NO el de los 30 días del plazo legal, así que una línea roja
   * ahí sería la única cifra inventada de la página, en el sitio donde más
   * pesa. El hecho legal se dice en texto. Esta prueba impide que vuelva por la
   * puerta de atrás.
   */
  it('no hay forma de colar un umbral por el eje: sólo percentil y banda', () => {
    const g = geometriaEje({ percentil: 94, banda: [90, 98], referencia: { pct: 68 } })
    expect(g.referencia).toBeUndefined()
    expect(Object.keys(g).sort()).toEqual(['banda', 'iqr', 'marcador', 'mediana'])
  })

  /**
   * El acuerdo con la regla de la página: el hueco del eje y el veredicto del
   * módulo puro salen de la misma función. Si divergen, la fila diría una cosa
   * y la pastilla de al lado otra.
   */
  it('el hueco concuerda con `cruzaMediana` en las catorce fichas comparables', () => {
    // Catorce desde el 2026-09-02: el agua y el alcantarillado ganaron banda al
    // dejar de rechazarse toda concesión. El recuento va fijo a propósito —una
    // ficha que se cayera de la comparación pasaría inadvertida con un `>0`.
    const comparables = snap.indicadores.filter((i) => i.pares?.percentilBanda)
    expect(comparables.length).toBe(14)
    let huecos = 0
    for (const i of comparables) {
      const g = geometriaEje({ percentil: i.pares.percentil, banda: i.pares.percentilBanda })
      expect(g.marcador.hueco, `${i.id}`).toBe(cruzaMediana(i.pares))
      if (g.marcador.hueco) huecos++
    }
    expect(huecos).toBe(6)
  })
})

describe('ticksRango — cada comparable es una raya, ordenada por puesto', () => {
  it('reparte n rayas por igual y la última cierra la escala', () => {
    const t = ticksRango(41)
    expect(t).toHaveLength(41)
    expect(t[0]).toBeCloseTo(2.439, 3)
    expect(t[40]).toBe(100)
  })

  it('van por PUESTO, no por valor: un extremo no puede quedarse la escala', () => {
    const t = ticksRango(4)
    expect(t).toEqual([25, 50, 75, 100])
  })

  it('sin comparables no hay rayas', () => {
    expect(ticksRango(0)).toEqual([])
    expect(ticksRango(undefined)).toEqual([])
  })
})
