import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  seriesDibujables,
  dominioComun,
  aniosSinEntrega,
} from '../src/components/eficiencia/multiples'
import { puntosEnEscala } from '../src/components/eficiencia/SerieServicio'

const ROOT = join(__dirname, '..')
const pub = JSON.parse(readFileSync(join(ROOT, 'public/data/indicadores.json'), 'utf8'))

const ind = (id, serie, extra = {}) => ({
  id,
  etiqueta: id,
  valor: 1,
  numerador: { valor: 100 },
  serie,
  ...extra,
})
const p = (anio, valor, extra = {}) => ({ anio, valor, estado: 'declarado', ...extra })

describe('qué series entran en la rejilla', () => {
  it('exige al menos dos entregas dibujables, con el MISMO criterio que el gráfico grande', () => {
    // Una sola entrega legible no es una serie; y el criterio de «legible» no
    // se restata aquí: es el exportado que usa el propio SerieServicio.
    const una = ind('una', [p(2023, 5), p(2024, 9, { atipico: true })])
    const dos = ind('dos', [p(2023, 5), p(2024, 9)])
    const ids = seriesDibujables([una, dos]).map((s) => s.indicador.id)
    expect(ids).toEqual(['dos'])
    expect(puntosEnEscala(una.serie)).toHaveLength(1)
  })

  it('ignora los puntos que no son entregas declaradas', () => {
    // `no-declarado` y `no-se-presta` existen en el snapshot real; la tarjeta
    // los filtra antes de dibujar y la rejilla hace exactamente lo mismo.
    const i = ind('x', [
      p(2022, 4),
      { anio: 2023, valor: 5, estado: 'no-declarado' },
      { anio: 2024, valor: 6, estado: 'no-se-presta' },
    ])
    expect(seriesDibujables([i])).toHaveLength(0)
  })

  it('ordena como la franja de posiciones: percentil descendente, y sin banda al final', () => {
    const caro = ind('caro', [p(2023, 1), p(2024, 2)], { pares: { percentil: 85, n: 30 } })
    const barato = ind('barato', [p(2023, 1), p(2024, 2)], { pares: { percentil: 13, n: 30 } })
    const sinPares = ind('sin-pares', [p(2023, 1), p(2024, 2)], { pares: null })
    const ids = seriesDibujables([barato, sinPares, caro]).map((s) => s.indicador.id)
    expect(ids).toEqual(['caro', 'barato', 'sin-pares'])
  })
})

describe('la retícula común', () => {
  it('abarca todas las series, no la primera', () => {
    const cortas = [
      [p(2016, 1), p(2017, 1)],
      [p(2014, 1), p(2015, 1)],
      [p(2023, 1), p(2024, 1)],
    ]
    expect(dominioComun(cortas)).toEqual({ x0: 2014, x1: 2024 })
  })

  it('sin series no hay dominio', () => {
    expect(dominioComun([])).toBeNull()
  })

  it('nombra los años que faltan en todas partes, para decirlo una vez', () => {
    // Las trece series carecen de la misma entrega; el pie de la rejilla lo
    // dice una vez en lugar de rotularlo trece veces. La frase se deriva del
    // dato: si mañana un año falta sólo en una serie, se nombra igual.
    const listas = [
      [p(2019, 1), p(2021, 1)],
      [p(2018, 1), p(2019, 1), p(2021, 1)],
    ]
    expect(aniosSinEntrega(listas)).toEqual([2020])
    expect(aniosSinEntrega([[p(2023, 1), p(2024, 1)]])).toEqual([])
  })
})

describe('contra el snapshot publicado', () => {
  const dibujables = seriesDibujables(pub.indicadores)

  it('hay rejilla, y cada entrada ancla a una tarjeta real', () => {
    expect(dibujables.length).toBeGreaterThanOrEqual(10)
    const ids = new Set(pub.indicadores.map((i) => i.id))
    for (const s of dibujables) expect(ids.has(s.indicador.id)).toBe(true)
  })

  it('el orden publicado es el de la franja', () => {
    const conPares = dibujables.filter((s) => s.indicador.pares)
    const percentiles = conPares.map((s) => s.indicador.pares.percentil)
    expect([...percentiles].sort((a, b) => b - a)).toEqual(percentiles)
    // Los sin banda cierran la rejilla, nunca se intercalan.
    const marcas = dibujables.map((s) => (s.indicador.pares ? 'p' : '-')).join('')
    expect(marcas).not.toMatch(/-p/)
  })

  it('2020 falta en todas las series dibujadas', () => {
    expect(aniosSinEntrega(dibujables.map((s) => s.declarados))).toContain(2020)
  })
})
