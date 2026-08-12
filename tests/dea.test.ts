/**
 * DEA sobre un ejemplo de tres unidades cuyos óptimos se resuelven a mano en
 * los comentarios. No hay ninguna forma de comprobar una puntuación de
 * eficiencia mirándola: 0,375 y 0,333 son igual de creíbles, y el segundo es la
 * respuesta a otra pregunta (rendimientos constantes en vez de variables). El
 * único ancla posible es aritmética escrita antes que el código.
 */
import { describe, it, expect } from 'vitest'
import {
  resolverDea,
  gradosLibertad,
  eficienciaEscala,
  RENDIMIENTOS,
  REGLA_GRADOS_LIBERTAD,
  type Dmu,
} from '../src/scraper/dea'

// A(1 → 1) · B(2 → 3) · C(4 → 2). Ratios salida/entrada: 1 · 1,5 · 0,5.
const TRES: Dmu[] = [
  { id: 'A', entradas: [1], salidas: [1] },
  { id: 'B', entradas: [2], salidas: [3] },
  { id: 'C', entradas: [4], salidas: [2] },
]
const por = <T extends { id: string }>(r: { puntuaciones: T[] }, id: string): T =>
  r.puntuaciones.find((p) => p.id === id)!

describe('scraper/dea — envolvente orientada a entrada', () => {
  it('reproduce a mano las puntuaciones CRS', () => {
    // Con una entrada y una salida, CRS es el cociente de ratios contra el
    // mejor: θ_A = 1/1,5 = 2/3 · θ_B = 1 · θ_C = 0,5/1,5 = 1/3.
    const r = resolverDea(TRES, 'crs')
    expect(por(r, 'A').theta!).toBeCloseTo(2 / 3, 8)
    expect(por(r, 'B').theta!).toBeCloseTo(1, 8)
    expect(por(r, 'C').theta!).toBeCloseTo(1 / 3, 8)
    expect(r.eficientes).toBe(1)
  })

  it('reproduce a mano las puntuaciones VRS, que no coinciden con las CRS', () => {
    // Con Σλ = 1 la frontera es la envolvente convexa. A es la de menor
    // entrada y B la de mayor salida: ambas eficientes. Para C hace falta
    // salida ≥ 2 con la mínima entrada: λ_B = 0,5 da entrada 1,5 → θ = 0,375.
    const r = resolverDea(TRES, 'vrs')
    expect(por(r, 'A').theta!).toBeCloseTo(1, 8)
    expect(por(r, 'B').theta!).toBeCloseTo(1, 8)
    expect(por(r, 'C').theta!).toBeCloseTo(0.375, 8)
    expect(r.eficientes).toBe(2)
  })

  it('calcula la eficiencia de escala como el cociente de las dos', () => {
    const crs = resolverDea(TRES, 'crs')
    const vrs = resolverDea(TRES, 'vrs')
    const e = eficienciaEscala(por(crs, 'C').theta!, por(vrs, 'C').theta!)
    expect(e).toBeCloseTo(1 / 3 / 0.375, 8)
    expect(eficienciaEscala(por(crs, 'B').theta!, por(vrs, 'B').theta!)).toBeCloseTo(1, 8)
  })

  it('nunca da VRS por debajo de CRS: la frontera convexa envuelve más flojo', () => {
    const crs = resolverDea(TRES, 'crs')
    const vrs = resolverDea(TRES, 'vrs')
    for (const p of crs.puntuaciones) {
      expect(por(vrs, p.id).theta!).toBeGreaterThanOrEqual(p.theta! - 1e-9)
    }
  })

  it('nombra las unidades observadas que dominan a la ineficiente', () => {
    const r = resolverDea(TRES, 'crs')
    const c = por(r, 'C')
    // C se compara contra B con λ = 2/3: 2/3 · 2 = 1,33 de entrada, 2 de salida.
    expect(c.referencias.map((x) => x.id)).toEqual(['B'])
    expect(c.referencias[0].lambda).toBeCloseTo(2 / 3, 8)
  })

  it('cuenta cuántas veces se apoya el resto en cada unidad de la frontera', () => {
    const r = resolverDea(TRES, 'crs')
    // A y C se comparan con B; nadie se compara con A ni con C.
    expect(por(r, 'B').vecesReferenciada).toBe(2)
    expect(por(r, 'A').vecesReferenciada).toBe(0)
    expect(por(r, 'B').autorreferente).toBe(false)
  })

  it('marca como autorreferente la unidad eficiente en la que no se apoya nadie', () => {
    // Este es EL artefacto que hace que DEA con pocas unidades parezca un
    // hallazgo sin serlo. Se añade A2(1,05 → 1,2), que bajo VRS también es
    // eficiente: para batirla haría falta entrada ≤ 1,05 con salida ≥ 1,2, y la
    // mezcla A+B más barata que da 1,2 cuesta 1,1.
    //
    // A sigue siendo eficiente por ser la de menor entrada —nada puede estar a
    // su izquierda—, pero deja de servirle a nadie: para C, que necesita salida
    // ≥ 2, la mezcla A2+B con λ_B = 0,8/1,8 = 4/9 cuesta
    // 1,05·(5/9) + 2·(4/9) = 1,4722, contra 1,5 de la mezcla A+B.
    // θ_C = 1,4722/4 = 0,36806. A queda en la frontera sin que nadie se apoye
    // en ella: eficiente por ser rara, no por ser buena.
    const conA2: Dmu[] = [...TRES, { id: 'A2', entradas: [1.05], salidas: [1.2] }]
    const r = resolverDea(conA2, 'vrs')
    expect(por(r, 'C').theta!).toBeCloseTo(13.25 / 9 / 4, 8)
    expect(
      por(r, 'C')
        .referencias.map((x) => x.id)
        .sort(),
    ).toEqual(['A2', 'B'])

    const a = por(r, 'A')
    expect(a.theta!).toBeCloseTo(1, 8)
    expect(a.vecesReferenciada).toBe(0)
    expect(a.autorreferente).toBe(true)
    // B es igual de eficiente y NO es un artefacto: C se apoya en ella.
    expect(por(r, 'B').theta!).toBeCloseTo(1, 8)
    expect(por(r, 'B').vecesReferenciada).toBe(1)
    expect(por(r, 'B').autorreferente).toBe(false)
  })

  it('no cambia las puntuaciones ajenas al añadir una unidad dominada', () => {
    const base = resolverDea(TRES, 'crs')
    const conD = resolverDea([...TRES, { id: 'D', entradas: [8], salidas: [1] }], 'crs')
    for (const p of base.puntuaciones) {
      expect(por(conD, p.id).theta!).toBeCloseTo(p.theta!, 8)
    }
    expect(por(conD, 'D').theta!).toBeLessThan(0.2)
  })

  it('mantiene toda puntuación dentro de (0, 1]', () => {
    for (const rend of RENDIMIENTOS) {
      const r = resolverDea(TRES, rend)
      let evaluadas = 0
      for (const p of r.puntuaciones) {
        expect(p.estado).toBe('optimo')
        expect(p.theta!).toBeGreaterThan(0)
        expect(p.theta!).toBeLessThanOrEqual(1 + 1e-9)
        evaluadas++
      }
      // Que el bucle haya recorrido algo, y no tres veces nada.
      expect(evaluadas).toBe(TRES.length)
    }
  })

  it('resuelve un caso multi-salida donde el cociente simple no sirve', () => {
    // Una entrada, dos salidas. E es floja en ambas y no está en la frontera;
    // las otras tres son extremas en algo. Hecho a mano: para E hace falta
    // salida ≥ (4, 4) con entrada mínima. Media de P(10 → 8,2) y Q(10 → 2,8):
    // λ = 0,5 cada una da (5, 5) con entrada 10, y con λ = 0,4 cada una da
    // (4, 4) con entrada 8 → θ_E = 8/10 = 0,8.
    const dmus: Dmu[] = [
      { id: 'P', entradas: [10], salidas: [8, 2] },
      { id: 'Q', entradas: [10], salidas: [2, 8] },
      { id: 'R', entradas: [10], salidas: [5, 5] },
      { id: 'E', entradas: [10], salidas: [4, 4] },
    ]
    const r = resolverDea(dmus, 'crs')
    expect(por(r, 'P').theta!).toBeCloseTo(1, 8)
    expect(por(r, 'Q').theta!).toBeCloseTo(1, 8)
    expect(por(r, 'E').theta!).toBeCloseTo(0.8, 8)
    // R está justo en el segmento PQ: eficiente, pero por empate.
    expect(por(r, 'R').theta!).toBeCloseTo(1, 8)
  })

  it('aplica la regla de grados de libertad de Cooper, Seiford y Tone', () => {
    // n ≥ max(m·s, 3(m+s)).
    expect(gradosLibertad(24, 1, 3)).toMatchObject({ minimo: 12, cumple: true })
    expect(gradosLibertad(15, 1, 4)).toMatchObject({ minimo: 15, cumple: true })
    expect(gradosLibertad(11, 1, 5)).toMatchObject({ minimo: 18, cumple: false })
    expect(gradosLibertad(20, 3, 8)).toMatchObject({ minimo: 33, cumple: false })
    expect(REGLA_GRADOS_LIBERTAD).toMatch(/Cooper/)
  })

  it('lleva la regla dentro del resultado, no sólo en quien lo llama', () => {
    const r = resolverDea(TRES, 'crs')
    expect(r.gradosLibertad).toMatchObject({ n: 3, entradas: 1, salidas: 1, cumple: false })
  })

  it('se niega a puntuar datos no positivos en vez de inventar una frontera', () => {
    // Un cero de CE3 significa «no lo declaré»: si llegara hasta aquí, la
    // unidad saldría infinitamente eficiente. La trampa 2 de la fuente, otra vez.
    expect(() => resolverDea([...TRES, { id: 'Z', entradas: [0], salidas: [1] }], 'crs')).toThrow(
      /positiv/i,
    )
    expect(() => resolverDea([...TRES, { id: 'Z', entradas: [1], salidas: [0] }], 'crs')).toThrow(
      /positiv/i,
    )
  })

  it('se niega a puntuar un conjunto con vectores de distinta longitud', () => {
    expect(() =>
      resolverDea([...TRES, { id: 'Z', entradas: [1, 1], salidas: [1] }], 'crs'),
    ).toThrow(/dimensi/i)
  })

  it('es invariante al orden en que llegan las unidades', () => {
    const directo = resolverDea(TRES, 'vrs')
    const alReves = resolverDea([...TRES].reverse(), 'vrs')
    for (const p of directo.puntuaciones) {
      expect(por(alReves, p.id).theta!).toBeCloseTo(p.theta!, 8)
    }
  })

  it('es invariante al cambio de unidades de medida', () => {
    // Multiplicar euros por mil y toneladas por cien no puede mover θ: es la
    // propiedad que permite mezclar m², toneladas y puntos de luz en el mismo
    // modelo sin normalizar nada.
    const escalado = TRES.map((d) => ({
      ...d,
      entradas: d.entradas.map((v) => v * 1000),
      salidas: d.salidas.map((v) => v * 100),
    }))
    const a = resolverDea(TRES, 'crs')
    const b = resolverDea(escalado, 'crs')
    for (const p of a.puntuaciones) expect(por(b, p.id).theta!).toBeCloseTo(p.theta!, 7)
  })
})
