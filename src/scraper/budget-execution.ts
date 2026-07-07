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
  fechaListado: string | null
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

  return { kind, year, fechaListado, chapters, total: amountsToLine(totAmounts, kind) }
}

export interface BudgetExecutionPeriod {
  year: number
  trimestre: number | null
  fechaListado: string | null
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
    fechaListado: gastos.fechaListado ?? ingresos.fechaListado,
    gastos: { total: gastos.total, chapters: gastos.chapters },
    ingresos: { total: ingresos.total, chapters: ingresos.chapters },
    ejecucionPct: {
      gastos: pct(gastos.total.ejecutado, gastos.total.actual),
      ingresos: pct(ingresos.total.ejecutado, ingresos.total.actual),
    },
  }
}
