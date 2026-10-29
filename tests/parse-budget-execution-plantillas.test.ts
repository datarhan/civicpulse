/**
 * Las hojas de ejecución que el parser no leía (RED).
 *
 * Tres periodos del índice se descartaban aunque sus PDF traen texto:
 *
 * - **2T 2023.** No es SICALWIN: son cuatro formularios F.1.1 de las
 *   «Ejecuciones trimestrales de las entidades locales» del Ministerio,
 *   ingresos y gastos partidos en operaciones corrientes y de capital. Cada
 *   lado son DOS hojas, y su «definitivo» es la «Estimación … al final de
 *   ejercicio»: el presupuesto con las modificaciones «ya tramitadas y/o
 *   previstas tramitar», no el crédito definitivo a 30 de junio. Ni imprimen
 *   porcentaje con que cotejar lo leído.
 * - **1T 2024 y 1T 2025.** El listado de gastos de SICALWIN ordenado por
 *   PROGRAMA: sus subtotales son de área de gasto o de grupo de programa, no de
 *   capítulo económico, así que «Total Capítulo» no aparece. Los capítulos
 *   salen de sumar las partidas por la primera cifra de su código económico, y
 *   la suma tiene que dar, al céntimo, el «Total Gastos» de la hoja. Los
 *   ingresos del 1T de 2024 tampoco traen «Total Capítulo»: se suman sus
 *   «Total Concepto».
 *
 * Y la columna de ingresos de SICALWIN era la equivocada: el parser leía los
 * DR, brutos, y la hoja calcula su porcentaje con los DR NETOS de la segunda
 * línea —sin anulaciones ni devoluciones—. El 2T de 2025 publicado decía 61,8 %
 * donde la hoja imprime «61,37%», y el cierre de 2025, 85,4 % donde imprime
 * «84,29%».
 *
 * Fixtures: el texto que da pdf-parse de las hojas reales, descargadas el
 * 29-10-2026. En las cuatro del Ministerio se retiró el nombre de la persona
 * usuaria del formulario («Nombre Usuario: …»), que el parser no lee; nada
 * más cambia.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseBudgetExecutionPdf,
  elegirDocumento,
  mergeExecutionPeriod,
  motivoDeDescarte,
  unirPartes,
  type ExecDoc,
} from '../src/scraper/budget-execution'

const fx = (n: string) => readFileSync(join(__dirname, 'fixtures', n), 'utf8')
const hoja = (n: string) => parseBudgetExecutionPdf(fx(`budget-execution-${n}.txt`))

const sumaDe = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100
/** Lo que los capítulos suman, campo a campo, para compararlo con el total. */
const sumas = (d: ExecDoc) => ({
  inicial: sumaDe(d.chapters.map((c) => c.inicial)),
  actual: sumaDe(d.chapters.map((c) => c.actual)),
  ejecutado: sumaDe(d.chapters.map((c) => c.ejecutado)),
})
const delTotal = (d: ExecDoc) => ({
  inicial: d.total.inicial,
  actual: d.total.actual,
  ejecutado: d.total.ejecutado,
})
/** Ejecutado sobre definitivo con los dos decimales con que lo imprime la hoja. */
const pct2 = (d: ExecDoc) => Math.round((d.total.ejecutado / d.total.actual) * 10000) / 100

