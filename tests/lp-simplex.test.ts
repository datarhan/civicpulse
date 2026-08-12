/**
 * El símplex es la única pieza de este repo cuyo error no se nota mirando.
 *
 * Un adaptador mal escrito publica un número que no cuadra con su fuente y
 * `check:citations` lo caza. Un símplex con un pivote mal elegido devuelve
 * 0,87 en vez de 0,91: perfectamente formateado, perfectamente plausible, y
 * nada en el repo puede contradecirlo porque la cifra no vive en ningún
 * documento. Por eso las pruebas de aquí son problemas con óptimo conocido de
 * antemano —de libro de texto o resueltos a mano— y no invariantes del propio
 * código.
 */
import { describe, it, expect } from 'vitest'
import { resolverLp, ESTADOS_LP, type LpProblema } from '../src/scraper/lp-simplex'
import { crearPrng } from '../src/scraper/prng'

/** Elimina Gauss con pivoteo parcial. `null` si la matriz es singular. */
function gauss(A: number[][], b: number[]): number[] | null {
  const n = b.length
  const M = A.map((fila, i) => [...fila, b[i]])
  for (let c = 0; c < n; c++) {
    let mejor = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[mejor][c])) mejor = r
    if (Math.abs(M[mejor][c]) < 1e-10) return null
    ;[M[c], M[mejor]] = [M[mejor], M[c]]
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = M[r][c] / M[c][c]
      for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j]
    }
  }
  return M.map((fila, i) => fila[n] / fila[i])
}

