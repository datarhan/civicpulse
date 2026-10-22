/**
 * Pure parser for Riba-roja's quarterly budget-EXECUTION listings (SICALWIN
 * "Estado de ejecución de Gastos/Ingresos" PDFs, pdf-parsed to text upstream).
 * No I/O. The listing ends each chapter with a `Total Capítulo N <LABEL>.<run>`
 * summary line and a `Total Gastos|Ingresos <run>` grand total; each `<run>` is
 * a concatenation of ES-formatted amounts whose COLUMN ORDER DIFFERS between
 * the two listings (see COLS below). We keep inicial/modificaciones/actual and
 * `ejecutado` = the executed metric (gastos: Obligaciones Reconocidas Netas;
 * ingresos: Derechos Reconocidos) — validated against each listing's trailing %.
 */
export type ExecKind = 'gastos' | 'ingresos'

export interface ExecLine {
  capitulo: number
  label: string
  inicial: number
  modificaciones: number
  actual: number
  ejecutado: number
}

export interface ExecDoc {
  kind: ExecKind
  year: number
  /**
   * «Fecha de listado igual a: …», tal cual. Es un PARÁMETRO del informe, no el
   * corte de los datos: la hoja del 2T de 2025, impresa el 30 de junio, dice
   * 31/12/2025. El corte es `fechaDeCorte`.
   */
  fechaListado: string | null
  /** La fecha de impresión de la cabecera («30 de Junio del 2025»), dd/mm/aaaa. */
  fechaImpresion: string | null
  chapters: ExecLine[]
  total: Omit<ExecLine, 'capitulo' | 'label'>
}

export function parseSpanishAmount(s: string): number {
  return Number(s.replace(/\./g, '').replace(',', '.'))
}

const round2 = (n: number) => Math.round(n * 100) / 100

// ES amounts, EXCLUDING trailing-% figures (percentages share the `,DD` shape).
const AMT = /-?\d{1,3}(?:\.\d{3})*,\d{2}(?!%)/g

function firstAmounts(run: string, n: number): number[] {
  return (run.match(AMT) || []).slice(0, n).map(parseSpanishAmount)
}

// Column index of each metric within a summary line's amount run — the two
// listings have DIFFERENT layouts (confirmed against the fixtures + verified by
// the trailing execution %):
//   gastos   header: Inicial · Modificación · Actual · A · D · O(blig. recon.) · P · …
//            → ejecutado = Obligaciones Reconocidas Netas = index 5
//   ingresos header: Inicial · Actual · Compromisos · DR(derechos recon.) · … (no Modificación col)
//            → ejecutado = Derechos Reconocidos = index 3; actual = index 1
const COLS: Record<ExecKind, { modificaciones: number | null; actual: number; ejecutado: number }> =
  {
    gastos: { modificaciones: 1, actual: 2, ejecutado: 5 },
    ingresos: { modificaciones: null, actual: 1, ejecutado: 3 },
  }

function amountsToLine(a: number[], kind: ExecKind): Omit<ExecLine, 'capitulo' | 'label'> {
  const c = COLS[kind]
  const inicial = a[0] ?? 0
  const actual = a[c.actual] ?? 0
  const ejecutado = a[c.ejecutado] ?? 0
  const modificaciones =
    c.modificaciones != null ? (a[c.modificaciones] ?? 0) : round2(actual - inicial)
  return { inicial, modificaciones, actual, ejecutado }
}

export function parseBudgetExecutionPdf(text: string): ExecDoc {
  const kind: ExecKind = /Estado de ejecuci[oó]n de Ingresos/i.test(text) ? 'ingresos' : 'gastos'
  const year = Number((text.match(/Periodo:\s*(\d{4})/) || [])[1]) || 0
  const fechaListado = (text.match(/Fecha de listado[^:]*:\s*([\d/]+)/) || [])[1] || null
  const fechaImpresion = fechaDeCabecera(text)

  const chapters: ExecLine[] = []
  // Marker → label = chars up to the first amount digit (handles both the
  // wrapped gastos Capítulo 2 AND ingresos, whose amounts sit on the NEXT line).
  // Then read the amount run in a bounded window (firstAmounts caps at 9 so the
  // next partida row can't bleed in).
  const markerRe = /Total Cap[ií]tulo\s+(\d+)([\s\S]{0,80}?)(?=-?\d{1,3}(?:\.\d{3})*,\d{2})/g
  let m: RegExpExecArray | null
  // Some SICALWIN "detalle" PDFs emit each chapter's total line twice; dedup by
  // capítulo, KEEP-FIRST, so `chapters` never carries duplicate capítulos (which
  // would be wrong public data AND game selectBestDoc's "most chapters"
  // tie-break). `total` is read separately from the grand-total line and is
  // already correct on the unique set.
  const seen = new Set<number>()
  while ((m = markerRe.exec(text))) {
    const capitulo = Number(m[1])
    if (seen.has(capitulo)) continue
    seen.add(capitulo)
    const label = m[2]
      .replace(/[.\s]+$/, '')
      .replace(/\s+/g, ' ')
      .trim()
    const a = firstAmounts(text.slice(markerRe.lastIndex, markerRe.lastIndex + 200), 9)
    chapters.push({ capitulo, label, ...amountsToLine(a, kind) })
  }

  // Grand total: amounts may share the "Total Gastos" line OR fall on the next
  // line ("Total Ingresos"). Window from the LAST marker occurrence handles both.
  const totMarker = kind === 'gastos' ? 'Total Gastos' : 'Total Ingresos'
  const ti = text.lastIndexOf(totMarker)
  const totAmounts =
    ti >= 0 ? firstAmounts(text.slice(ti + totMarker.length, ti + totMarker.length + 220), 9) : []

  return {
    kind,
    year,
    fechaListado,
    fechaImpresion,
    chapters,
    total: amountsToLine(totAmounts, kind),
  }
}

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/** «30 de Junio del 2025», la primera de la cabecera → «30/06/2025». */
function fechaDeCabecera(text: string): string | null {
  const m = text.slice(0, 400).match(/(\d{1,2}) de ([A-Za-zÁÉÍÓÚáéíóú]+) del? (\d{4})/)
  if (!m) return null
  const mes = MESES.indexOf(m[2].toLowerCase()) + 1
  if (!mes) return null
  return `${m[1].padStart(2, '0')}/${String(mes).padStart(2, '0')}/${m[3]}`
}

