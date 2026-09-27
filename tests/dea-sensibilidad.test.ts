import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  sensibilidadCestas,
  tituloCestas,
  cardinalEs,
  cardinalEn,
  fmtTheta,
  type EspecificacionLeida,
} from '../src/scraper/dea-sensibilidad'

/**
 * Cuánto mueve la cesta la puntuación de Riba-roja, medido del snapshot.
 *
 * EL FALLO, medido el 2026-09-25: /metodologia, /nosotros y /about decían que
 * cuatro cestas «igual de defendibles» movían la puntuación «media escala», y
 * /laboratorio/frontera titulaba «Cuatro cestas defendibles, cuatro
 * resultados». Ningún dea.json publicado lo sostuvo nunca: desde el primero,
 * del 12-08-2026, dos de las cuatro cestas no llegan a grados de libertad y
 * entre las otras dos θ va de 0,43 a 0,53. Las frases salen ahora de
 * `sensibilidadCestas`, y aquí se prueba que lo que dice es lo que el dato
 * permite decir.
 */

const SNAP = JSON.parse(readFileSync('public/data/dea.json', 'utf8')) as {
  especificaciones: EspecificacionLeida[]
}

const A = { programa: 'a1621' }
const B = { programa: 'a163' }
const C = { programa: 'a165' }
const D = { programa: 'a164' }

/** Una cesta con puntuación: θ, «por debajo» en % y n. */
function publicada(
  programas: { programa: string }[],
  theta: number,
  porDebajo: number,
  n = 24,
): EspecificacionLeida {
  return {
    anio: 2024,
    estado: 'publicada',
    programas,
    propia: { theta, percentil: porDebajo },
    distribucion: { n },
  } as unknown as EspecificacionLeida
}

function insuficiente(programas: { programa: string }[]): EspecificacionLeida {
  return {
    anio: 2024,
    estado: 'insuficiente',
    programas,
    propia: null,
    distribucion: null,
  } as unknown as EspecificacionLeida
}

describe('sensibilidadCestas · el snapshot publicado', () => {
  const s = sensibilidadCestas(SNAP.especificaciones)
  const conNota = SNAP.especificaciones.filter((e) => e.estado === 'publicada')

  // Regla 2 de DATA_INTEGRITY: que esto haya medido algo. Si el snapshot se
  // quedara sin especificaciones, todo lo de abajo aprobaría sin mirar nada.
  it('cuenta las cestas que hay y las que puntúan', () => {
    expect(s.probadas).toBe(SNAP.especificaciones.length)
    expect(s.probadas).toBeGreaterThan(0)
    expect(s.conPuntuacion).toBe(conNota.length)
  })

  it('el recorrido de θ es el de las cestas con puntuación, ni más ni menos', () => {
    if (conNota.length < 2) {
      expect(s.theta).toBeNull()
      return
    }
    const thetas = conNota.map((e) => e.propia!.theta)
    expect(s.theta).toMatchObject({ min: Math.min(...thetas), max: Math.max(...thetas) })
  })

  it('los puestos, si los da, caben en la clasificación que nombra', () => {
    if (s.puestos === null) return
    const ns = conNota.map((e) => e.distribucion!.n)
    expect(ns).toContain(s.puestos.de)
    expect(s.puestos.movimiento).toBeGreaterThanOrEqual(0)
    expect(s.puestos.movimiento).toBeLessThan(s.puestos.de)
    expect(s.puestos.pares).toBeGreaterThan(0)
  })
})

