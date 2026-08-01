import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseConsellTable } from '../src/scraper/consell-cv'

/**
 * Regression contract for a day/month swap found on 2026-08-01.
 *
 * The GVA publishes the resolution date as a real Excel date cell. The parser
 * read the sheet with `raw:false`, so it received the workbook's *rendered*
 * text ("4/9/26") instead of the unambiguous serial, then guessed DD/MM
 * (Spanish convention) — turning resolución 99/2026 of 9 April 2026 into
 * "2026-09-04", a date that had not happened yet.
 *
 * These are accountability records naming a municipality, so the published
 * date has to be the source's date, not a plausible-looking guess.
 */

const HEADER = [
  'Nº',
  'Fecha',
  'Expediente',
  'Administración reclamada',
  'Motivo',
  'Materia',
  'Sentido',
]

/** Excel serial 46121 == 2026-04-09, rendered by the real workbook as "4/9/26". */
const SERIAL_2026_04_09 = 46121

function sheetWithDateCell(serial: number, numFmt: string): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    HEADER,
    [
      '99/2026',
      serial,
      'GESOC/RE/2026/186',
      'Ayuntamiento de Riba-roja de Túria',
      'Falta de respuesta',
      'Función Pública',
      'Inadmisión',
    ],
  ])
  // Mark B2 as a date-formatted number, exactly like the published table.
  ws['B2'] = { t: 'n', v: serial, z: numFmt }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Hoja1')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

describe('scraper/consell-cv — date cells', () => {
  it('reads a month-first formatted date cell as the real date, not a DD/MM guess', () => {
    const rows = parseConsellTable(sheetWithDateCell(SERIAL_2026_04_09, 'm/d/yy'), 2026)

    expect(rows).toHaveLength(1)
    expect(rows[0].fecha).toBe('2026-04-09')
  })

  it('reads a day-first formatted date cell identically — the serial is the truth', () => {
    // Same instant, different display format. The parsed value must not move.
    const rows = parseConsellTable(sheetWithDateCell(SERIAL_2026_04_09, 'dd/mm/yyyy'), 2026)

    expect(rows[0].fecha).toBe('2026-04-09')
  })

  it('never emits a resolution dated in the future', () => {
    const rows = parseConsellTable(sheetWithDateCell(SERIAL_2026_04_09, 'm/d/yy'), 2026)

    expect(rows[0].fecha <= '2026-08-01').toBe(true)
  })

  it('still parses plain text dates in DD/MM/YYYY form', () => {
    // Older tables ship dates as strings; that path must keep working.
    const ws = XLSX.utils.aoa_to_sheet([
      HEADER,
      [
        '1/2025',
        '14/01/2025',
        'GESOC/RE/2025/1',
        'Ayuntamiento de Riba-roja de Túria',
        'Falta de respuesta',
        'Función Pública',
        'Estimación',
      ],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Hoja1')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

    const rows = parseConsellTable(buf, 2025)

    expect(rows[0].fecha).toBe('2025-01-14')
  })
})
