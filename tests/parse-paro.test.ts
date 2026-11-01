import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as XLSX from 'xlsx'
import { parseSepeParoMonth } from '../src/scraper/paro'

/**
 * La descarga real del SEPE que entró en ba92e28c (sha256 8c1cc7b41ca31ec5…3116b6d),
 * con unas iniciales vaciadas en su registro WRITEACCESS —quien la guardó con
 * Excel— por `npm run fixture:sin-autoria`: cuatro bytes, las hojas intactas.
 */
const FIXTURE = join(__dirname, 'fixtures', 'sepe_CV_enero_2026.xls')

describe('scraper/paro — parseSepeParoMonth', () => {
  let snapshot: ReturnType<typeof parseSepeParoMonth>

  beforeAll(() => {
    const buf = readFileSync(FIXTURE)
    snapshot = parseSepeParoMonth(buf, { municipio: 'Riba-roja de Túria', period: '2026-01' })
  })

  it('returns a non-null snapshot for Riba-roja', () => {
    expect(snapshot).not.toBeNull()
    expect(snapshot!.period).toBe('2026-01')
  })

  it('extracts total + men + women unemployment for that month', () => {
    expect(snapshot!.total).toBeGreaterThan(500)
    expect(snapshot!.total).toBeLessThan(5000)
    expect(snapshot!.men).toBeGreaterThan(100)
    expect(snapshot!.women).toBeGreaterThan(100)
  })

  it('men + women approximately equals total (within ±5 for rounding)', () => {
    const diff = Math.abs(snapshot!.men + snapshot!.women - snapshot!.total)
    expect(diff).toBeLessThanOrEqual(5)
  })

  it('returns null when the municipality is not present', () => {
    const buf = readFileSync(FIXTURE)
    const missing = parseSepeParoMonth(buf, {
      municipio: 'Municipio Inventado',
      period: '2026-01',
    })
    expect(missing).toBeNull()
  })
})

/**
 * La descarga real del SEPE de mayo de 2026 (sha256 dfcf48bf3406c808…a0d75), con
 * su WRITEACCESS y su LastAuthor vaciados por `npm run fixture:sin-autoria`: 28
 * bytes, las hojas intactas. Riba-roja está en B717 en todas las descargas de
 * 2026; lo que cambió en mayo y junio es el rango que declara cada hoja, que
 * empieza en B1 y no en A1 porque la columna A está vacía. `sheet_to_json`
 * numera las columnas desde el inicio del rango, así que «Municipio: …», los
 * tramos de edad y «TOTAL» llegan en la columna 0 y no en la 1, y la serie
 * publicada saltaba de 2026-04 a 2026-07. En julio el rango volvió a A1. Las
 * cifras son las de la hoja, leídas a mano.
 */
const FIXTURE_MAYO = join(__dirname, 'fixtures', 'sepe_CV_mayo_2026.xls')

describe('scraper/paro — parseSepeParoMonth, mayo de 2026 (rango declarado desde B1)', () => {
  const PARO = ['AMBOS SEXOS PARO', 'HOMBRES PARO', 'MUJERES PARO']

  it('lee el TOTAL de Riba-roja de cada hoja', () => {
    const s = parseSepeParoMonth(readFileSync(FIXTURE_MAYO), {
      municipio: 'Riba-roja de Túria',
      period: '2026-05',
    })
    expect(s).toEqual({
      municipio: 'Riba-roja de Túria',
      period: '2026-05',
      total: 1129,
      men: 418,
      women: 711,
      source: 'SEPE Muniacteco 20-45',
    })
  })

  /** La descarga de mayo, sólo con las hojas de paro y la etiqueta TOTAL de Riba-roja cambiada. */
  const sinTotalPropio = (etiqueta: string) => {
    const orig = XLSX.read(readFileSync(FIXTURE_MAYO), { type: 'buffer' })
    const wb = XLSX.utils.book_new()
    for (const name of PARO) {
      const sheet = orig.Sheets[name]
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null })
      const muni = rows.findIndex((r) => String(r?.[0] ?? '').includes('RIBA-ROJA'))
      const total = rows.findIndex((r, i) => i > muni && r?.[0] === 'TOTAL')
      // Las filas de `rows` cuentan desde el inicio del rango (B1), la celda no.
      const { s } = XLSX.utils.decode_range(sheet['!ref']!)
      sheet[XLSX.utils.encode_cell({ r: s.r + total, c: s.c })] = { t: 's', v: etiqueta }
      XLSX.utils.book_append_sheet(wb, sheet, name)
    }
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  }

  it('control: con la etiqueta intacta, la copia recortada lee lo mismo que la descarga', () => {
    // Sin este lado, una copia que el analizador no supiera leer daría el
    // null que espera la prueba de abajo.
    const s = parseSepeParoMonth(sinTotalPropio('TOTAL'), {
      municipio: 'Riba-roja de Túria',
      period: '2026-05',
    })
    expect(s?.total).toBe(1129)
  })

  it('sin TOTAL propio devuelve null, y no el TOTAL del municipio siguiente', () => {
    // El bloque de Riba-roja ocupa 14 filas y lo sigue el de Sueca: una
    // ventana de búsqueda que no se para en el «Municipio:» siguiente leería
    // el paro de Sueca como el de Riba-roja.
    const s = parseSepeParoMonth(sinTotalPropio('TOTAL GENERAL'), {
      municipio: 'Riba-roja de Túria',
      period: '2026-05',
    })
    expect(s).toBeNull()
  })
})
