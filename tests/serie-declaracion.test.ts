import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Indicador } from '../src/scraper/indicadores'

/**
 * La serie publica sus DOS mitades, no sólo el cociente.
 *
 * «La misma cifra desde 2019» era una frase, y una frase se lee y se olvida.
 * La demostración es ver cinco casillas idénticas debajo de cinco que cambian
 * todos los años — y para eso hacen falta el numerador y el denominador de cada
 * entrega, que el motor tiene delante cuando divide y no publicaba.
 */
const snap = JSON.parse(readFileSync(join(__dirname, '..', 'public/data/indicadores.json'), 'utf8'))
const indicadores: Indicador[] = snap.indicadores

describe('serie[] — cada entrega dice de qué dos cifras sale', () => {
  it('mide algo: hay fichas con serie declarada', () => {
    const conSerie = indicadores.filter((i) =>
      (i.serie ?? []).some((p) => p.estado === 'declarado'),
    )
    expect(conSerie.length).toBeGreaterThan(10)
  })

  it('toda entrega declarada trae numerador y denominador finitos', () => {
    let comprobadas = 0
    for (const i of indicadores) {
      for (const p of i.serie ?? []) {
        if (p.estado !== 'declarado') continue
        comprobadas++
        expect(typeof p.numerador, `${i.id} ${p.anio}`).toBe('number')
        expect(typeof p.denominador, `${i.id} ${p.anio}`).toBe('number')
      }
    }
    // Techo de reserva: si el campo desapareciera para todos, el bucle no
    // iteraría y el test pasaría sin comprobar nada.
    expect(comprobadas).toBeGreaterThan(80)
  })

  it('el cociente publicado ES el de sus dos mitades, sin redondeos por medio', () => {
    for (const i of indicadores) {
      for (const p of i.serie ?? []) {
        if (p.estado !== 'declarado' || typeof p.valor !== 'number') continue
        expect(p.numerador! / p.denominador!, `${i.id} ${p.anio}`).toBeCloseTo(p.valor, 6)
      }
    }
  })

  it('en colegios el denominador se repite cinco entregas mientras el coste cambia en todas', () => {
    const i = indicadores.find((x) => x.id === 'b323-324-320p-coste-unitario')!
    const dec = (i.serie ?? []).filter((p) => p.estado === 'declarado')
    const ultimas = dec.slice(-5)
    expect(ultimas).toHaveLength(5)
    expect(new Set(ultimas.map((p) => p.denominador)).size).toBe(1)
    expect(new Set(ultimas.map((p) => p.numerador)).size).toBe(5)
    // Y coincide con lo que el propio bloque `declaracion` cuenta, que es la
    // cifra que la prosa usa: dos caminos al mismo hecho.
    expect(i.declaracion.denominador.repeticionesFinales).toBe(5)
  })
})
