import { describe, it, expect } from 'vitest'
import {
  ticksLog,
  curvaBanda,
  etiquetaEuros,
  etiquetaHabitantes,
} from '../src/components/coste-esperado/embudo-geometria'
import { ajustarOls } from '../src/scraper/coste-esperado'

describe('la geometría del embudo', () => {
  it('los ejes log marcan las potencias de diez del rango, y sólo ésas', () => {
    expect(ticksLog(800, 2_000_000)).toEqual([1_000, 10_000, 100_000, 1_000_000])
    expect(ticksLog(1_000, 1_000_000)).toEqual([1_000, 10_000, 100_000, 1_000_000])
    expect(ticksLog(0, 10)).toEqual([])
  })

  it('la banda se muestrea de la MISMA función que publica el snapshot', () => {
    // No hay una segunda fórmula que pueda divergir: curvaBanda llama a
    // intervaloPrediccion. Aquí sólo se comprueba la geometría del muestreo.
    const puntos = []
    for (let i = 0; i < 50; i++) {
      const poblacion = 1000 * Math.exp(i / 10)
      puntos.push({ poblacion, coste: 20 * poblacion ** 0.9 * (i % 2 ? 1.2 : 0.85) })
    }
    const m = ajustarOls(puntos)
    const banda = curvaBanda(m, 1000, 100_000, 20)
    expect(banda).toHaveLength(21)
    for (let i = 1; i < banda.length; i++) {
      expect(banda[i].poblacion).toBeGreaterThan(banda[i - 1].poblacion)
    }
    for (const b of banda) {
      expect(b.inferior).toBeLessThan(b.esperado)
      expect(b.superior).toBeGreaterThan(b.esperado)
    }
  })

  it('las etiquetas cortas de los ejes', () => {
    expect(etiquetaEuros(1_000_000)).toBe('1 M€')
    expect(etiquetaEuros(10_000)).toBe('10 k€')
    expect(etiquetaHabitantes(10_000)).toBe('10 mil hab')
  })
})
