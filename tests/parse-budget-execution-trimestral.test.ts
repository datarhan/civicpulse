/**
 * La ejecución presupuestaria, trimestre a trimestre (RED).
 *
 * Desde el tercer trimestre de 2025 el Ayuntamiento publica la ejecución con otra
 * plantilla —«1_2 ITEM 37 Ejecución trimestral …»—: un resumen por capítulos de
 * gastos y otro de ingresos, más el desglose de operaciones corrientes y el de
 * financieras y de capital. El parser sólo leía el listado de SICALWIN
 * («Estado de ejecución de Gastos»), así que el primer trimestre de 2026 se
 * descartaba en silencio y /presupuesto seguía en 2025 a finales de octubre.
 *
 * Y el raspador leía UNA hoja por página del índice, cuando la página de un año
 * cuelga sus cuatro trimestres: de 2025 sólo llegaba el cierre.
 *
 * Fixtures: el texto que da pdf-parse de las hojas reales del 1T de 2026, y los
 * enlaces a PDF de cada página del índice tal como estaban el 29-10-2026.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseBudgetExecutionPdf,
  elegirDocumento,
  mergeExecutionPeriod,
  trimestreDeEnlace,
  anioDeEnlace,
  hojasDePagina,
  periodosDelIndice,
} from '../src/scraper/budget-execution'

const fx = (n: string) => readFileSync(join(__dirname, 'fixtures', n), 'utf8')
const PAGINAS = JSON.parse(fx('budget-execution-paginas_2026-10-29.json')) as {
  paginas: Array<{ label: string; href: string; enlaces: string[] }>
}

const sumaDe = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100

describe('el resumen por capítulos de gastos (1T 2026)', () => {
  const doc = parseBudgetExecutionPdf(fx('budget-execution-gastos-resumen_1t2026.txt'))

  it('es de gastos, de 2026, y su única fecha es la de impresión', () => {
    expect(doc.kind).toBe('gastos')
    expect(doc.year).toBe(2026)
    expect(doc.fechaListado).toBeNull()
    expect(doc.fechaImpresion).toBe('27/04/2026')
  })

  it('lee los nueve capítulos, también los que están a cero', () => {
    expect(doc.chapters.map((c) => c.capitulo)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    const c1 = doc.chapters.find((c) => c.capitulo === 1)!
    expect(c1.label).toBe('GASTOS DE PERSONAL')
    expect(c1.inicial).toBe(19946560.44)
    expect(c1.actual).toBe(20294379.35) // créditos definitivos
    expect(c1.ejecutado).toBe(4152017.04) // obligaciones reconocidas netas
    expect(c1.modificaciones).toBe(347818.91) // definitivos − iniciales: la hoja no trae la columna
    const c6 = doc.chapters.find((c) => c.capitulo === 6)!
    expect(c6.inicial).toBe(0)
    expect(c6.actual).toBe(20951972.67)
    expect(c6.ejecutado).toBe(401415.27)
  })

  it('el total cuadra con sus capítulos y con el porcentaje que imprime la hoja', () => {
    expect(doc.total).toEqual({
      inicial: 40677321.71,
      modificaciones: 21510167.14,
      actual: 62187488.85,
      ejecutado: 6883030.04,
    })
    expect(sumaDe(doc.chapters.map((c) => c.ejecutado))).toBe(doc.total.ejecutado)
    expect(sumaDe(doc.chapters.map((c) => c.actual))).toBe(doc.total.actual)
    // «11,07%» al pie: ejecutado sobre definitivo, la columna que se ha leído.
    expect(Math.round((doc.total.ejecutado / doc.total.actual) * 10000) / 100).toBe(11.07)
  })
})

describe('el resumen por capítulos de ingresos (1T 2026)', () => {
  const doc = parseBudgetExecutionPdf(fx('budget-execution-ingresos-resumen_1t2026.txt'))

  it('es de ingresos', () => {
    expect(doc.kind).toBe('ingresos')
    expect(doc.year).toBe(2026)
  })

  it('previsiones iniciales, definitivas y derechos reconocidos netos, con un negativo', () => {
    expect(doc.total).toEqual({
      inicial: 41023252.4,
      modificaciones: 21510167.14,
      actual: 62533419.54,
      ejecutado: 3587615.85,
    })
    const c7 = doc.chapters.find((c) => c.capitulo === 7)!
    expect(c7.ejecutado).toBe(-4928.52)
    expect(sumaDe(doc.chapters.map((c) => c.ejecutado))).toBe(doc.total.ejecutado)
    expect(Math.round((doc.total.ejecutado / doc.total.actual) * 10000) / 100).toBe(5.74)
  })
})

describe('entre las hojas de un trimestre', () => {
  it('el desglose de operaciones corrientes no pasa por un resumen: no tiene capítulos', () => {
    const detalle = parseBudgetExecutionPdf(
      fx('budget-execution-gastos-detalle-corriente_1t2026.txt'),
    )
    expect(detalle.chapters).toEqual([])
    expect(detalle.total.actual).toBe(0)
    const resumen = parseBudgetExecutionPdf(fx('budget-execution-gastos-resumen_1t2026.txt'))
    expect(elegirDocumento([detalle, resumen])).toBe(resumen)
  })

  it('el primer trimestre de 2026 es un periodo publicable, con el corte en la impresión', () => {
    const p = mergeExecutionPeriod(
      parseBudgetExecutionPdf(fx('budget-execution-gastos-resumen_1t2026.txt')),
      parseBudgetExecutionPdf(fx('budget-execution-ingresos-resumen_1t2026.txt')),
      { trimestre: 1 },
    )
    expect(p.year).toBe(2026)
    expect(p.trimestre).toBe(1)
    expect(p.fechaListado).toBe('27/04/2026')
    expect(p.mismoCorte).toBe(true)
    expect(p.ejecucionPct).toEqual({ gastos: 11.1, ingresos: 5.7 })
  })
})

describe('el trimestre y el año de cada enlace', () => {
  it('lee el trimestre de cómo lo escribe el Ayuntamiento', () => {
    expect(trimestreDeEnlace('Estado de ejecución presupuestaria GASTOS 1T')).toBe(1)
    expect(trimestreDeEnlace('Ejecución presupuesto de gastos 2T2025')).toBe(2)
    expect(trimestreDeEnlace('Ejecución trimestral Gastos Resumen 3T2025')).toBe(3)
    expect(trimestreDeEnlace('Ejecución trimestral Gastos Resumen 1T 2026')).toBe(1)
    expect(trimestreDeEnlace('Estado de ejecución ppto gastos 4T2024')).toBe(4)
    // «2 y 3T»: la hoja llega hasta el tercero.
    expect(trimestreDeEnlace('Estado de ejecución ppto gastos 2 y 3T2024')).toBe(3)
    // Una fecha de cierre: el trimestre en que cae.
    expect(trimestreDeEnlace('3- Estado ejecución gastos corrientes 30-06-23')).toBe(2)
    expect(trimestreDeEnlace('2023 - 2º trimestre')).toBe(2)
    expect(trimestreDeEnlace('Estados de ejecución 2025')).toBeNull()
  })

  it('lee el año cuando lo trae, y si no, no lo inventa', () => {
    expect(anioDeEnlace('Ejecución presupuesto de gastos 2T2025')).toBe(2025)
    expect(anioDeEnlace('Ejecución trimestral Gastos Resumen 1T 2026')).toBe(2026)
    expect(anioDeEnlace('3- Estado ejecución gastos corrientes 30-06-23')).toBe(2023)
    expect(anioDeEnlace('Estado de ejecución presupuestaria GASTOS 1T')).toBeNull()
  })
})

describe('las hojas de cada página del índice', () => {
  const pagina = (label: string) => PAGINAS.paginas.find((p) => p.label === label)!

  it('cada hoja con su clase, su año y su trimestre', () => {
    const hojas = hojasDePagina(pagina('Estados de ejecución 2026'))
    expect(hojas).toHaveLength(6)
    for (const h of hojas) {
      expect(h.year).toBe(2026)
      expect(h.trimestre).toBe(1)
      expect(h.href).toMatch(/^https:\/\/www\.ribarroja\.es\/.+\.pdf$/)
    }
    expect(hojas.filter((h) => h.kind === 'gastos')).toHaveLength(3)
    expect(hojas.filter((h) => h.kind === 'ingresos')).toHaveLength(3)
  })

  it('sin año en el enlace, el de la página', () => {
    const hojas = hojasDePagina(pagina('Estados de ejecución 2025'))
    const t1 = hojas.filter((h) => h.trimestre === 1)
    expect(t1.map((h) => h.year)).toEqual([2025, 2025])
  })

  it('el resumen que junta ingresos y gastos no es de ninguna de las dos clases', () => {
    const hojas = hojasDePagina(pagina('Estados de ejecución 2025'))
    const junto = hojas.find((h) => /Resumen ingresos y gastos/.test(h.texto))!
    expect(junto.kind).toBeNull()
  })

  it('un mismo PDF enlazado como «2 y 3T» y como «4T» es una sola hoja, la del cuarto', () => {
    const hojas = hojasDePagina(pagina('Estados de ejecución 2024'))
    expect(hojas).toHaveLength(4)
    const cierre = hojas.filter((h) => /ITEM-37/.test(h.href))
    expect(cierre.map((h) => h.trimestre)).toEqual([4, 4])
  })
})

describe('los periodos del índice', () => {
  const periodos = periodosDelIndice(PAGINAS.paginas)
  const clave = (p: { year: number; trimestre: number | null }) => `${p.year}-T${p.trimestre}`

  it('un periodo por año y trimestre, no uno por página', () => {
    expect(periodos.map(clave)).toEqual([
      '2023-T2',
      '2024-T1',
      '2024-T4',
      '2025-T1',
      '2025-T2',
      '2025-T3',
      '2025-T4',
      '2026-T1',
    ])
  })

  it('cada periodo con las hojas de gastos y de ingresos que le tocan', () => {
    const t1 = periodos.find((p) => clave(p) === '2026-T1')!
    expect(t1.gastos).toHaveLength(3)
    expect(t1.ingresos).toHaveLength(3)
    const t4 = periodos.find((p) => clave(p) === '2025-T4')!
    expect(t4.gastos).toHaveLength(1)
    expect(t4.ingresos).toHaveLength(1)
    // Corrientes y de capital van por separado en 2023: las dos son del periodo.
    const t2023 = periodos.find((p) => clave(p) === '2023-T2')!
    expect(t2023.gastos).toHaveLength(2)
    expect(t2023.ingresos).toHaveLength(2)
  })

  it('ninguna hoja de una clase se queda fuera de su periodo', () => {
    const enPeriodos = periodos.flatMap((p) => [...p.gastos, ...p.ingresos])
    const conClase = PAGINAS.paginas.flatMap((p) => hojasDePagina(p)).filter((h) => h.kind !== null)
    expect(new Set(enPeriodos).size).toBe(conClase.length)
  })
})
