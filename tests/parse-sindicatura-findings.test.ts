import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseAuditFindings, type AuditFindings } from '../src/scraper/sindicatura-findings'

const FIXTURE = join(__dirname, 'fixtures', 'sindicatura_riba-roja_audit_2017-2019.txt')

describe('scraper/sindicatura-findings — parseAuditFindings', () => {
  let f: AuditFindings
  beforeAll(() => {
    f = parseAuditFindings(readFileSync(FIXTURE, 'utf8'))
  })

  it('extracts all 27 numbered deficiencies (the "salvedades")', () => {
    expect(f.deficiencies.length).toBe(27)
    expect(f.deficiencies.map((d) => d.n)).toEqual(Array.from({ length: 27 }, (_, i) => i + 1))
  })

  it('every deficiency has a category and clean text (no page headers, no stray superscripts)', () => {
    for (const d of f.deficiencies) {
      expect(d.category.length).toBeGreaterThan(3)
      expect(d.text.length).toBeGreaterThan(20)
      expect(d.text).not.toMatch(/Informe de fiscalización sobre el control interno/)
      expect(d.text).not.toMatch(/\n\s*\d+\s*\n/) // no lone superscript/page-number lines
      expect(d.text).not.toMatch(/^\d+\)/) // the "N)" marker itself is stripped
    }
  })

  it('captures the substance of key deficiencies verbatim', () => {
    const byN = (n: number) => f.deficiencies.find((d) => d.n === n)!
    expect(byN(1).text).toMatch(/principios contables|amortizaciones/i)
    // #13 — contract splitting, a procurement red flag
    expect(byN(13).text).toMatch(/fraccionamiento/i)
    expect(byN(27).text.length).toBeGreaterThan(20)
  })

  it('assigns thematic categories from the report subheadings', () => {
    const cats = new Set(f.deficiencies.map((d) => d.category))
    expect([...cats].some((c) => /económico-financiera/i.test(c))).toBe(true)
    // Tech deficiencies sit under the sub-areas of "Entorno tecnológico".
    expect([...cats].some((c) => /sistemas de información|organizativo/i.test(c))).toBe(true)
    // the first block (items 1-5) is the economic-financial area
    expect(f.deficiencies.find((d) => d.n === 1)!.category).toMatch(/económico-financiera/i)
    expect(f.deficiencies.find((d) => d.n === 27)!.category).toMatch(
      /tecnológico|sistemas de información|organizativo/i,
    )
  })

  it('extracts the 5 recommendations', () => {
    expect(f.recommendations.length).toBe(5)
    expect(f.recommendations.map((r) => r.n)).toEqual([1, 2, 3, 4, 5])
    expect(f.recommendations[0].text).toMatch(/organigrama/i)
    for (const r of f.recommendations) {
      expect(r.text.length).toBeGreaterThan(15)
      expect(r.text).not.toMatch(/RECOMENDACIONES|APÉNDICE/)
    }
  })

  it('is safe on empty / non-report text', () => {
    const empty = parseAuditFindings('just some unrelated text')
    expect(empty.deficiencies).toEqual([])
    expect(empty.recommendations).toEqual([])
  })
})
