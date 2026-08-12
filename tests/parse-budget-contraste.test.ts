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
})
