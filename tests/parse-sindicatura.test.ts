import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseSindicaturaSearch,
  isLocalEntityReport,
  type SindicaturaReport,
} from '../src/scraper/sindicatura'

const FIXTURE = join(__dirname, 'fixtures', 'sindicatura_riba-roja_2026-07-05.html')

describe('scraper/sindicatura — parseSindicaturaSearch', () => {
  let reports: SindicaturaReport[]
  beforeAll(() => {
    reports = parseSindicaturaSearch(readFileSync(FIXTURE, 'utf8'))
  })

  it('parses every result row of the Sindicatura search', () => {
    expect(reports.length).toBeGreaterThan(100)
  })

  it('every report has a title, plausible year, absolute PDF url and a scope', () => {
    for (const r of reports) {
      expect(r.title.length).toBeGreaterThan(10)
      expect(Number.isInteger(r.year)).toBe(true)
      expect(r.year).toBeGreaterThan(1980)
      expect(r.year).toBeLessThan(2030)
      expect(r.url).toMatch(/^https:\/\/www\.sindicom\.gva\.es\/public\/Attachment\/.+\.pdf$/)
      expect(r.scope === 'dedicated' || r.scope === 'sectoral').toBe(true)
      expect(r.id.length).toBeGreaterThan(0)
    }
  })

  it('produces unique ids', () => {
    const ids = reports.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('flags reports whose TITLE names Riba-roja as "dedicated" (≥ 2)', () => {
    const dedicated = reports.filter((r) => r.scope === 'dedicated')
    expect(dedicated.length).toBeGreaterThanOrEqual(2)
    for (const d of dedicated) expect(d.title).toMatch(/riba-?roja/i)
  })

  it('captures the dedicated 2017-2019 internal-control audit verbatim', () => {
    const r = reports.find((x) => /control interno.*riba-?roja.*2017-2019/i.test(x.title))
    expect(r).toBeTruthy()
    expect(r!.scope).toBe('dedicated')
    expect(r!.url).toMatch(/InformefiscalzacioncontrolinternoRiba-rojadelTuria2017-2019/i)
  })

  it('sectoral reports (Riba-roja only inside) are the majority', () => {
    expect(reports.filter((r) => r.scope === 'sectoral').length).toBeGreaterThan(
      reports.filter((r) => r.scope === 'dedicated').length,
    )
  })
})

describe('scraper/sindicatura — isLocalEntityReport (sectoral relevance filter)', () => {
  it('keeps local-entity audits where Riba-roja is a genuine subject', () => {
    expect(
      isLocalEntityReport(
        'Informe de fiscalización de la cuenta general de las entidades locales. Ejercicio 2022',
      ),
    ).toBe(true)
    expect(
      isLocalEntityReport('Informe de fiscalización del control interno de los ayuntamientos'),
    ).toBe(true)
    expect(
      isLocalEntityReport(
        'Informe de auditoría de cumplimiento en materia de contratación de las entidades locales 2020',
      ),
    ).toBe(true)
  })

  it('drops reports where Riba-roja is only incidental (Generalitat/universities/hospitals)', () => {
    expect(
      isLocalEntityReport(
        'Auditoría de los gastos de personal de la Administración de la Generalitat',
      ),
    ).toBe(false)
    expect(
      isLocalEntityReport(
        'Informe de auditoría de cumplimiento de legalidad Universidad de Alicante 2021',
      ),
    ).toBe(false)
  })
})
