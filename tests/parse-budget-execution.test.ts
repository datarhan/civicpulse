import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSpanishAmount, parseBudgetExecutionPdf } from '../src/scraper/budget-execution'
import {
  mergeExecutionPeriod,
  pct,
  fechaDeCorte,
  elegirDocumento,
} from '../src/scraper/budget-execution'

const fx = (n: string) => readFileSync(join(__dirname, 'fixtures', n), 'utf8')

describe('parseSpanishAmount', () => {
  it('parses ES-formatted amounts incl. negatives', () => {
    expect(parseSpanishAmount('62.123.153,08')).toBe(62123153.08)
    expect(parseSpanishAmount('-13.086,58')).toBe(-13086.58)
    expect(parseSpanishAmount('0,00')).toBe(0)
  })
})

describe('parseBudgetExecutionPdf — gastos 2T2025', () => {
  const doc = parseBudgetExecutionPdf(fx('budget-execution-gastos_2t2025.txt'))

  it('reads kind + year', () => {
    expect(doc.kind).toBe('gastos')
    expect(doc.year).toBe(2025)
  })

  it('extracts the grand total (ejecutado = Obligaciones Reconocidas Netas, col 5)', () => {
    expect(doc.total.inicial).toBe(37599838.15)
    expect(doc.total.modificaciones).toBe(24523314.93)
    expect(doc.total.actual).toBe(62123153.08)
    expect(doc.total.ejecutado).toBe(18909465.12) // ORN — matches the listing's 30,44% (18.9M/62.1M)
  })

  it('extracts every chapter total incl. the wrapped Capítulo 2', () => {
    const caps = doc.chapters.map((c) => c.capitulo)
    expect(caps).toEqual([1, 2, 3, 4, 6, 7, 8, 9]) // no Cap 5 in this listing
    const c1 = doc.chapters.find((c) => c.capitulo === 1)!
    expect(c1.label).toBe('GASTOS DE PERSONAL')
    expect(c1.inicial).toBe(19516194.19)
    expect(c1.actual).toBe(20882613.97)
    expect(c1.ejecutado).toBe(9050222.8) // ORN — matches cap.1's 43,34%
    // Capítulo 6 = inversiones reales: budgeted €22.06M, executed €1.03M = 4.7% (the accountability signal)
    const c6 = doc.chapters.find((c) => c.capitulo === 6)!
    expect(c6.actual).toBe(22063735.33)
    expect(c6.ejecutado).toBe(1034230.67)
    // wrapped chapter still captured with a non-empty label + real amounts
    const c2 = doc.chapters.find((c) => c.capitulo === 2)!
    expect(c2.label.length).toBeGreaterThan(5)
    expect(c2.actual).toBeGreaterThan(0)
  })
})

describe('parseBudgetExecutionPdf — ingresos 2T2025', () => {
  const doc = parseBudgetExecutionPdf(fx('budget-execution-ingresos_2t2025.txt'))

  it('detects the ingresos kind', () => {
    expect(doc.kind).toBe('ingresos')
    expect(doc.year).toBe(2025)
  })

  it('uses the ingresos column layout: actual = col 1, ejecutado (DR) = col 3', () => {
    // Ingresos has no Modificación column; actual is the previsión definitiva.
    expect(doc.total.inicial).toBe(39034883.74)
    expect(doc.total.actual).toBe(59611751.19)
    expect(doc.total.ejecutado).toBe(36814321.64) // Derechos Reconocidos ≈ 61.8% ejecución
    expect(doc.total.modificaciones).toBe(20576867.45) // derived: actual − inicial
  })

  it('extracts revenue chapters incl. Cap 1 Impuestos directos', () => {
    expect(doc.chapters.length).toBeGreaterThan(2)
    const c1 = doc.chapters.find((c) => c.capitulo === 1)!
    expect(c1.label).toBe('Impuestos directos')
    expect(c1.inicial).toBe(17963497.13)
    expect(c1.actual).toBe(17963497.13)
    expect(c1.ejecutado).toBe(12730686.61)
  })

  it('dedups repeated Total Capítulo lines (unique capítulos)', () => {
    const d = parseBudgetExecutionPdf(fx('budget-execution-ingresos_2t2025.txt'))
    const caps = d.chapters.map((c) => c.capitulo)
    expect(new Set(caps).size).toBe(caps.length) // no duplicates
  })
})

