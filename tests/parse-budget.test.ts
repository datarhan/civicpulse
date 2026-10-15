import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as XLSX from 'xlsx'
import { importe, parseConprelBudget, parseConprelRoster } from '../src/scraper/budget'

/**
 * La descarga real de CONPREL (BIFF8, CODEPAGE 1200) que entró en a0fdf62f
 * (sha256 729e3a7f4bba7f0f…0acda514), sin los nombres de personas del
 * ministerio que traían sus metadatos: el `LastAuthor` de SummaryInformation y
 * el registro WRITEACCESS del libro, con el resto de un tercero en su relleno
 * (`Props` de SheetJS no enseña WRITEACCESS; `strings` sí). Borrados en su
 * sitio, sin volver a guardar: `LastAuthor` conserva su `Size` y sus caracteres
 * pasan a NUL, como la `Company` vacía de este mismo fichero; WRITEACCESS
 * conserva `cch` y sus 112 bytes, y nombre y relleno pasan a espacios. El
 * `Author`, institucional, se queda. Difieren 48 bytes; las 21 hojas, byte a
 * byte.
 */
const FIXTURE = join(__dirname, 'fixtures', 'conprel_CV_2024.xls')

describe('scraper/budget — parseConprelBudget', () => {
  let budget: ReturnType<typeof parseConprelBudget>

  beforeAll(() => {
    const buf = readFileSync(FIXTURE)
    budget = parseConprelBudget(buf, { ineCode: '46214', year: 2024 })
  })

  it('finds Riba-roja de Túria by INE code 46214', () => {
    expect(budget).not.toBeNull()
    expect(budget!.ineCode).toBe('46214')
    expect(budget!.name).toMatch(/Riba-roja de T[uú]ria/i)
    expect(budget!.year).toBe(2024)
  })

  it('has 9 revenue chapters (economic classification)', () => {
    expect(budget!.revenueByEconomicChapter).toHaveLength(9)
    for (const c of budget!.revenueByEconomicChapter) {
      expect(c.code).toMatch(/^[1-9]$/)
      expect(typeof c.label).toBe('string')
      expect(c.label.length).toBeGreaterThan(3)
      expect(c.amount).toBeGreaterThanOrEqual(0)
    }
  })

  it('has 9 expense chapters (economic classification)', () => {
    expect(budget!.expenseByEconomicChapter).toHaveLength(9)
    for (const c of budget!.expenseByEconomicChapter) {
      expect(c.code).toMatch(/^[1-9]$/)
      expect(c.amount).toBeGreaterThanOrEqual(0)
    }
  })

  it('has 6 expense groups by program', () => {
    expect(budget!.expenseByProgram).toHaveLength(6)
    for (const g of budget!.expenseByProgram) {
      expect(g.label.length).toBeGreaterThan(3)
      expect(g.amount).toBeGreaterThanOrEqual(0)
    }
  })

  it('revenue chapters sum to totalRevenue (±1€)', () => {
    const sum = budget!.revenueByEconomicChapter.reduce((a, c) => a + c.amount, 0)
    expect(Math.abs(sum - budget!.totalRevenue)).toBeLessThanOrEqual(1)
  })

  it('expense economic chapters sum to totalExpense (±1€)', () => {
    const sum = budget!.expenseByEconomicChapter.reduce((a, c) => a + c.amount, 0)
    expect(Math.abs(sum - budget!.totalExpense)).toBeLessThanOrEqual(1)
  })

  it('expense program groups sum to totalExpense (±1€)', () => {
    const sum = budget!.expenseByProgram.reduce((a, g) => a + g.amount, 0)
    expect(Math.abs(sum - budget!.totalExpense)).toBeLessThanOrEqual(1)
  })

  it('reports the 2024 total budget around €39.5M (balanced)', () => {
    expect(budget!.totalRevenue).toBeGreaterThan(35_000_000)
    expect(budget!.totalRevenue).toBeLessThan(50_000_000)
    // Municipal budgets are balanced: revenue ≈ expense
    const balance = budget!.totalRevenue - budget!.totalExpense
    expect(Math.abs(balance)).toBeLessThan(10_000) // <€10k drift
  })

  it('Cap.1 "Gastos de personal" is the largest expense chapter', () => {
    const byAmount = [...budget!.expenseByEconomicChapter].sort((a, b) => b.amount - a.amount)
    expect(byAmount[0].code).toBe('1')
    expect(byAmount[0].label).toMatch(/personal/i)
  })

  it('returns null when INE code is not present', () => {
    const buf = readFileSync(FIXTURE)
    const missing = parseConprelBudget(buf, { ineCode: '00001', year: 2024 })
    expect(missing).toBeNull()
  })
})