/** dd/mm/aaaa → aaaammdd, para comparar; null si no es una fecha. */
function clave(f: string | null | undefined): string | null {
  const m = f?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  return m ? `${m[3]}${m[2].padStart(2, '0')}${m[1].padStart(2, '0')}` : null
}

/**
 * Hasta cuándo llegan los datos de una hoja: la ANTERIOR de su parámetro de
 * listado y su fecha de impresión. Una hoja impresa el 30 de junio no puede
 * traer obligaciones de diciembre, diga lo que diga el parámetro.
 */
export function fechaDeCorte(doc: Pick<ExecDoc, 'fechaListado' | 'fechaImpresion'>): string | null {
  const l = clave(doc.fechaListado)
  const i = clave(doc.fechaImpresion)
  if (l && i) return l <= i ? doc.fechaListado : doc.fechaImpresion
  return l ? doc.fechaListado : i ? doc.fechaImpresion : null
}

/**
 * De las hojas de un mismo periodo, la que publicar: con total válido, la de
 * corte más tardío y, a igual corte, la de más capítulos (el detalle gana al
 * resumen). Antes sólo contaban los capítulos, y con el 2T y el 4T de 2025 a
 * ocho cada uno ganaba el primero de la página: el de junio.
 */
export function elegirDocumento(docs: ExecDoc[]): ExecDoc | null {
  const validos = docs.filter((d) => d.total.actual > 0)
  validos.sort((a, b) => {
    const ca = clave(fechaDeCorte(a)) ?? ''
    const cb = clave(fechaDeCorte(b)) ?? ''
    if (ca !== cb) return cb.localeCompare(ca)
    return b.chapters.length - a.chapters.length
  })
  return validos[0] ?? null
}

export interface BudgetExecutionPeriod {
  year: number
  trimestre: number | null
  /** El CORTE de los datos (`fechaDeCorte` de las hojas): lo que la página dice «a …». */
  fechaListado: string | null
  /** El parámetro «Fecha de listado» de la hoja, tal cual. */
  fechaListadoFuente: string | null
  /** false si gastos e ingresos salen de hojas con cortes distintos: no se publica. */
  mismoCorte: boolean
  gastos: { total: ExecDoc['total']; chapters: ExecLine[] }
  ingresos: { total: ExecDoc['total']; chapters: ExecLine[] }
  ejecucionPct: { gastos: number; ingresos: number }
}

export function pct(ejecutado: number, actual: number): number {
  if (!(actual > 0)) return 0
  return Math.round((ejecutado / actual) * 1000) / 10
}

export function mergeExecutionPeriod(
  gastos: ExecDoc,
  ingresos: ExecDoc,
  meta: { trimestre: number | null },
): BudgetExecutionPeriod {
  return {
    year: gastos.year || ingresos.year,
    trimestre: meta.trimestre,
    fechaListado: fechaDeCorte(gastos) ?? fechaDeCorte(ingresos),
    fechaListadoFuente: gastos.fechaListado ?? ingresos.fechaListado,
    mismoCorte:
      !fechaDeCorte(gastos) ||
      !fechaDeCorte(ingresos) ||
      fechaDeCorte(gastos) === fechaDeCorte(ingresos),
    gastos: { total: gastos.total, chapters: gastos.chapters },
    ingresos: { total: ingresos.total, chapters: ingresos.chapters },
    ejecucionPct: {
      gastos: pct(gastos.total.ejecutado, gastos.total.actual),
      ingresos: pct(ingresos.total.ejecutado, ingresos.total.actual),
    },
  }
}
