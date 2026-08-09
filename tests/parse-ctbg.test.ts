import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  buildSnapshot,
  CTBG_HEADERS_FOR_TEST,
  filterEntries,
  parseCtbgWorkbook,
  type CtbgEntry,
} from '../src/scraper/ctbg'

/**
 * Builds a synthetic CTBG-shaped workbook with two year sheets and a
 * configurable set of rows. Using XLSX.utils.aoa_to_sheet + write with
 * type:'buffer' gives us a real multi-sheet buffer — same as what the
 * network download would return.
 */
function makeBuffer(data: Record<string, (string | number | null)[][]>): Buffer {
  const wb = XLSX.utils.book_new()
  for (const [sheetName, rows] of Object.entries(data)) {
    const sheet = XLSX.utils.aoa_to_sheet([CTBG_HEADERS_FOR_TEST, ...rows])
    XLSX.utils.book_append_sheet(wb, sheet, sheetName)
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

function mkRow(
  o: Partial<{
    resolucion: string
    ano: number
    mesEntrada: string
    mesResolucion: string
    motivo: string
    asunto: string
    materia1: string
    materia2: string
    materia3: string
    sentido: string
    criterio1: string
    criterio2: string
    palabras: string
    organismo: string
  }> = {},
): (string | number | null)[] {
  return [
    o.resolucion ?? 'R CTBG 0001/2026 ',
    o.ano ?? 2025,
    o.mesEntrada ?? 'Octubre',
    o.mesResolucion ?? 'Enero',
    o.motivo ?? 'silencio',
    o.asunto ?? 'Asunto ejemplo',
    o.materia1 ?? 'Seguridad Pública',
    o.materia2 ?? '',
    o.materia3 ?? '',
    o.sentido ?? 'Estimatoria por motivos formales',
    o.criterio1 ?? '',
    o.criterio2 ?? '',
    o.palabras ?? 'palabras clave',
    o.organismo ?? 'Ministerio X',
  ]
}

describe('ctbg — parseCtbgWorkbook', () => {
  it('flattens rows from every yearly sheet', () => {
    const buf = makeBuffer({
      '2026': [mkRow({ resolucion: 'R CTBG 0001/2026' })],
      '2025': [
        mkRow({ resolucion: 'R CTBG 0001/2025' }),
        mkRow({ resolucion: 'R CTBG 0002/2025' }),
      ],
    })
    const entries = parseCtbgWorkbook(buf)
    expect(entries.length).toBe(3)
    const years = [...new Set(entries.map((e) => e.sheetYear))].sort()
    expect(years).toEqual([2025, 2026])
  })

  it('skips rows with no Resolución column', () => {
    const buf = makeBuffer({
      '2026': [
        mkRow({ resolucion: 'R CTBG 0001/2026' }),
        mkRow({ resolucion: '' }), // blank row
      ],
    })
    expect(parseCtbgWorkbook(buf).length).toBe(1)
  })

  it('ignores non-year sheet names', () => {
    const buf = makeBuffer({
      '2025': [mkRow({ resolucion: 'R CTBG 0001/2025' })],
      notas: [mkRow({ resolucion: 'R CTBG 9999/XXXX' })],
    })
    const entries = parseCtbgWorkbook(buf)
    expect(entries.length).toBe(1)
    expect(entries[0].sheetYear).toBe(2025)
  })

  it('preserves materia/criterio as arrays, filtering blanks', () => {
    const buf = makeBuffer({
      '2026': [
        mkRow({
          materia1: 'Contratos',
          materia2: 'Obras Públicas',
          materia3: '',
          criterio1: 'CT 1/2015',
          criterio2: '',
        }),
      ],
    })
    const e = parseCtbgWorkbook(buf)[0]
    expect(e.materia).toEqual(['Contratos', 'Obras Públicas'])
    expect(e.criterio).toEqual(['CT 1/2015'])
  })
})

describe('ctbg — filterEntries', () => {
  const entries: CtbgEntry[] = [
    {
      sheetYear: 2026,
      resolucion: 'R CTBG 0100/2026',
      anoEntrada: 2025,
      mesEntrada: null,
      mesResolucion: null,
      motivo: 'acceso a contratos',
      asunto: 'Ayuntamiento de Riba-roja de Túria · contratos de limpieza',
      materia: ['Contratación'],
      sentido: 'Estimatoria',
      criterio: [],
      palabrasClave: 'contratos, limpieza',
      organismo: 'AGE',
    },
    {
      sheetYear: 2026,
      resolucion: 'R CTBG 0101/2026',
      anoEntrada: 2025,
      mesEntrada: null,
      mesResolucion: null,
      motivo: 'silencio',
      asunto: 'Ministerio de Hacienda · PGE 2026',
      materia: ['Presupuesto'],
      sentido: 'Desestimatoria',
      criterio: [],
      palabrasClave: 'PGE',
      organismo: 'Ministerio de Hacienda',
    },
  ]

  it('matches accent-insensitive substrings across any column', () => {
    expect(filterEntries(entries, 'Riba-roja').length).toBe(1)
    expect(filterEntries(entries, 'riba roja').length).toBe(1)
    expect(filterEntries(entries, 'Túria').length).toBe(1)
    expect(filterEntries(entries, 'turia').length).toBe(1)
  })

  it('returns empty array for non-matching query', () => {
    expect(filterEntries(entries, 'Xanadú').length).toBe(0)
  })

  it('returns empty for a blank query (no false positives)', () => {
    expect(filterEntries(entries, '').length).toBe(0)
    expect(filterEntries(entries, '   ').length).toBe(0)
  })
})

describe('ctbg — buildSnapshot', () => {
  it('wraps matched entries + stats into a JSON-ready payload', () => {
    const buf = makeBuffer({
      '2026': [
        mkRow({
          resolucion: 'R CTBG 0100/2026',
          asunto: 'Ayuntamiento de Riba-roja de Túria · contratos',
          sentido: 'Estimatoria',
        }),
        mkRow({ resolucion: 'R CTBG 0101/2026', sentido: 'Desestimatoria' }),
      ],
      '2025': [
        mkRow({
          resolucion: 'R CTBG 0050/2025',
          asunto: 'Asunto sobre ribarroja de turia 2025',
          sentido: 'Estimatoria',
        }),
      ],
    })
    const all = parseCtbgWorkbook(buf)
    const snap = buildSnapshot(all, ['Riba-roja', 'Ribarroja'], new Date('2026-04-20T00:00:00Z'))
    expect(snap.stats.totalEntries).toBe(3)
    expect(snap.stats.matchedEntries).toBe(2)
    expect(snap.stats.years.sort()).toEqual([2025, 2026])
    expect(snap.stats.bySentido.Estimatoria).toBe(2)
    expect(snap.matched.length).toBe(2)
    expect(snap.query).toBe('Riba-roja | Ribarroja')
    expect(snap.generatedAt).toBe('2026-04-20T00:00:00.000Z')
    expect(snap.source.url).toMatch(/consejodetransparencia\.es/)
  })

  it('honestly reports zero matches when the registry has none', () => {
    const buf = makeBuffer({
      '2026': [mkRow({ resolucion: 'R CTBG 0001/2026', asunto: 'Otra cosa' })],
    })
    const snap = buildSnapshot(parseCtbgWorkbook(buf), 'Riba-roja')
    expect(snap.stats.totalEntries).toBe(1)
    expect(snap.stats.matchedEntries).toBe(0)
    expect(snap.matched).toEqual([])
  })
})