// The peer-set sizing dependency for /eficiencia: CESEL carries no population,
// so «municipios de tamaño parecido» has to come from somewhere. It comes from
// the rows parseConprelBudget already walks — column 4 is `Pobla` — so this is
// a second reader over the same sheet, not a second download.
describe('scraper/budget — parseConprelRoster', () => {
  let roster: ReturnType<typeof parseConprelRoster>

  beforeAll(() => {
    roster = parseConprelRoster(readFileSync(FIXTURE))
  })

  it('returns every CV municipality with a positive population', () => {
    expect(roster.length).toBeGreaterThan(400)
    for (const m of roster) {
      expect(m.ine).toMatch(/^\d{5}$/)
      expect(m.nombre.length).toBeGreaterThan(1)
      expect(m.poblacion).toBeGreaterThan(0)
    }
  })

  it('agrees with parseConprelBudget on Riba-roja, so the two readers cannot drift', () => {
    const rr = roster.find((m) => m.ine === '46214')
    const budget = parseConprelBudget(readFileSync(FIXTURE), { ineCode: '46214', year: 2024 })
    expect(rr).toBeDefined()
    expect(rr!.poblacion).toBe(budget!.population)
    expect(rr!.nombre).toBe(budget!.name)
  })

  it('carries the totals each municipality declares, for the per-capita comparison', () => {
    const rr = roster.find((m) => m.ine === '46214')!
    const budget = parseConprelBudget(readFileSync(FIXTURE), { ineCode: '46214', year: 2024 })!
    expect(rr.gastoTotal).toBe(budget.totalExpense)
    expect(rr.ingresoTotal).toBe(budget.totalRevenue)
    // Casi todos declaran gasto; exigirlo de todos rompería con un municipio
    // que no remitió, que es un dato en sí mismo y no un fallo de lectura.
    expect(roster.filter((m) => m.gastoTotal > 0).length / roster.length).toBeGreaterThan(0.9)
  })

  it('has no duplicate INE codes', () => {
    expect(new Set(roster.map((m) => m.ine)).size).toBe(roster.length)
  })

  it('covers the three CV provinces, not just Valencia', () => {
    const provincias = new Set(roster.map((m) => m.ine.slice(0, 2)))
    expect(provincias).toContain('46') // Valencia
    expect(provincias).toContain('03') // Alicante
    expect(provincias).toContain('12') // Castellón
  })

  it('yields a peer band big enough for the n>=15 floor to survive filtering', () => {
    const band = roster.filter((m) => m.poblacion >= 15_000 && m.poblacion <= 40_000)
    // cv-15k-40k is the committed conjunto; if the source ever shrinks below
    // this the peer comparison silently stops rendering, so pin it here.
    expect(band.length).toBeGreaterThanOrEqual(40)
    expect(band.some((m) => m.ine === '46214')).toBe(true)
  })

  it('returns an empty roster for a sheet that is not there, rather than throwing', () => {
    expect(parseConprelRoster(readFileSync(FIXTURE), { sheetName: 'No existe' })).toEqual([])
  })
})

/**
 * Una celda vacía no es 0 € (CLAUDE.md, regla 3: «a sentinel is never a value»).
 *
 * `num()` devolvía 0 para una celda en blanco, una cadena ilegible o un tipo
 * que no era número ni texto, y el 0 se publicaba como importe: «capítulo
 * aprobado a 0 €» de un capítulo que la fuente no trae. En la descarga real
 * eso no pasa por casualidad —un capítulo de verdad a cero viene como `0`
 * numérico (enajenación de inversiones, en la fila de Riba-roja) y ninguna fila
 * de datos tiene un importe en blanco—, así que el blanco sólo puede querer
 * decir «no consta», y la prueba lo provoca sobre ESA descarga: se vacían tres
 * celdas de la fila 46214 en memoria y se vuelve a leer. Ni el fichero se toca
 * ni la forma se inventa.
 */
