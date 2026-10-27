/**
 * Parse SEPE's monthly per-municipality Excel for "paro registrado"
 * (registered unemployment). The workbook has separate sheets per sex:
 *   - "AMBOS SEXOS PARO"  (total)
 *   - "HOMBRES PARO"
 *   - "MUJERES PARO"
 *
 * Each sheet contains every muni in the CCAA stacked vertically. We
 * locate the row containing "Municipio: <NAME>" (case-insensitive,
 * accent-insensitive) and then scan down to the TOTAL row; the last
 * cell of that row is the grand total for the municipality.
 */
import * as XLSX from 'xlsx'

export interface ParoSnapshot {
  municipio: string
  period: string // YYYY-MM
  total: number
  men: number
  women: number
  source: 'SEPE Muniacteco 20-45'
}

interface ParseOpts {
  municipio: string
  period: string // YYYY-MM
}

function strip(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function readSheet(buf: Buffer | ArrayBuffer, name: string): unknown[][] | null {
  const wb = XLSX.read(buf, { type: 'buffer' })
  const sheet = wb.Sheets[name]
  if (!sheet) return null
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true })
}

function munoTotal(rows: unknown[][], muniKey: string): number | null {
  const target = strip(muniKey)
  let hit = -1
  for (let i = 0; i < rows.length; i++) {
    const cell = String(rows[i]?.[1] ?? '')
    if (strip(cell).includes(`MUNICIPIO: ${target}`)) {
      hit = i
      break
    }
  }
  if (hit < 0) return null
  // Scan down a reasonable window for the TOTAL row.
  for (let i = hit; i < Math.min(hit + 30, rows.length); i++) {
    const row = rows[i]
    if (!row) continue
    const label = String(row[1] ?? '')
      .trim()
      .toUpperCase()
    if (label !== 'TOTAL') continue
    // Last non-empty cell is the grand total.
    for (let j = row.length - 1; j >= 0; j--) {
      const v = row[j]
      if (v === null || v === undefined || v === '') continue
      if (typeof v === 'number') return v
      const str = String(v).replace(/[.,\s"']/g, '')
      const n = parseInt(str, 10)
      if (Number.isFinite(n)) return n
    }
  }
  return null
}

export function parseSepeParoMonth(
  buf: Buffer | ArrayBuffer,
  opts: ParseOpts,
): ParoSnapshot | null {
  const totalSheet = readSheet(buf, 'AMBOS SEXOS PARO')
  const menSheet = readSheet(buf, 'HOMBRES PARO')
  const womenSheet = readSheet(buf, 'MUJERES PARO')
  if (!totalSheet || !menSheet || !womenSheet) return null

  const total = munoTotal(totalSheet, opts.municipio)
  const men = munoTotal(menSheet, opts.municipio)
  const women = munoTotal(womenSheet, opts.municipio)
  if (total === null || men === null || women === null) return null

  return {
    municipio: opts.municipio,
    period: opts.period,
    total,
    men,
    women,
    source: 'SEPE Muniacteco 20-45',
  }
}

/** Lo que dio una pasada con un mes. Sólo `leido` trae fila; los otros tres dicen por qué no. */
export type MesParo =
  /** SEPE sirvió el libro del mes y la fila de Riba-roja estaba en él. */
  | { period: string; estado: 'leido'; snap: ParoSnapshot }
  /** SEPE contestó sin libro: 404/410, o un 200 que no es un XLS. Lo normal del mes más nuevo. */
  | { period: string; estado: 'ausente'; motivo: string }
  /** El libro llegó entero y el parser no sacó la fila, o reventó: un fallo de lectura, no de SEPE. */
  | { period: string; estado: 'ilegible'; motivo: string }
  /** Ninguna respuesta completa tras todos los intentos: conexión, cuerpo o un error HTTP del servidor. */
  | { period: string; estado: 'sin-respuesta'; motivo: string }

export type MesSinLeer = Exclude<MesParo, { estado: 'leido' }>

export interface ParoStats {
  /** Meses que recorrió la pasada; las tres cuentas de abajo suman esto. */
  mesesRecorridos: number
  /** Meses leídos en esta pasada. */
  leidos: number
  /** Meses que esta pasada no leyó y que conservan la fila del fichero anterior. */
  arrastrados: MesSinLeer[]
  /** Meses sin fila: no se leyeron ahora y el fichero anterior tampoco los tenía. */
  fueraDeLaSerie: MesSinLeer[]
}

/**
 * Compone la serie publicable de una pasada sobre la del fichero anterior.
 *
 * Una fila sólo entra, cambia o sale por una LECTURA nueva. Un mes que la
 * pasada no leyó —sin respuesta, ilegible o hasta con un 404— conserva la fila
 * que ya estaba publicada: el SEPE no retira un mes que ya sirvió, así que un
 * 404 donde ayer había libro es antes un tropiezo del servidor que un dato, y
 * la fila caduca sola cuando el mes sale de la ventana (los meses previos que
 * la pasada no recorrió no se miran). Lo que se conserva no se disimula:
 * `stats.arrastrados` nombra cada mes y su motivo. Así un fallo de red no
 * puede encoger la serie ni hacer retroceder `latestPeriod` (el 2026-10-27
 * lo hizo; la cabecera de paro-fetch.ts lo cuenta).
 */
export function componerSerieParo(
  meses: readonly MesParo[],
  previo: readonly ParoSnapshot[] | null,
): { series: ParoSnapshot[]; stats: ParoStats } {
  const anterior = new Map((previo ?? []).map((r) => [r.period, r]))
  const series: ParoSnapshot[] = []
  const arrastrados: MesSinLeer[] = []
  const fueraDeLaSerie: MesSinLeer[] = []
  let leidos = 0
  for (const m of meses) {
    if (m.estado === 'leido') {
      series.push(m.snap)
      leidos += 1
      continue
    }
    const sinLeer: MesSinLeer = { period: m.period, estado: m.estado, motivo: m.motivo }
    const fila = anterior.get(m.period)
    if (fila) {
      series.push(fila)
      arrastrados.push(sinLeer)
    } else {
      fueraDeLaSerie.push(sinLeer)
    }
  }
  const porPeriodo = (a: { period: string }, b: { period: string }) =>
    a.period.localeCompare(b.period)
  series.sort(porPeriodo)
  arrastrados.sort(porPeriodo)
  fueraDeLaSerie.sort(porPeriodo)
  return {
    series,
    stats: { mesesRecorridos: meses.length, leidos, arrastrados, fueraDeLaSerie },
  }
}
