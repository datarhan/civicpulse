import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  buildSnapshot,
  CONSELL_HEADERS_FOR_TEST,
  filterEntries,
  parseConsellTable,
  type ConsellEntry,
} from '../src/scraper/consell-cv'

function makeBuffer(rows: (string | number | null)[][]): Buffer {
  const wb = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([CONSELL_HEADERS_FOR_TEST as unknown as string[], ...rows])
  XLSX.utils.book_append_sheet(wb, sheet, 'Sheet1')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

function mkRow(
  o: Partial<{
    numero: string
    fecha: string | number
    expediente: string
    administracion: string
    motivo: string
    materia: string
    sentido: string
  }> = {},
): (string | number | null)[] {
  return [
    o.numero ?? '1/2026',
    o.fecha ?? '1/14/26',
    o.expediente ?? 'GESOC/RE/2025/10',
    o.administracion ?? 'Ayuntamiento de Santa Pola',
    o.motivo ?? 'Falta de respuesta',
    o.materia ?? 'Información Municipal',
    o.sentido ?? 'Estimatoria',
  ]
}

describe('consell-cv — parseConsellTable', () => {
  it('parses the canonical 7-column table', () => {
    const buf = makeBuffer([
      mkRow({ numero: '1/2026' }),
      mkRow({ numero: '2/2026', administracion: 'Ayuntamiento de Dénia' }),
    ])
    const entries = parseConsellTable(buf, 2026)
    expect(entries.length).toBe(2)
    expect(entries[0].numero).toBe('1/2026')
    expect(entries[0].administracion).toBe('Ayuntamiento de Santa Pola')
    expect(entries[1].administracion).toBe('Ayuntamiento de Dénia')
  })

  it('skips rows with no numero', () => {
    const buf = makeBuffer([mkRow({ numero: '1/2026' }), mkRow({ numero: '' })])
    expect(parseConsellTable(buf, 2026).length).toBe(1)
  })

  it('returns empty when the header row is missing', () => {
    const wb = XLSX.utils.book_new()
    const sheet = XLSX.utils.aoa_to_sheet([['wrong', 'columns']])
    XLSX.utils.book_append_sheet(wb, sheet, 'Sheet1')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    expect(parseConsellTable(buf, 2026).length).toBe(0)
  })

  it('normalises fecha from US-style M/D/YY → ISO (e.g. 1/14/26)', () => {
    const buf = makeBuffer([mkRow({ fecha: '3/14/26' })])
    const e = parseConsellTable(buf, 2026)[0]
    expect(e.fecha).toBe('2026-03-14')
  })

  it('normalises fecha from European DD/MM/YY → ISO (e.g. 29/10/25)', () => {
    const buf = makeBuffer([mkRow({ fecha: '29/10/25' })])
    const e = parseConsellTable(buf, 2025)[0]
    expect(e.fecha).toBe('2025-10-29')
  })

  it('defaults ambiguous D/M/YY to DD/MM (Spanish convention)', () => {
    const buf = makeBuffer([mkRow({ fecha: '3/10/26' })])
    // 3 ≤ 12 and 10 ≤ 12 → ambiguous → DD/MM → 2026-10-03
    const e = parseConsellTable(buf, 2026)[0]
    expect(e.fecha).toBe('2026-10-03')
  })

  it('normalises fecha from DD.MM.YYYY → ISO', () => {
    const buf = makeBuffer([mkRow({ fecha: '06.03.2026' })])
    const e = parseConsellTable(buf, 2026)[0]
    expect(e.fecha).toBe('2026-03-06')
  })

  it('skips a title row + finds headers on row 1 (2025 ODS layout)', () => {
    const wb = XLSX.utils.book_new()
    const sheet = XLSX.utils.aoa_to_sheet([
      ['RESOLUCIONES 2025', null, null, null, null, null, null, null],
      [
        'N.º RESOLUCIÓN',
        'FECHA',
        'EXPEDIENTE',
        'ADMINISTRACIÓN\nRECLAMADA',
        'RESUMEN',
        'MATERIA',
        'SENTIDO',
        '',
      ],
      [
        '1/2025',
        '14/01/25',
        'GESOC/RE/2024/99',
        'Ayuntamiento de Riba-roja de Túria',
        'Falta de respuesta',
        'Información',
        'Estimatoria',
        '',
      ],
    ])
    XLSX.utils.book_append_sheet(wb, sheet, 'Hoja1')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    const entries = parseConsellTable(buf, 2025)
    expect(entries.length).toBe(1)
    expect(entries[0].administracion).toBe('Ayuntamiento de Riba-roja de Túria')
    expect(entries[0].fecha).toBe('2025-01-14')
  })

  it('skips rows whose first column is non-numeric (e.g. "Total")', () => {
    const buf = makeBuffer([mkRow({ numero: '1/2026' }), mkRow({ numero: 'Total' })])
    expect(parseConsellTable(buf, 2026).length).toBe(1)
  })

  it('leaves unparseable fecha as-is (data preservation)', () => {
    const buf = makeBuffer([mkRow({ fecha: 'indeterminada' })])
    const e = parseConsellTable(buf, 2026)[0]
    expect(e.fecha).toBe('indeterminada')
  })

  it('tags every entry with the provided year', () => {
    const buf = makeBuffer([mkRow({ numero: '5/2024' })])
    expect(parseConsellTable(buf, 2024)[0].year).toBe(2024)
  })
})

describe('consell-cv — filterEntries', () => {
  const entries: ConsellEntry[] = [
    {
      year: 2026,
      numero: '1/2026',
      fecha: '2026-01-14',
      expediente: 'GESOC/RE/2025/10',
      administracion: 'Ayuntamiento de Riba-roja de Túria',
      motivo: 'Falta de respuesta',
      materia: 'Información Municipal',
      sentido: 'Estimatoria',
    },
    {
      year: 2026,
      numero: '2/2026',
      fecha: '2026-01-14',
      expediente: 'GESOC/DP/2025/12',
      administracion: 'Ayuntamiento de Dénia',
      motivo: 'Publicidad Activa',
      materia: 'Publicidad Activa',
      sentido: 'Desestimatoria',
    },
    {
      year: 2025,
      numero: '50/2025',
      fecha: '2025-06-01',
      expediente: 'GESOC/RE/2025/5',
      administracion: 'Ayuntamiento de Ribarroja del Turia',
      motivo: 'Silencio',
      materia: 'Contratación',
      sentido: 'Estimatoria',
    },
  ]

  it('matches both Catalán and Castilian orthography', () => {
    const m = filterEntries(entries, ['Riba-roja de Túria', 'Ribarroja del Turia'])
    expect(m.length).toBe(2)
    expect(m.map((e) => e.numero).sort()).toEqual(['1/2026', '50/2025'])
  })

  it('returns empty for non-matching query', () => {
    expect(filterEntries(entries, 'Valencia').length).toBe(0)
  })

  it('only matches the ADMINISTRACIÓN field — motivo/materia mentions are ignored', () => {
    const e2 = [
      ...entries,
      {
        year: 2026,
        numero: '99/2026',
        fecha: '2026-01-01',
        expediente: 'X',
        administracion: 'Conselleria de Educación',
        motivo: 'Info sobre Riba-roja de Túria',
        materia: '',
        sentido: 'Estimatoria',
      },
    ]
    const m = filterEntries(e2, ['Riba-roja de Túria'])
    expect(m.every((e) => !e.administracion.startsWith('Conselleria'))).toBe(true)
  })

  it('returns empty for a blank query (no false positives)', () => {
    expect(filterEntries(entries, '').length).toBe(0)
    expect(filterEntries(entries, ['']).length).toBe(0)
  })
})

describe('consell-cv — buildSnapshot', () => {
  it('aggregates matched entries with bySentido + byMateria', () => {
    const buf = makeBuffer([
      mkRow({
        numero: '1/2026',
        administracion: 'Ayuntamiento de Riba-roja de Túria',
        sentido: 'Estimatoria',
      }),
      mkRow({
        numero: '2/2026',
        administracion: 'Ayuntamiento de Dénia',
        sentido: 'Desestimatoria',
      }),
      mkRow({
        numero: '3/2026',
        administracion: 'Ayuntamiento de Ribarroja del Turia',
        sentido: 'Estimatoria',
        materia: 'Contratación',
      }),
    ])
    const entries = parseConsellTable(buf, 2026)
    const snap = buildSnapshot(
      entries,
      ['Riba-roja de Túria', 'Ribarroja del Turia'],
      [{ year: 2026, url: 'x' }],
      new Date('2026-04-20T00:00:00Z'),
    )
    expect(snap.stats.totalEntries).toBe(3)
    expect(snap.stats.matchedEntries).toBe(2)
    expect(snap.stats.bySentido.Estimatoria).toBe(2)
    expect(snap.stats.byMateria['Información Municipal']).toBe(1)
    expect(snap.stats.byMateria['Contratación']).toBe(1)
    expect(snap.matched.length).toBe(2)
    expect(snap.query).toBe('Riba-roja de Túria | Ribarroja del Turia')
    expect(snap.source.portal).toBe('https://conselltransparencia.gva.es')
  })

  it('reports zero matches honestly when the muni has none', () => {
    const buf = makeBuffer([mkRow({ administracion: 'Ayuntamiento de Otra Ciudad' })])
    const snap = buildSnapshot(parseConsellTable(buf, 2026), 'Riba-roja de Túria')
    expect(snap.stats.totalEntries).toBe(1)
    expect(snap.stats.matchedEntries).toBe(0)
    expect(snap.matched).toEqual([])
  })
})
