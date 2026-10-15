import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { contrastarPresupuesto, TOLERANCIA_EQUILIBRIO } from '../src/scraper/budget-contraste'

const ROOT = join(__dirname, '..')
const budget = JSON.parse(readFileSync(join(ROOT, 'public/data/budget.json'), 'utf8'))
const ejecucion = JSON.parse(readFileSync(join(ROOT, 'public/data/budget-execution.json'), 'utf8'))

describe('scraper/budget-contraste', () => {
  const c = contrastarPresupuesto(budget.snapshot, ejecucion.latest)!

  it('mide el desacuerdo real entre las dos fuentes publicadas', () => {
    expect(c).not.toBeNull()
    expect(c.anio).toBe(budget.snapshot.year)
    expect(c.hayDesacuerdo).toBe(true)
    expect(Math.abs(c.diferenciaGastos)).toBeGreaterThan(TOLERANCIA_EQUILIBRIO)
  })

  it('los ingresos sí coinciden, que es lo que descarta un error de lectura', () => {
    // Si las dos fuentes coinciden al céntimo en ingresos y no en gastos, el
    // desacuerdo no puede ser un desfase de columnas del parser.
    expect(c.ingresosCoinciden).toBe(true)
  })

  it('cada fuente cuadra consigo misma: no hay error de parseo que corregir', () => {
    const sumaConprel = c.capitulos.reduce((s, x) => s + x.conprel, 0)
    const sumaMunicipal = c.capitulos.reduce((s, x) => s + x.municipal, 0)
    expect(Math.abs(sumaConprel - c.gastosConprel)).toBeLessThan(1)
    expect(Math.abs(sumaMunicipal - c.gastosMunicipal)).toBeLessThan(1)
  })

  it('la diferencia no es de signo constante, así que no es consolidación', () => {
    // Consolidar entidades dependientes haría CONPREL mayor o igual en todo.
    // Aquí es mayor en unos capítulos y menor en otros, y eso descarta la
    // explicación cómoda.
    const mayores = c.capitulos.filter((x) => x.diferencia > 1).length
    const menores = c.capitulos.filter((x) => x.diferencia < -1).length
    expect(mayores).toBeGreaterThan(0)
    expect(menores).toBeGreaterThan(0)
  })

  it('detecta que el presupuesto del ministerio no está en equilibrio', () => {
    // Art. 165.4 TRLRHL: el presupuesto general se aprueba sin déficit inicial,
    // y la exigencia vale en los dos sentidos. Aquí sobran ingresos.
    expect(Math.abs(c.desequilibrioConprel)).toBeGreaterThan(TOLERANCIA_EQUILIBRIO)
  })

  it('no contrasta ejercicios distintos, que mediría el paso del tiempo', () => {
    expect(contrastarPresupuesto({ ...budget.snapshot, year: 2019 }, ejecucion.latest)).toBeNull()
  })

  it('calla cuando falta una de las dos fuentes o vienen a cero', () => {
    expect(contrastarPresupuesto(null, ejecucion.latest)).toBeNull()
    expect(contrastarPresupuesto(budget.snapshot, null)).toBeNull()
    expect(
      contrastarPresupuesto({ ...budget.snapshot, totalExpense: 0 }, ejecucion.latest),
    ).toBeNull()
  })

  it('no declara desacuerdo cuando las dos fuentes coinciden', () => {
    const cuadrado = contrastarPresupuesto(
      { ...budget.snapshot, totalExpense: 1_000_000, totalRevenue: 1_000_000 },
      {
        ...ejecucion.latest,
        gastos: { ...ejecucion.latest.gastos, total: { inicial: 1_000_000 } },
      },
    )!
    expect(cuadrado.hayDesacuerdo).toBe(false)
  })

  // Una celda de CONPREL sin dato llega al snapshot como null (budget.ts). Si
  // aquí volviera a ser 0, la diferencia del capítulo sería la cifra municipal
  // entera, publicada como desacuerdo entre las dos fuentes.
  it('un capítulo sin dato en CONPREL no se contrasta como si valiera 0', () => {
    const snap = structuredClone(budget.snapshot)
    snap.expenseByEconomicChapter.find((x: { code: string }) => x.code === '1').amount = null
    const sin = contrastarPresupuesto(snap, ejecucion.latest)!
    const cap1 = sin.capitulos.find((x) => x.code === '1')!
    expect(cap1.conprel).toBeNull()
    expect(cap1.diferencia).toBeNull()
    expect(cap1.municipal).toBeGreaterThan(0)
  })

  it('sin total de ingresos no hay desequilibrio que medir ni coincidencia que afirmar', () => {
    const sin = contrastarPresupuesto({ ...budget.snapshot, totalRevenue: null }, ejecucion.latest)!
    expect(sin.desequilibrioConprel).toBeNull()
    expect(sin.ingresosCoinciden).toBeNull()
    // El desacuerdo en gastos sigue en pie: no depende de los ingresos.
    expect(sin.hayDesacuerdo).toBe(true)
  })

  it('sin total de gastos calla, igual que con la fuente ausente', () => {
    expect(
      contrastarPresupuesto({ ...budget.snapshot, totalExpense: null }, ejecucion.latest),
    ).toBeNull()
  })
})
