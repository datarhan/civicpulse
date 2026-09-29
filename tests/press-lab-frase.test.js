import { describe, expect, it } from 'vitest'
import { fraseVeredictos, pressLabSummary, VERDICT_LABEL } from '../src/lib/press-lab'

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

  it('«parcial» no resuelve, igual que en la tasa de discrepancia', () => {
    expect(fraseVeredictos(resumen(varias(2, 'parcial')))).toMatch(/ninguna/i)
  })

  // El 28-09-2026 había 30 `sin-datos` y 1 `parcial`, y la frase decía «Por ahora ninguna
  // ha llegado a un veredicto que la confirme o la desmienta» justo encima de la tarjeta
  // del Ayuntamiento con la pastilla «1 Parcial». Al pie de la letra era cierta —una
  // parcial ni confirma ni desmiente—, pero se lee «no hay veredictos» y la página enseña
  // uno (revisión lectora del 28-09-2026).
  it('ninguna resuelta y alguna parcial: no niega el veredicto, y nombra las parciales', () => {
    const frase = fraseVeredictos(resumen([...varias(30, 'sin-datos'), 'parcial']))
    expect(frase).not.toMatch(/llegado a un veredicto/i)
    expect(frase).toMatch(/ninguna ha quedado confirmada ni desmentida/i)
    expect(frase).toContain('ha marcado 1 como')
    // Y por qué las tasas no la cuentan: si no, la pastilla y el «0 de 0 resueltas» del
    // pie no cuadran.
    expect(frase).toMatch(/no cuentan una coincidencia parcial como resuelta/i)
  })

  it('cuántas parciales sale del recuento, no de la prosa', () => {
    const frase = fraseVeredictos(resumen([...varias(4, 'sin-datos'), ...varias(3, 'parcial')]))
    expect(frase).toContain('ha marcado 3 como')
  })

  it('nombra la parcial con la etiqueta de la pastilla de la tarjeta', () => {
    expect(VERDICT_LABEL?.parcial).toBeTruthy()
    expect(fraseVeredictos(resumen(['sin-datos', 'parcial']))).toContain(
      `«${VERDICT_LABEL.parcial}»`,
    )
  })

  // Las ramas vecinas tenían el mismo defecto: «la otra mitad / la mayoría vuelve sin
  // nada» metía las parciales —que vuelven con datos relacionados— entre las que no
  // trajeron nada. Con 1 verificada, 5 parciales y 4 sin-datos, «la mayoría vuelve sin
  // nada» era falso: sin nada volvieron 4 de 10. El 14-08-2026 eran 2, 5 y 44.
  it.each([
    [['verificado', 'contradicho', 'sin-datos', 'parcial'], '2 han quedado confirmadas', 1],
    [
      ['verificado', ...varias(5, 'parcial'), ...varias(4, 'sin-datos')],
      '1 ha quedado confirmada',
      5,
    ],
  ])(
    'con resueltas y parciales no dice «sin nada», y cuenta las dos (%j)',
    (veredictos, resueltas, parciales) => {
      const frase = fraseVeredictos(resumen(veredictos))
      expect(frase).not.toMatch(/sin nada/i)
      expect(frase).toContain(resueltas)
      expect(frase).toContain(`ha marcado ${parciales} como`)
    },
  )

  it('menos de la mitad resueltas: la mayoría vuelve sin nada que las confirme', () => {
    const frase = fraseVeredictos(resumen([...varias(10, 'sin-datos'), 'verificado']))
    expect(frase).toMatch(/la mayoría vuelve sin nada/i)
  })

  it('justo la mitad: ni una mayoría ni la otra', () => {
    // Sin parciales: con una, la otra mitad no «vuelve sin nada» (ver arriba).
    const frase = fraseVeredictos(resumen(['verificado', 'contradicho', 'sin-datos', 'sin-datos']))
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
