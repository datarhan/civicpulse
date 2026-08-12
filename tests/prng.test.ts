import { describe, it, expect } from 'vitest'
import { crearPrng, semillaDesde } from '../src/scraper/prng'

describe('scraper/prng', () => {
  it('repite la misma secuencia con la misma semilla', () => {
    const a = crearPrng('frontera:cesta-3')
    const b = crearPrng('frontera:cesta-3')
    const sa = Array.from({ length: 50 }, () => a.siguiente())
    const sb = Array.from({ length: 50 }, () => b.siguiente())
    expect(sa).toEqual(sb)
  })

  it('da secuencias distintas con semillas distintas', () => {
    const a = Array.from({ length: 20 }, (_, i) => i).map(() => crearPrng('a').siguiente())
    const b = crearPrng('b')
    expect(a[0]).not.toBeCloseTo(b.siguiente(), 6)
  })

  it('no se queda clavado cuando la semilla es cero', () => {
    const p = crearPrng(0)
    const s = new Set(Array.from({ length: 20 }, () => p.siguiente()))
    expect(s.size).toBe(20)
  })

  it('produce uniformes dentro de [0, 1) y con media cercana a 0,5', () => {
    const p = crearPrng(12345)
    let suma = 0
    const N = 20000
    for (let i = 0; i < N; i++) {
      const v = p.siguiente()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
      suma += v
    }
    expect(suma / N).toBeCloseTo(0.5, 2)
  })

  it('produce normales con media 0 y desviación 1', () => {
    const p = crearPrng('normales')
    const N = 20000
    const xs = Array.from({ length: N }, () => p.normal())
    const media = xs.reduce((a, b) => a + b, 0) / N
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - media) ** 2, 0) / (N - 1))
    expect(media).toBeCloseTo(0, 1)
    expect(sd).toBeCloseTo(1, 1)
    // Cola: ~0,27 % debería caer más allá de 3σ. Si Box-Muller estuviera mal
    // implementado (por ejemplo sin la raíz), esto se dispara o se anula.
    const cola = xs.filter((x) => Math.abs(x) > 3).length / N
    expect(cola).toBeGreaterThan(0.0005)
    expect(cola).toBeLessThan(0.01)
  })

  it('reparte los enteros por todo el rango', () => {
    const p = crearPrng('enteros')
    const cuenta = new Array(10).fill(0)
    for (let i = 0; i < 10000; i++) cuenta[p.entero(10)]++
    for (const c of cuenta) expect(c).toBeGreaterThan(700)
  })

  it('deriva la semilla del texto de forma estable', () => {
    expect(semillaDesde('cesta-3')).toBe(semillaDesde('cesta-3'))
    expect(semillaDesde('cesta-3')).not.toBe(semillaDesde('cesta-4'))
  })
})
