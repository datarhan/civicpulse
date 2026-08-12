import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parsePmpWorkbook,
  normalizarPeriodo,
  ineFromCodigoPmp,
  distribucionEn,
  percentilEn,
  PLAZO_LEGAL_DIAS,
} from '../src/scraper/pmp'

// Real ministry rows, sliced to the Comunitat Valenciana by hand from
// pmp-series-rd-1040-2017.xlsx. Values and header verbatim.
const FIXTURE = join(__dirname, 'fixtures', 'pmp_series_cv_2026-08.xlsx')
const { periodos, municipios } = parsePmpWorkbook(readFileSync(FIXTURE))
const rr = municipios.find((m) => m.ine === '46214')!

describe('scraper/pmp', () => {
  it('parsed the sheet, not an empty shell', () => {
    expect(municipios.length).toBeGreaterThan(400)
    expect(periodos.length).toBeGreaterThan(30)
    expect(rr).toBeDefined()
    expect(rr.nombre).toMatch(/Riba-roja de T[uú]ria/i)
    expect(rr.ccaa).toMatch(/Comunitat Valenciana/i)
  })

  it('normalises the three spellings the source uses for one quarter', () => {
    // '2018 - T2', '2023- T1' and '2025 - T1' are the same shape written three
    // ways; unnormalised they sort wrongly and never join across tables.
    expect(normalizarPeriodo('2018 - T2')).toBe('2018-T2')
    expect(normalizarPeriodo('2023- T1')).toBe('2023-T1')
    expect(normalizarPeriodo('2025 - T1')).toBe('2025-T1')
    expect(normalizarPeriodo('2026-06')).toBe('2026-06')
    expect(normalizarPeriodo('CORPORACIÓN LOCAL')).toBeNull()
    expect(normalizarPeriodo(null)).toBeNull()
  })

  it('keeps only ayuntamientos, by the A-A segment of the code', () => {
    expect(ineFromCodigoPmp('S.1313-17-46-214-A-A-000')).toBe('46214')
    expect(ineFromCodigoPmp('S.1313-17-46-000-D-D-000')).toBeNull() // diputación
    expect(ineFromCodigoPmp('basura')).toBeNull()
  })

  it('treats an empty monthly column as no data, never as zero days', () => {
    // Riba-roja reports quarterly, so its monthly columns are blank. Filling
    // them with 0 would paint a council that pays the same day.
    expect(rr.serie.length).toBeLessThan(periodos.length)
    expect(rr.serie.every((p) => p.dias > 0)).toBe(true)
    expect(rr.serie.every((p) => /^\d{4}-(T[1-4]|\d{2})$/.test(p.periodo))).toBe(true)
  })

  it('reads Riba-roja past the legal 30-day reference in its latest quarter', () => {
    const ultimo = rr.serie[rr.serie.length - 1]
    expect(ultimo.dias).toBeGreaterThan(PLAZO_LEGAL_DIAS)
    // The step change is the story: it ran inside or near the limit until 2023
    // and has not been back under 60 days since 2024.
    const antes = rr.serie.filter((p) => p.periodo < '2024')
    const desde = rr.serie.filter((p) => p.periodo >= '2024')
    const media = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
    expect(media(desde.map((p) => p.dias))).toBeGreaterThan(media(antes.map((p) => p.dias)))
  })

  it('situates the town against everyone reporting in the same quarter', () => {
    const ultimo = rr.serie[rr.serie.length - 1]
    const dist = distribucionEn(municipios, ultimo.periodo)!
    expect(dist.n).toBeGreaterThan(100)
    expect(dist.p25).toBeLessThanOrEqual(dist.mediana)
    expect(dist.mediana).toBeLessThanOrEqual(dist.p75)
    const pct = percentilEn(municipios, ultimo.periodo, ultimo.dias)!
    expect(pct).toBeGreaterThan(50) // slower than most
    expect(pct).toBeLessThanOrEqual(100)
  })

  it('returns null rather than a fabricated distribution for an unknown period', () => {
    expect(distribucionEn(municipios, '1999-T1')).toBeNull()
    expect(percentilEn(municipios, '1999-T1', 30)).toBeNull()
    expect(parsePmpWorkbook(readFileSync(FIXTURE), { hoja: 'No existe' })).toEqual({
      periodos: [],
      municipios: [],
    })
  })
})
