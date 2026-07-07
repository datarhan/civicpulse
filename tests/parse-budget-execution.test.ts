import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSpanishAmount, parseBudgetExecutionPdf } from '../src/scraper/budget-execution'
import { mergeExecutionPeriod, pct } from '../src/scraper/budget-execution'

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
