/**
 * Contratación menor — el gasto que no pasa por licitación.
 *
 * El dato YA estaba: 190 de los 809 contratos vienen marcados `minorContract`
 * desde ribalicita, y `tenders.ts` lo lee desde siempre. Lo que no había era
 * quien lo enseñara: ni un fichero del front nombraba el campo, así que un
 * vecino no podía preguntar «¿cuánto se adjudica sin concurso?».
 *
 * La trampa está en el IVA, y es de las que publican una acusación falsa.
 * El techo del art. 118 de la Ley 9/2017 es SIN impuestos: 40.000 € en obras,
 * 15.000 € en servicios y suministros. Medido sobre los importes CON IVA salen
 * 15 contratos por encima del techo; sobre los importes sin IVA salen 4. Los
 * once de diferencia son 39.900 € netos que con el 21 % se leen como 48.279 €.
 *
 * Publicar los primeros habría sido firmar que el Ayuntamiento se salta la ley
 * once veces más de lo que se la salta.
 */
import { describe, it, expect } from 'vitest'
import { resumenMenores, TECHO_MENOR_SIN_IVA, pesoDelMayor } from '../src/scraper/contratos-menores'

const c = (over: Record<string, unknown>) => ({
  minorContract: true,
  status: 'awarded',
  contractType: 'construction',
  initialAmount: null,
  initialAmountNoTaxes: null,
  finalAmount: null,
  finalAmountNoTaxes: null,
  awardDate: '2024-01-01',
  title: 'x',
  ...over,
})

describe('TECHO_MENOR_SIN_IVA', () => {
  it('exporta los techos del art. 118, no los repite cada prueba', () => {
    expect(TECHO_MENOR_SIN_IVA.construction).toBe(40_000)
    expect(TECHO_MENOR_SIN_IVA.services).toBe(15_000)
    expect(TECHO_MENOR_SIN_IVA.supplies).toBe(15_000)
  })
})

describe('resumenMenores · el denominador son los contratos ADJUDICADOS', () => {
  // Lo cazó la revisión lectora antes de que esto llegara a producción, y tenía
  // razón: la tarjeta decía «190 de 809» y 809 son las FILAS del snapshot —49
  // anuladas, 7 revocadas, 9 desistidas y 43 sin clasificar—. Comparar un
  // numerador que incluye menores anulados contra un denominador que incluye
  // todo lo anulado, y llamar a eso «contratos publicados», diluye el peso real
  // de la vía directa: son 184 de 701 (26,2 %), no 190 de 809 (23 %).
  //
  // El predicado NO se reescribe aquí: `isCommittedContract` existe desde que
  // escribir `status === 'awarded'` se dejó fuera 314 contratos firmados y
  // 53,5 M€. Dos definiciones de «adjudicado» es exactamente lo que ese fichero
  // existe para impedir.
  it('no cuenta como menor adjudicado uno anulado', () => {
    const r = resumenMenores([
      c({ status: 'awarded', finalAmountNoTaxes: 1000 }),
      c({ status: 'void', finalAmountNoTaxes: 5000 }),
    ])
    expect(r.n).toBe(1)
    expect(r.anulados).toBe(1)
    expect(r.importeSinIva).toBe(1000)
  })

  it('cuenta `formalized` como adjudicado: firmado es el estado más fuerte', () => {
    const r = resumenMenores([c({ status: 'formalized', finalAmountNoTaxes: 2000 })])
    expect(r.n).toBe(1)
    expect(r.importeSinIva).toBe(2000)
  })

  it('un anulado que se pasa del techo NO se señala', () => {
    // Reprocharle a alguien un contrato que se anuló es reprocharle algo que no
    // llegó a pasar.
    const r = resumenMenores([
      c({ status: 'void', contractType: 'supplies', finalAmountNoTaxes: 400_000 }),
    ])
    expect(r.sobreTecho).toEqual([])
  })
})

describe('resumenMenores', () => {
  it('cuenta sólo los marcados como menores', () => {
    const r = resumenMenores([
      c({ finalAmountNoTaxes: 1000 }),
      c({ minorContract: false, finalAmountNoTaxes: 999_999 }),
    ])
    expect(r.n).toBe(1)
    expect(r.importeSinIva).toBe(1000)
  })

  it('mide el techo SIN IVA: 39.900 € netos no se pasan aunque con IVA sean 48.279 €', () => {
    // El control negativo que separa una medición de una acusación falsa.
    const r = resumenMenores([
      c({ contractType: 'construction', finalAmountNoTaxes: 39_900, finalAmount: 48_279 }),
    ])
    expect(r.sobreTecho).toEqual([])
  })

  it('sí señala el que se pasa de verdad', () => {
    const r = resumenMenores([
      c({ contractType: 'supplies', finalAmountNoTaxes: 417_600, title: '320 contenedores' }),
    ])
    expect(r.sobreTecho).toHaveLength(1)
    expect(r.sobreTecho[0].techo).toBe(15_000)
    expect(r.sobreTecho[0].importeSinIva).toBe(417_600)
  })

  it('un contrato sin importe neto NO se juzga: va aparte', () => {
    // Un importe que falta no es un importe bajo. Colarlo como «dentro del
    // techo» sería dar por cumplida una comprobación que no se ha hecho.
    const r = resumenMenores([c({ finalAmountNoTaxes: null, initialAmountNoTaxes: null })])
    expect(r.sobreTecho).toEqual([])
    expect(r.sinImporte).toBe(1)
    expect(r.n).toBe(1)
  })

  it('un tipo de contrato sin techo declarado tampoco se juzga', () => {
    const r = resumenMenores([c({ contractType: 'patrimonial', finalAmountNoTaxes: 900_000 })])
    expect(r.sobreTecho).toEqual([])
    expect(r.sinTecho).toBe(1)
  })

  it('reparte por año para que se vea la tendencia, no un total suelto', () => {
    const r = resumenMenores([
      c({ finalAmountNoTaxes: 100, awardDate: '2024-03-01' }),
      c({ finalAmountNoTaxes: 200, awardDate: '2025-06-01' }),
      c({ finalAmountNoTaxes: 300, awardDate: '2025-09-01' }),
    ])
    expect(r.porAnio).toEqual([
      { anio: 2024, n: 1, importeSinIva: 100 },
      { anio: 2025, n: 2, importeSinIva: 500 },
    ])
  })
})

describe('pesoDelMayor · un denominador que lo domina una sola pieza', () => {
  // Segundo señalamiento de la revisión lectora, y también cierto. Decir que
  // los menores son «el 2,5 % del importe, que es la forma que se espera»
  // descansaba en un total que domina UNA concesión de agua de 55,7 M€
  // adjudicada de una vez por todo su plazo: el 45 % de lo contratado desde
  // 2017. Sin ella los menores son el 4,6 %, casi el doble.
  //
  // La cifra no se escribe en la prosa: se deriva, porque una concesión nueva
  // la mueve y una frase con el número dentro se queda falsa sin que nadie lo
  // note.
  it('mide qué parte del total es el contrato más grande', () => {
    const r = pesoDelMayor([100, 55, 45], 10)
    expect(r?.cuotaDelMayor).toBe(50)
    expect(r?.cuotaSinElMayor).toBe(10)
  })

  it('devuelve null sin importes, en vez de dividir por cero', () => {
    expect(pesoDelMayor([], 10)).toBeNull()
    expect(pesoDelMayor([0, 0], 10)).toBeNull()
  })
})
