/**
 * La entradilla de /gestion no promete una comparación que ninguna ficha hace.
 *
 * Decía «qué distancia hay entre el presupuesto que se aprobó y el que se
 * ejecutó». El panel mide esa distancia en DOS saltos, cada uno con su ficha y su
 * divisor: cuánto crédito se añadió al aprobado (modificaciones / crédito
 * inicial) y qué parte del total ya ampliado se ejecutó (obligaciones / crédito
 * DEFINITIVO). Ninguna divide lo ejecutado entre lo aprobado.
 *
 * Quien lee la entradilla y luego «30,4 %» entiende que se ejecutó un 30 % de lo
 * aprobado. Contra el crédito inicial sería la mitad, y esa cifra la página no la
 * publica —a propósito: la salvedad de la ficha explica por qué las dos fuentes
 * del mismo ejercicio no cuadran—. Es la confusión de magnitudes que
 * `magnitudes-fiscales.ts` caza cuando hay una cifra al lado; aquí no la hay, así
 * que no la ve. La vio la revisión lectora el 20-09-2026, al releer la página
 * tras el arreglo de la lectura corta de esa misma ficha.
 *
 * Se lee el fuente y no el render: la página necesita media docena de snapshots
 * para montarse, y lo que aquí se fija es una frase.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = readFileSync(join(__dirname, '..', 'src/pages/Gestion.jsx'), 'utf8')
/** El primer párrafo tras el <h1>, con los espacios colapsados. */
const entradilla = (src.split('</h1>')[1] ?? '').split('</p>')[0].replace(/\s+/g, ' ')

describe('/gestion — la entradilla', () => {
  it('mide algo: la entradilla se encontró', () => {
    expect(entradilla).toMatch(/Cuánto tarda en pagar/)
  })

  it('no promete «lo aprobado frente a lo ejecutado»: ninguna ficha divide eso', () => {
    expect(entradilla).not.toMatch(/el presupuesto que se aprobó y el que se ejecutó/)
  })

  it('nombra los dos saltos que el panel SÍ mide', () => {
    // Crédito añadido al aprobado…
    expect(entradilla).toMatch(/crédito se le añadió/)
    // …y ejecución sobre el total ya ampliado, no sobre lo aprobado.
    expect(entradilla).toMatch(/del total/)
    expect(entradilla).toMatch(/ejecutarse/)
  })

  it('las dos fichas de las que habla existen en el panel publicado', () => {
    // Si una desaparece, la entradilla describe un panel que ya no es.
    const pub = JSON.parse(
      readFileSync(join(__dirname, '..', 'public/data/indicadores.json'), 'utf8'),
    )
    const ids = pub.municipales.map((m) => m.id)
    expect(ids).toContain('modificaciones-presupuestarias')
    expect(ids).toContain('ejecucion-presupuestaria')
  })
})