describe('scraper/lp-simplex', () => {
  it('resuelve el problema de producción de Hillier & Lieberman', () => {
    // max 3x + 5y  s.a.  x ≤ 4 · 2y ≤ 12 · 3x + 2y ≤ 18
    // Óptimo conocido: 36 en (2, 6). Se minimiza el negativo.
    const sol = resolverLp({
      objetivo: [-3, -5],
      restricciones: [
        { coef: [1, 0], rel: '<=', rhs: 4 },
        { coef: [0, 2], rel: '<=', rhs: 12 },
        { coef: [3, 2], rel: '<=', rhs: 18 },
      ],
    })
    expect(sol.estado).toBe('optimo')
    expect(sol.objetivo!).toBeCloseTo(-36, 8)
    expect(sol.variables![0]).toBeCloseTo(2, 8)
    expect(sol.variables![1]).toBeCloseTo(6, 8)
  })

  it('resuelve un problema con igualdad y ≥, que necesitan fase 1', () => {
    // min x + y  s.a.  x + y = 5 · x ≥ 3   →  5 con x ≥ 3
    const sol = resolverLp({
      objetivo: [1, 1],
      restricciones: [
        { coef: [1, 1], rel: '=', rhs: 5 },
        { coef: [1, 0], rel: '>=', rhs: 3 },
      ],
    })
    expect(sol.estado).toBe('optimo')
    expect(sol.objetivo!).toBeCloseTo(5, 8)
    expect(sol.variables![0]).toBeGreaterThanOrEqual(3 - 1e-8)
  })

  it('resuelve un problema de dieta con óptimo fraccionario', () => {
    // min 2x + 3y  s.a.  x + y ≥ 10 · x + 3y ≥ 18 · x,y ≥ 0
    // Vértices: (18,0)→36 · (6,4)→24 · (0,10)→30.  Óptimo 24 en (6,4).
    const sol = resolverLp({
      objetivo: [2, 3],
      restricciones: [
        { coef: [1, 1], rel: '>=', rhs: 10 },
        { coef: [1, 3], rel: '>=', rhs: 18 },
      ],
    })
    expect(sol.estado).toBe('optimo')
    expect(sol.objetivo!).toBeCloseTo(24, 8)
    expect(sol.variables![0]).toBeCloseTo(6, 8)
    expect(sol.variables![1]).toBeCloseTo(4, 8)
  })

  it('declara infactible un sistema sin solución en vez de devolver un número', () => {
    const sol = resolverLp({
      objetivo: [1],
      restricciones: [
        { coef: [1], rel: '>=', rhs: 2 },
        { coef: [1], rel: '<=', rhs: 1 },
      ],
    })
    expect(sol.estado).toBe('infactible')
    expect(sol.objetivo).toBeNull()
    expect(sol.variables).toBeNull()
  })

  it('declara no acotado un objetivo que puede bajar sin límite', () => {
    const sol = resolverLp({
      objetivo: [-1],
      restricciones: [{ coef: [1], rel: '>=', rhs: 1 }],
    })
    expect(sol.estado).toBe('no-acotado')
    expect(sol.objetivo).toBeNull()
  })

  it('normaliza un término independiente negativo en lugar de romperse', () => {
    // −x − y ≥ −10 es x + y ≤ 10. max x  →  10.
    const sol = resolverLp({
      objetivo: [-1, 0],
      restricciones: [{ coef: [-1, -1], rel: '>=', rhs: -10 }],
    })
    expect(sol.estado).toBe('optimo')
    expect(sol.objetivo!).toBeCloseTo(-10, 8)
  })

  it('termina en un problema degenerado en vez de ciclar', () => {
    // El ejemplo de ciclado de Beale: con la regla de Dantzig sola, el símplex
    // vuelve a la base de partida indefinidamente.
    const sol = resolverLp({
      objetivo: [-0.75, 150, -0.02, 6],
      restricciones: [
        { coef: [0.25, -60, -0.04, 9], rel: '<=', rhs: 0 },
        { coef: [0.5, -90, -0.02, 3], rel: '<=', rhs: 0 },
        { coef: [0, 0, 1, 0], rel: '<=', rhs: 1 },
      ],
    })
    expect(sol.estado).toBe('optimo')
    expect(sol.objetivo!).toBeCloseTo(-0.05, 8)
  })

  it('resuelve a mano la envolvente CCR de una unidad ineficiente', () => {
    // Tres unidades, un input y un output:
    //   A (1 → 1) · B (2 → 3) · C (4 → 2)
    // La frontera CRS la marca B, con ratio 1,5. Para C:
    //   min θ  s.a.  Σλx ≤ 4θ · Σλy ≥ 2 · λ ≥ 0
    // El óptimo es λ_B = 2/3 (input 4/3), θ = 1/3.
    const sol = resolverLp({
      objetivo: [1, 0, 0, 0], // θ, λA, λB, λC
      restricciones: [
        { coef: [-4, 1, 2, 4], rel: '<=', rhs: 0 },
        { coef: [0, 1, 3, 2], rel: '>=', rhs: 2 },
      ],
    })
    expect(sol.estado).toBe('optimo')
    expect(sol.objetivo!).toBeCloseTo(1 / 3, 8)
    expect(sol.variables![2]).toBeCloseTo(2 / 3, 8)
  })

  it('expone su enum de estados en vez de obligar a copiarlo', () => {
    expect(ESTADOS_LP).toContain('optimo')
    expect(ESTADOS_LP).toContain('infactible')
    expect(ESTADOS_LP).toContain('no-acotado')
    // Un problema resuelto tiene que caer dentro del enum exportado, no en un
    // string suelto: el modo de fallo 1 de DATA_INTEGRITY empezó justo así.
    const p: LpProblema = { objetivo: [1], restricciones: [{ coef: [1], rel: '>=', rhs: 1 }] }
    expect(ESTADOS_LP).toContain(resolverLp(p).estado)
  })

  // Las pruebas de arriba comprueban ocho problemas escogidos. Un símplex se
  // rompe en los casos que a nadie se le ocurre escribir a mano: empates en la
  // razón mínima, vértices degenerados, restricciones redundantes. Esta compara
  // contra fuerza bruta —enumerar todos los vértices— en doscientos problemas
  // generados con semilla fija, que es la única forma barata de cubrirlos.
  it('coincide con la enumeración de vértices en 200 problemas pequeños', () => {
    const p = crearPrng('lp-fuzz')
    let comprobados = 0
    for (let caso = 0; caso < 200; caso++) {
      const n = 2 + p.entero(2) // 2 o 3 variables
      const m = 2 + p.entero(3) // 2 a 4 restricciones
      const objetivo = Array.from(
        { length: n },
        () => Math.round((p.siguiente() * 20 - 10) * 10) / 10,
      )
      const restricciones = Array.from({ length: m }, () => ({
        // Coeficientes positivos y término independiente positivo: la región es
        // un politopo acotado, así que siempre hay óptimo finito y la fuerza
        // bruta puede enumerarlo.
        coef: Array.from({ length: n }, () => Math.round(p.siguiente() * 90 + 10) / 10),
        rel: '<=' as const,
        rhs: Math.round(p.siguiente() * 900 + 100) / 10,
      }))

      const sol = resolverLp({ objetivo, restricciones })
      expect(sol.estado).toBe('optimo')

      // Fuerza bruta: cada vértice es la intersección de n planos activos,
      // tomados de las m restricciones y de los n planos x_i = 0.
      const planos = [
        ...restricciones.map((r) => ({ coef: r.coef, rhs: r.rhs })),
        ...Array.from({ length: n }, (_, i) => ({
          coef: Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
          rhs: 0,
        })),
      ]
      let mejor = Infinity
      const combinar = (inicio: number, elegidos: number[]) => {
        if (elegidos.length === n) {
          const A = elegidos.map((k) => planos[k].coef.slice())
          const b = elegidos.map((k) => planos[k].rhs)
          const x = gauss(A, b)
          if (!x) return
          if (x.some((v) => v < -1e-7)) return
          for (const r of restricciones) {
            const lhs = r.coef.reduce((a, c, j) => a + c * x[j], 0)
            if (lhs > r.rhs + 1e-7) return
          }
          mejor = Math.min(
            mejor,
            objetivo.reduce((a, c, j) => a + c * x[j], 0),
          )
          return
        }
        for (let k = inicio; k < planos.length; k++) combinar(k + 1, [...elegidos, k])
      }
      combinar(0, [])
      expect(Number.isFinite(mejor)).toBe(true)
      expect(sol.objetivo!).toBeCloseTo(mejor, 6)
      comprobados++
    }
    // Que la prueba haya evaluado algo, y no doscientas veces nada.
    expect(comprobados).toBe(200)
  })

  it('devuelve `sin-converger` en vez de un óptimo falso cuando se le acorta el presupuesto', () => {
    // Que un solver corte por iteraciones es aceptable; que lo llame «óptimo»
    // no. Este es el reproductor de esa distinción.
    const sol = resolverLp(
      {
        objetivo: [-3, -5],
        restricciones: [
          { coef: [1, 0], rel: '<=', rhs: 4 },
          { coef: [0, 2], rel: '<=', rhs: 12 },
          { coef: [3, 2], rel: '<=', rhs: 18 },
        ],
      },
      { maxIter: 1 },
    )
    expect(sol.estado).toBe('sin-converger')
    expect(sol.objetivo).toBeNull()
  })
})