describe('sensibilidadCestas · lo que se puede decir con cada forma del dato', () => {
  it('dos cestas anidadas sobre la misma muestra: recorrido de θ y puestos', () => {
    // La forma del snapshot de hoy: la segunda es la primera sin alumbrado.
    const s = sensibilidadCestas([
      publicada([A, B, C], 0.5277, 16.666666666666664),
      publicada([A, B], 0.4265, 41.66666666666667),
      insuficiente([A, B, D, C]),
      insuficiente([A, B, D, C, { programa: 'a171/170P' }]),
    ])
    expect(s.probadas).toBe(4)
    expect(s.conPuntuacion).toBe(2)
    expect(s.theta).toEqual({ min: 0.4265, max: 0.5277, cambia: true })
    // 4 de 24 por debajo en una cesta, 10 de 24 en la otra: seis puestos.
    expect(s.puestos).toEqual({ movimiento: 6, de: 24, pares: 1 })
  })

  it('dos cestas que no se contienen NO se restan: pueden ser muestras distintas', () => {
    // Mismo n, pero {A,B} y {A,C} pueden dejar fuera a municipios distintos:
    // restar puestos de dos clasificaciones distintas no mide nada.
    const s = sensibilidadCestas([publicada([A, B], 0.5, 20), publicada([A, C], 0.4, 60)])
    expect(s.theta).toMatchObject({ min: 0.4, max: 0.5 })
    expect(s.puestos).toBeNull()
  })

  it('anidadas pero con n distinto tampoco: la cesta grande perdió municipios', () => {
    const s = sensibilidadCestas([
      publicada([A, B, C], 0.5, 20, 20),
      publicada([A, B], 0.4, 60, 24),
    ])
    expect(s.puestos).toBeNull()
  })

  it('de años distintos tampoco', () => {
    const vieja = { ...publicada([A, B], 0.4, 60), anio: 2023 } as EspecificacionLeida
    expect(sensibilidadCestas([publicada([A, B, C], 0.5, 20), vieja]).puestos).toBeNull()
  })

  it('con tres cestas en cadena da el mayor movimiento y cuántos pares lo sostienen', () => {
    const s = sensibilidadCestas([
      publicada([A, B, C, D], 0.6, 25),
      publicada([A, B, C], 0.5, 50),
      publicada([A, B], 0.4, 75),
    ])
    // 6, 12 y 18 por debajo: el mayor salto es de 12 puestos, entre los extremos.
    expect(s.puestos).toEqual({ movimiento: 12, de: 24, pares: 3 })
  })

  it('una sola cesta con puntuación no tiene recorrido que enseñar', () => {
    const s = sensibilidadCestas([publicada([A, B, C], 0.53, 16.7), insuficiente([A, B, C, D])])
    expect(s.conPuntuacion).toBe(1)
    expect(s.theta).toBeNull()
    expect(s.puestos).toBeNull()
  })

  it('dos cifras que se imprimen igual no «cambian»', () => {
    const s = sensibilidadCestas([publicada([A, B, C], 0.5301, 20), publicada([A, B], 0.5298, 20)])
    expect(s.theta?.cambia).toBe(false)
    expect(s.puestos?.movimiento).toBe(0)
  })

  it('una cesta «publicada» sin puntuación cuenta como publicada pero no aporta cifra', () => {
    // Estado y cifra se leen por separado, como la página: la pastilla dice
    // «con puntuación» por el estado; θ sólo sale de donde hay θ.
    const rota = { ...publicada([A, B], 0.4, 60), propia: null } as EspecificacionLeida
    const s = sensibilidadCestas([publicada([A, B, C], 0.5, 20), rota])
    expect(s.conPuntuacion).toBe(2)
    expect(s.theta).toBeNull()
    expect(s.puestos).toBeNull()
  })

  it('sin datos —cargando, error o fichero vacío— no afirma nada', () => {
    for (const vacio of [undefined, null, []]) {
      expect(sensibilidadCestas(vacio)).toEqual({
        probadas: 0,
        conPuntuacion: 0,
        theta: null,
        puestos: null,
      })
    }
  })
})

describe('tituloCestas · el titular de la sección de /laboratorio/frontera', () => {
  const s = (probadas: number, conPuntuacion: number) => ({
    probadas,
    conPuntuacion,
    theta: null,
    puestos: null,
  })

  it('dice cuántas puntúan, no «cuatro resultados»', () => {
    expect(tituloCestas(s(4, 2))).toBe('Cuatro cestas defendibles, dos con puntuación')
    expect(tituloCestas(s(4, 1))).toBe('Cuatro cestas defendibles, una con puntuación')
    expect(tituloCestas(s(4, 0))).toBe('Cuatro cestas defendibles, ninguna con puntuación')
    expect(tituloCestas(s(4, 4))).toBe('Cuatro cestas defendibles, todas con puntuación')
    expect(tituloCestas(s(1, 1))).toBe('Una cesta defendible, con puntuación')
    expect(tituloCestas(s(1, 0))).toBe('Una cesta defendible, sin puntuación')
  })

  it('el del snapshot publicado sale de sus propios recuentos', () => {
    const r = sensibilidadCestas(SNAP.especificaciones)
    expect(tituloCestas(r)).toMatch(
      new RegExp(`^\\S+ cestas? defendibles?, (${cardinalEs(r.conPuntuacion, 'f')}|todas) con`),
    )
  })
})

describe('las cifras en palabras y en coma', () => {
  it('castellano, con el género del sustantivo que acompañan', () => {
    expect(cardinalEs(0, 'f')).toBe('ninguna')
    expect(cardinalEs(1, 'f')).toBe('una')
    expect(cardinalEs(1, 'm')).toBe('un')
    expect(cardinalEs(6, 'm')).toBe('seis')
    expect(cardinalEs(10, 'f')).toBe('diez')
    expect(cardinalEs(24, 'm')).toBe('24')
  })

  it('inglés', () => {
    expect(cardinalEn(1)).toBe('one')
    expect(cardinalEn(6)).toBe('six')
    expect(cardinalEn(24)).toBe('24')
  })

  it('θ a dos decimales y con coma', () => {
    expect(fmtTheta(0.42648676586998324)).toBe('0,43')
    expect(fmtTheta(0.5277107886707897)).toBe('0,53')
  })
})