describe('el listado de gastos de SICALWIN ordenado por programas', () => {
  const g25 = hoja('gastos_1t2025')
  const g24 = hoja('gastos_1t2024')

  it('1T 2025: de gastos, de 2025, cortado el 31 de marzo', () => {
    expect(g25.kind).toBe('gastos')
    expect(g25.year).toBe(2025)
    expect(g25.fechaListado).toBe('31/03/2025')
    expect(g25.fechaImpresion).toBe('31/03/2025')
  })

  it('1T 2025: el total es el «Total Gastos», y su porcentaje el «%O /Cr» que imprime', () => {
    expect(g25.total).toEqual({
      inicial: 37599838.15,
      modificaciones: 4766800.79,
      actual: 42366638.94,
      ejecutado: 7334658.09,
    })
    expect(g25.pctImpreso).toBe(17.31)
    expect(pct2(g25)).toBe(g25.pctImpreso)
  })

  it('1T 2025: los capítulos salen de las partidas y suman el total al céntimo', () => {
    expect(g25.chapters.map((c) => c.capitulo)).toEqual([1, 2, 3, 4, 6, 7, 8, 9])
    expect(sumas(g25)).toEqual(delTotal(g25))
    const c1 = g25.chapters.find((c) => c.capitulo === 1)!
    // La hoja no imprime el nombre del capítulo: es el de la clasificación
    // económica (Orden EHA/3565/2008).
    expect(c1.label).toBe('Gastos de personal')
    expect(c1.inicial).toBe(19516194.19)
    expect(c1.actual).toBe(19718300.7)
    expect(c1.ejecutado).toBe(4000738.86)
    // Las inversiones abren a cero: todo su crédito es modificación.
    const c6 = g25.chapters.find((c) => c.capitulo === 6)!
    expect(c6.inicial).toBe(0)
    expect(c6.modificaciones).toBe(c6.actual)
  })

  it('1T 2024: impresa el 9 de abril, y también cuadra con su total y su porcentaje', () => {
    expect(g24.year).toBe(2024)
    expect(g24.fechaImpresion).toBe('09/04/2024')
    expect(g24.total.actual).toBe(45328672.78)
    expect(g24.total.ejecutado).toBe(8208971.2)
    expect(g24.pctImpreso).toBe(18.11)
    expect(pct2(g24)).toBe(g24.pctImpreso)
    expect(sumas(g24)).toEqual(delTotal(g24))
    expect(g24.chapters.map((c) => c.capitulo)).toEqual([1, 2, 3, 4, 6, 7, 8, 9])
  })

  it('una partida cuyo código se pega a la cifra se lee bien: «2279935» + «20.000,00»', () => {
    // « 151/227993520.000,00…»: el código económico tiene siete cifras y el
    // inicial cinco; leído por la izquierda, el inicial salía 520.000. La suma
    // al céntimo de arriba es la que lo descarta; aquí, el capítulo en que cae.
    const c2 = g24.chapters.find((c) => c.capitulo === 2)!
    expect(c2.inicial).toBe(13365415.8)
  })
})

describe('los ingresos: derechos reconocidos NETOS, la columna con que la hoja calcula su %', () => {
  it('2T 2025: 36.583.883,80, el «61,37%» que imprime', () => {
    const d = hoja('ingresos_2t2025')
    expect(d.total.ejecutado).toBe(36583883.8)
    expect(d.pctImpreso).toBe(61.37)
    expect(pct2(d)).toBe(d.pctImpreso)
    expect(sumas(d)).toEqual(delTotal(d))
  })

  it('el cierre de 2025: 58.166.697,85, el «84,29%» que imprime', () => {
    const d = hoja('ingresos_4t2025')
    expect(d.fechaImpresion).toBe('11/02/2026')
    expect(d.total.actual).toBe(69011433.76)
    expect(d.total.ejecutado).toBe(58166697.85)
    expect(d.pctImpreso).toBe(84.29)
    expect(pct2(d)).toBe(d.pctImpreso)
    expect(sumas(d)).toEqual(delTotal(d))
  })

  it('1T 2025: 20.752.283,60 de 44.213.697,65, el «46,94%» que imprime', () => {
    const d = hoja('ingresos_1t2025')
    expect(d.fechaListado).toBe('31/03/2025')
    expect(d.total.ejecutado).toBe(20752283.6)
    expect(d.pctImpreso).toBe(46.94)
    expect(pct2(d)).toBe(d.pctImpreso)
    expect(sumas(d)).toEqual(delTotal(d))
    // El 47 % no es un error de lectura: la hoja reconoce 14,6 M€ de
    // transferencias de capital sin previsión que los cubra.
    const c7 = d.chapters.find((c) => c.capitulo === 7)!
    expect(c7.actual).toBe(0)
    expect(c7.ejecutado).toBe(14624831.31)
  })

  it('1T 2024, sin «Total Capítulo»: los capítulos salen de los «Total Concepto»', () => {
    const d = hoja('ingresos_1t2024')
    expect(d.kind).toBe('ingresos')
    expect(d.fechaImpresion).toBe('09/04/2024')
    expect(d.chapters.map((c) => c.capitulo)).toEqual([1, 2, 3, 4, 5, 7, 8])
    expect(sumas(d)).toEqual(delTotal(d))
    expect(d.chapters.find((c) => c.capitulo === 1)!.label).toBe('Impuestos directos')
    // El 0,1 % que se leía es el de los DR brutos (68.743,22); la hoja imprime
    // el de los netos, «0,08%».
    expect(d.total.ejecutado).toBe(37729.64)
    expect(d.pctImpreso).toBe(0.08)
    expect(pct2(d)).toBe(d.pctImpreso)
  })

  it('los gastos de SICALWIN siguen en las obligaciones reconocidas netas', () => {
    const d = hoja('gastos_2t2025')
    expect(d.total.ejecutado).toBe(18909465.12)
    expect(d.pctImpreso).toBe(30.44)
    expect(pct2(d)).toBe(d.pctImpreso)
  })

  it('el resumen por capítulos imprime el suyo al pie', () => {
    expect(hoja('gastos-resumen_1t2026').pctImpreso).toBe(11.07)
    expect(hoja('ingresos-resumen_1t2026').pctImpreso).toBe(5.74)
  })
})

