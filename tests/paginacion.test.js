/**
 * El reparto en páginas, aparte de React.
 *
 * Dos listados de /presupuesto paginan —los contratos y las obras— y la parte
 * delicada no es cortar el array: es qué pasa cuando el conjunto ENCOGE debajo.
 * Un refresco nocturno puede dejar menos filas sin que nadie toque un filtro, y
 * «página 7 de 2» es una lista vacía con toda la pinta de un fallo de datos. Se
 * acota aquí, en una función pura, para que los dos listados no puedan
 * discrepar sobre el mismo caso.
 */
import { describe, expect, it } from 'vitest'
import { paginar } from '../src/lib/paginacion'

describe('paginar', () => {
  it('reparte el conjunto en páginas del tamaño pedido', () => {
    const p = paginar(809, 1, 10)
    expect(p.paginas).toBe(81)
    expect(p.pagina).toBe(1)
    expect(p.desde).toBe(0)
    expect(p.hasta).toBe(10)
  })

  it('la última página se queda con el resto, no con un hueco', () => {
    // 14 obras de diez en diez: la segunda trae cuatro.
    const p = paginar(14, 2, 10)
    expect(p.paginas).toBe(2)
    expect(p.desde).toBe(10)
    expect(p.hasta).toBe(14)
  })

  it('ACOTA una página que se ha quedado fuera del conjunto', () => {
    // El caso que motiva el módulo: se pidió la 7 y ya sólo hay 2.
    const p = paginar(14, 7, 10)
    expect(p.pagina).toBe(2)
    expect(p.desde).toBe(10)
    expect(p.hasta).toBe(14)
  })

  it('nunca baja de la primera página', () => {
    expect(paginar(50, 0, 10).pagina).toBe(1)
    expect(paginar(50, -3, 10).pagina).toBe(1)
  })

  it('un conjunto vacío tiene una página, vacía, y no cero', () => {
    // Con `paginas: 0` el rótulo diría «página 1 de 0» y los botones no
    // sabrían dónde están. Una lista vacía es una página vacía.
    const p = paginar(0, 1, 10)
    expect(p.paginas).toBe(1)
    expect(p.pagina).toBe(1)
    expect(p.desde).toBe(0)
    expect(p.hasta).toBe(0)
  })

  it('cabiendo todo en una página, no hay nada que paginar', () => {
    const p = paginar(7, 1, 10)
    expect(p.paginas).toBe(1)
    expect(p.hasta).toBe(7)
  })

  it('los cortes cubren el conjunto entero, sin solaparse ni saltarse nada', () => {
    // La propiedad que importa de verdad: las páginas son una partición.
    const total = 57
    const por = 10
    const { paginas } = paginar(total, 1, por)
    const vistos = []
    for (let i = 1; i <= paginas; i++) {
      const { desde, hasta } = paginar(total, i, por)
      for (let k = desde; k < hasta; k++) vistos.push(k)
    }
    expect(vistos).toEqual([...Array(total).keys()])
  })
})