describe('mergeExecutionPeriod', () => {
  it('pct is executed/actual as a 0–100 percentage, safe on zero', () => {
    expect(pct(18909465.12, 62123153.08)).toBe(30.4)
    expect(pct(5, 0)).toBe(0)
  })

  it('combines gastos+ingresos into one period with execution %', () => {
    const g = parseBudgetExecutionPdf(fx('budget-execution-gastos_2t2025.txt'))
    const i = parseBudgetExecutionPdf(fx('budget-execution-ingresos_2t2025.txt'))
    const p = mergeExecutionPeriod(g, i, { trimestre: 2 })
    expect(p.year).toBe(2025)
    expect(p.trimestre).toBe(2)
    expect(p.gastos.total.actual).toBe(62123153.08)
    expect(p.ejecucionPct.gastos).toBe(30.4)
    expect(p.ejecucionPct.ingresos).toBe(61.8)
    expect(p.ingresos.chapters.length).toBeGreaterThan(0)
  })
})

/**
 * Dos hojas REALES de gastos de 2025 que el ayuntamiento cuelga en la MISMA
 * página: la del 2T (impresa el 30-06-2025) y la del 4T (impresa el
 * 11-02-2026). Las dos dicen «Fecha de listado igual a: 31/12/2025» — es el
 * parámetro del informe, no el corte de los datos — y las dos tienen 8
 * capítulos. El primer snapshot eligió la del 2T por el orden de la página y la
 * publicó como cierre del ejercicio: «gastó 30 de cada 100» donde el cierre
 * dice 60, y junto a unos ingresos del 4T.
 */
describe('fecha de corte y elección entre hojas de un mismo año', () => {
  const g2 = parseBudgetExecutionPdf(fx('budget-execution-gastos_2t2025.txt'))
  const g4 = parseBudgetExecutionPdf(fx('budget-execution-gastos_4t2025.txt'))
  const i2 = parseBudgetExecutionPdf(fx('budget-execution-ingresos_2t2025.txt'))

  it('lee la fecha de impresión de la cabecera y guarda el parámetro del informe tal cual', () => {
    expect(g2.fechaImpresion).toBe('30/06/2025')
    expect(g4.fechaImpresion).toBe('11/02/2026')
    expect(g2.fechaListado).toBe('31/12/2025')
    expect(g4.fechaListado).toBe('31/12/2025')
  })

  it('el corte es la fecha anterior: una hoja no trae datos posteriores a su impresión', () => {
    expect(fechaDeCorte(g2)).toBe('30/06/2025')
    expect(fechaDeCorte(g4)).toBe('31/12/2025')
  })

  it('el 4T real: 40.344.388,83 de 67.072.868,89 (60,15 % en la propia hoja)', () => {
    expect(g4.total.actual).toBe(67072868.89)
    expect(g4.total.ejecutado).toBe(40344388.83)
    expect(g4.chapters).toHaveLength(g2.chapters.length)
  })

  it('entre hojas del mismo año gana el corte más tardío, sea cual sea el orden de la página', () => {
    expect(elegirDocumento([g2, g4])).toBe(g4)
    expect(elegirDocumento([g4, g2])).toBe(g4)
    expect(elegirDocumento([])).toBeNull()
  })

  it('un periodo con gastos e ingresos de cortes distintos se marca, y su fecha es el corte', () => {
    const mezclado = mergeExecutionPeriod(g4, i2, { trimestre: null })
    expect(mezclado.mismoCorte).toBe(false)
    const junio = mergeExecutionPeriod(g2, i2, { trimestre: null })
    expect(junio.mismoCorte).toBe(true)
    expect(junio.fechaListado).toBe('30/06/2025')
    expect(junio.fechaListadoFuente).toBe('31/12/2025')
  })
})