describe('los formularios F.1.1 del Ministerio (2T 2023)', () => {
  const ic = hoja('f11-ingresos-corrientes_2t2023')
  const ik = hoja('f11-ingresos-capital_2t2023')
  const gc = hoja('f11-gastos-corrientes_2t2023')
  const gk = hoja('f11-gastos-capital_2t2023')

  it('cada hoja dice su lado y su mitad', () => {
    expect([ic.kind, ik.kind, gc.kind, gk.kind]).toEqual([
      'ingresos',
      'ingresos',
      'gastos',
      'gastos',
    ])
    expect([ic.parte, ik.parte, gc.parte, gk.parte]).toEqual([
      'corriente',
      'capital',
      'corriente',
      'capital',
    ])
  })

  it('el corte es el fin del trimestre que declaran: «acumulados a final del trimestre vencido»', () => {
    for (const d of [ic, ik, gc, gk]) {
      expect(d.year).toBe(2023)
      expect(d.fechaListado).toBe('30/06/2023')
      expect(d.fechaImpresion).toBeNull()
    }
  })

  it('su «definitivo» es una estimación a fin de ejercicio, y no imprimen porcentaje', () => {
    for (const d of [ic, ik, gc, gk]) {
      expect(d.definitivo).toBe('estimado')
      expect(d.pctImpreso).toBeNull()
    }
    expect(hoja('gastos_2t2025').definitivo).toBe('a-la-fecha')
    expect(hoja('gastos-resumen_1t2026').definitivo).toBe('a-la-fecha')
  })

  it('cada mitad lee sus capítulos, y suman su total', () => {
    expect(gc.chapters.map((c) => c.capitulo)).toEqual([1, 2, 3, 4, 5])
    expect(gk.chapters.map((c) => c.capitulo)).toEqual([6, 7, 8, 9])
    expect(ic.chapters.map((c) => c.capitulo)).toEqual([1, 2, 3, 4, 5])
    expect(ik.chapters.map((c) => c.capitulo)).toEqual([6, 7, 8, 9])
    for (const d of [ic, ik, gc, gk]) expect(sumas(d)).toEqual(delTotal(d))
    expect(gc.total).toEqual({
      inicial: 35511960.22,
      modificaciones: 761287.82,
      actual: 36273248.04,
      ejecutado: 15772274.68,
    })
    const c2 = gc.chapters.find((c) => c.capitulo === 2)!
    expect(c2.label).toBe('GASTOS EN BIENES CORRIENTES Y SERVICIOS')
    // El fondo de contingencia sólo trae dos columnas: no se reconoce obligación.
    const c5 = gc.chapters.find((c) => c.capitulo === 5)!
    expect(c5.ejecutado).toBe(0)
  })

  it('las dos mitades de un lado hacen un documento, con los nueve capítulos', () => {
    const gastos = unirPartes([gk, gc])
    expect(gastos).toHaveLength(1)
    const [g] = gastos
    expect(g.parte).toBeUndefined()
    expect(g.kind).toBe('gastos')
    expect(g.fechaListado).toBe('30/06/2023')
    expect(g.definitivo).toBe('estimado')
    expect(g.chapters.map((c) => c.capitulo)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(g.total).toEqual({
      inicial: 49241425.96,
      modificaciones: 11103801.28,
      actual: 60345227.24,
      ejecutado: 20021530.01,
    })
    expect(sumas(g)).toEqual(delTotal(g))
    const [i] = unirPartes([ic, ik])
    expect(i.total.actual).toBe(60350145.2)
    expect(i.total.ejecutado).toBe(21361338.94)
  })

  it('una mitad sola no es un lado: nunca se elige', () => {
    expect(unirPartes([gc])).toEqual([gc])
    expect(elegirDocumento([gc])).toBeNull()
    expect(elegirDocumento(unirPartes([gc, gk]))).not.toBeNull()
  })

  it('las hojas que no son mitades pasan tal cual', () => {
    const g = hoja('gastos_2t2025')
    expect(unirPartes([g])).toEqual([g])
  })
})

describe('qué se publica: cada periodo cuadra, o se calla diciendo por qué', () => {
  const periodo = (g: ExecDoc, i: ExecDoc, trimestre: number) =>
    mergeExecutionPeriod(g, i, { trimestre })

  it('el 1T de 2025 se publica, y lleva lo que se cotejó', () => {
    const p = periodo(hoja('gastos_1t2025'), hoja('ingresos_1t2025'), 1)
    expect(motivoDeDescarte(p, { year: 2025 })).toBeNull()
    expect(p.fechaListado).toBe('31/03/2025')
    expect(p.mismoCorte).toBe(true)
    expect(p.ejecucionPct).toEqual({ gastos: 17.3, ingresos: 46.9 })
    expect(p.cotejo).toEqual({
      gastos: { pctImpreso: 17.31, definitivo: 'a-la-fecha' },
      ingresos: { pctImpreso: 46.94, definitivo: 'a-la-fecha' },
    })
  })

  it('los periodos que ya se publicaban siguen publicándose', () => {
    const t2 = periodo(hoja('gastos_2t2025'), hoja('ingresos_2t2025'), 2)
    expect(motivoDeDescarte(t2, { year: 2025 })).toBeNull()
    expect(t2.ejecucionPct.ingresos).toBe(61.4)
    const t4 = periodo(hoja('gastos_4t2025'), hoja('ingresos_4t2025'), 4)
    expect(motivoDeDescarte(t4, { year: 2025 })).toBeNull()
    expect(t4.ejecucionPct).toEqual({ gastos: 60.2, ingresos: 84.3 })
    const q1 = periodo(hoja('gastos-resumen_1t2026'), hoja('ingresos-resumen_1t2026'), 1)
    expect(motivoDeDescarte(q1, { year: 2026 })).toBeNull()
  })

  it('el 1T de 2024 cuadra, pero sus ingresos no estaban contabilizados: no se publica', () => {
    const g = hoja('gastos_1t2024')
    const i = hoja('ingresos_1t2024')
    const p = periodo(g, i, 1)
    expect(p.mismoCorte).toBe(true)
    expect(p.fechaListado).toBe('09/04/2024')
    // Las transferencias corrientes —las del Estado se ingresan cada mes—
    // suman en negativo: sólo hay devoluciones. Un 0,08 % así no dice cuánto se
    // ingresó en el trimestre, sino que la hoja se sacó antes de apuntarlo.
    expect(i.chapters.find((c) => c.capitulo === 4)!.ejecutado).toBe(-11102.82)
    const motivo = motivoDeDescarte(p, { year: 2024 })
    expect(motivo).toMatch(/^ingresos sin contabilizar/)
    expect(motivo).toMatch(/cap\. 4/)
    expect(motivo).toMatch(/09\/04\/2024/)
  })

  it('el 2T de 2023 cuadra, pero su «definitivo» es una estimación: no se publica', () => {
    const [g] = unirPartes([
      hoja('f11-gastos-corrientes_2t2023'),
      hoja('f11-gastos-capital_2t2023'),
    ])
    const [i] = unirPartes([
      hoja('f11-ingresos-corrientes_2t2023'),
      hoja('f11-ingresos-capital_2t2023'),
    ])
    const p = periodo(g, i, 2)
    expect(p.mismoCorte).toBe(true)
    expect(p.fechaListado).toBe('30/06/2023')
    expect(p.cotejo.gastos).toEqual({ pctImpreso: null, definitivo: 'estimado' })
    expect(motivoDeDescarte(p, { year: 2023 })).toMatch(/estimación a fin de ejercicio/)
  })

  // Las guardas, cada una con la hoja real y UN defecto: si no saltan aquí, no
  // saltan nunca.
  const base = () => ({ g: hoja('gastos_1t2025'), i: hoja('ingresos_1t2025') })

  it('unos capítulos que no suman el total no se publican', () => {
    const { g, i } = base()
    const p = periodo({ ...g, chapters: g.chapters.filter((c) => c.capitulo !== 2) }, i, 1)
    expect(motivoDeDescarte(p, { year: 2025 })).toMatch(/^los capítulos de gastos no suman/)
  })

  it('un total leído en una columna que no es la del porcentaje de la hoja no se publica', () => {
    const { g, i } = base()
    // Los DR brutos del 1T de 2025, la columna que se leía antes.
    const brutos = { ...i, total: { ...i.total, ejecutado: 20817755.6 } }
    const chapters = i.chapters.map((c) =>
      c.capitulo === 1 ? { ...c, ejecutado: c.ejecutado + 65472 } : c,
    )
    const p = periodo(g, { ...brutos, chapters }, 1)
    expect(motivoDeDescarte(p, { year: 2025 })).toMatch(
      /^la ejecución de ingresos leída \(47,08 %\) no es la que imprime la hoja \(46,94 %\)/,
    )
  })

  it('una hoja sin porcentaje impreso no tiene con qué cotejarse: no se publica', () => {
    const { g, i } = base()
    const p = periodo({ ...g, pctImpreso: null }, i, 1)
    expect(motivoDeDescarte(p, { year: 2025 })).toMatch(/^la hoja de gastos no imprime porcentaje/)
  })
})
