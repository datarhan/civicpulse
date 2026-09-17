import { describe, expect, it } from 'vitest'
import { fraseVeredictos, pressLabSummary } from '../src/lib/press-lab'

/**
 * La entradilla de /laboratorio decía siempre «La mayoría vuelve sin nada que las
 * confirme ni las desmienta», justo encima de una tasa de verificación de «0 % · 0 de
 * 64». Ese día ninguna afirmación había llegado a un veredicto, así que «la mayoría»
 * se quedaba corto, y la revisión lectora lo señaló el 15-09-2026. Es la frase que se
 * queda rancia cuando se mueve el dato: ahora sale del mismo recuento que las tasas.
 */
const fila = (verdict) => ({ claim: { articleId: 'a1' }, verification: { verdict } })
const resumen = (veredictos) => pressLabSummary({ press: [], verified: veredictos.map(fila) })
const varias = (n, verdict) => Array.from({ length: n }, () => verdict)

describe('fraseVeredictos · la entradilla de /laboratorio sale del recuento', () => {
  it('ninguna resuelta: lo dice, y no dice «la mayoría»', () => {
    const frase = fraseVeredictos(resumen(varias(64, 'sin-datos')))
    expect(frase).toMatch(/ninguna/i)
    expect(frase).not.toMatch(/mayoría/i)
  })

  it('«parcial» no cuenta como veredicto, igual que en la tasa de discrepancia', () => {
    expect(fraseVeredictos(resumen(varias(2, 'parcial')))).toMatch(/ninguna/i)
  })

  it('menos de la mitad resueltas: la mayoría vuelve sin nada que las confirme', () => {
    const frase = fraseVeredictos(resumen([...varias(10, 'sin-datos'), 'verificado']))
    expect(frase).toMatch(/la mayoría vuelve sin nada/i)
  })

  it('justo la mitad: ni una mayoría ni la otra', () => {
    const frase = fraseVeredictos(resumen(['verificado', 'contradicho', 'sin-datos', 'parcial']))
    expect(frase).toMatch(/la mitad/i)
    expect(frase).not.toMatch(/mayoría/i)
  })

  it('más de la mitad resueltas: la mayoría llega a un veredicto', () => {
    const frase = fraseVeredictos(resumen([...varias(3, 'verificado'), 'contradicho', 'sin-datos']))
    expect(frase).toMatch(/la mayoría llega a un veredicto/i)
  })

  it('todas resueltas: todas', () => {
    expect(fraseVeredictos(resumen(['verificado', 'contradicho']))).toMatch(/todas/i)
  })

  it('sin nada analizado, no inventa un reparto', () => {
    const frase = fraseVeredictos(resumen([]))
    expect(frase).toMatch(/todavía no hay afirmaciones/i)
    expect(frase).not.toMatch(/mayoría|ninguna|todas/i)
  })
})