describe('scraper/budget — una celda sin dato no se publica como 0 €', () => {
  /** La fila de Riba-roja en la hoja, como índice de fila de la hoja. */
  const filaDe = (sheet: XLSX.WorkSheet, ine: string): number => {
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: null,
    })
    const i = rows.findIndex(
      (r) =>
        String(r?.[0] ?? '').padStart(2, '0') === ine.slice(0, 2) &&
        String(r?.[1] ?? '').padStart(3, '0') === ine.slice(2),
    )
    if (i < 0) throw new Error(`la fila ${ine} no está en la hoja`)
    // `sheet_to_json` empieza en la primera fila del rango, no en la A1.
    return i + XLSX.utils.decode_range(sheet['!ref']!).s.r
  }

  /** La descarga real con tres celdas de Riba-roja vaciadas de tres maneras. */
  const conHuecos = () => {
    const wb = XLSX.read(readFileSync(FIXTURE), { type: 'buffer' })
    const sheet = wb.Sheets['Comunitat Valenciana']
    const r = filaDe(sheet, '46214')
    const celda = (c: number) => XLSX.utils.encode_cell({ r, c })
    // Ingresos, capítulo 3 (columna 8): la celda no existe.
    delete sheet[celda(8)]
    // Gastos, capítulo 4 (columna 19): un texto que no es un importe.
    sheet[celda(19)] = { t: 's', v: 'n.d.' }
    // Total gastos (columna 25): una cadena vacía.
    sheet[celda(25)] = { t: 's', v: '' }
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  }

  it('control: la descarga intacta no tiene ninguna celda sin dato, y su 0 real sigue siendo 0', () => {
    // Sin este lado, una lectura que devolviera null en TODO pasaría la
    // prueba de abajo. Y el 0 de enajenación es un dato: no puede caer en
    // `sinDato` por parecerse a un hueco.
    const b = parseConprelBudget(readFileSync(FIXTURE), { ineCode: '46214', year: 2024 })!
    expect(b.sinDato).toEqual([])
    const enajenacion = b.revenueByEconomicChapter.find((c) => c.code === '6')!
    expect(enajenacion.amount).toBe(0)
    expect(b.totalExpense).toBeGreaterThan(0)
    expect(b.balance).not.toBeNull()
  })

  it('el capítulo vacío o ilegible es null, no 0', () => {
    const b = parseConprelBudget(conHuecos(), { ineCode: '46214', year: 2024 })!
    expect(b.revenueByEconomicChapter.find((c) => c.code === '3')!.amount).toBeNull()
    expect(b.expenseByEconomicChapter.find((c) => c.code === '4')!.amount).toBeNull()
    // Los vecinos siguen leyéndose: el hueco es de una celda, no de la fila.
    expect(b.revenueByEconomicChapter.find((c) => c.code === '1')!.amount).toBeGreaterThan(0)
    expect(b.expenseByEconomicChapter.find((c) => c.code === '1')!.amount).toBeGreaterThan(0)
  })

  it('el total que la fuente no trae es null: ni 0 ni rehecho sumando capítulos', () => {
    // Rehacerlo con los capítulos sería publicar como cifra del ministerio una
    // suma nuestra; dejarlo en 0 es afirmar un presupuesto de cero euros.
    const b = parseConprelBudget(conHuecos(), { ineCode: '46214', year: 2024 })!
    expect(b.totalExpense).toBeNull()
    expect(b.totalRevenue).toBeGreaterThan(35_000_000)
    // Un saldo con un lado ausente no es «ingresos − 0».
    expect(b.balance).toBeNull()
  })

  it('el snapshot dice qué no pudo leer, celda a celda', () => {
    const b = parseConprelBudget(conHuecos(), { ineCode: '46214', year: 2024 })!
    expect(b.sinDato.map((x) => x.campo).sort()).toEqual(
      ['expenseByEconomicChapter.4', 'revenueByEconomicChapter.3', 'totalExpense'].sort(),
    )
    for (const x of b.sinDato) expect(x.etiqueta.length).toBeGreaterThan(3)
  })

  it('el padrón de municipios tampoco convierte el total ausente en 0', () => {
    const rr = parseConprelRoster(conHuecos()).find((m) => m.ine === '46214')!
    expect(rr.gastoTotal).toBeNull()
    expect(rr.ingresoTotal).toBeGreaterThan(0)
  })
})

describe('scraper/budget — importe(), la lectura de una celda', () => {
  it('lee números y el formato español de miles y decimales', () => {
    expect(importe(1234.5)).toBe(1234.5)
    expect(importe(0)).toBe(0)
    expect(importe('0')).toBe(0)
    expect(importe('1.234,56')).toBe(1234.56)
    expect(importe(' 39.504.768,48 ')).toBe(39504768.48)
    expect(importe('-1.000')).toBe(-1000)
  })

  it('devuelve null para lo que no es un importe, nunca 0', () => {
    for (const v of [null, undefined, '', '   ', 'n.d.', '-', '12abc', NaN, Infinity, true, {}]) {
      expect(importe(v), JSON.stringify(v)).toBeNull()
    }
  })
})
