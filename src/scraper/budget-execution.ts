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

/**
 * La plantilla «1_2 ITEM 37 Ejecución trimestral», desde el 3T de 2025: un
 * resumen por capítulos con una fila por capítulo —el número pegado a su
 * nombre, «1GASTOS DE PERSONAL19.946.560,44…»— y una fila «Total».
 *
 *   gastos   Créditos iniciales · Créditos definitivos · Obligaciones reconocidas
 *            netas · Pagos realizados · Pagos de ejercicios cerrados · %
 *   ingresos Previsiones iniciales · Previsión definitiva · Derechos reconocidos
 *            netos · Recaudación líquida · Recaudación de ejercicios cerrados · %
 *
 * Las dos llevan el mismo orden: inicial, definitivo, ejecutado. No traen la
 * columna de modificaciones: es la diferencia. Ni «Fecha de listado»: el corte
 * es la impresión (`fechaDeCorte`). Los desgloses de operaciones corrientes y
 * de capital que cuelgan al lado no tienen filas de capítulo; el resumen sí.
 */
const RESUMEN_POR_CAPITULOS = /Resumen por cap[ií]tulos/i
const FILA_DE_CAPITULO =
  /^([1-9])([A-ZÁÉÍÓÚÜÑ][^\d\n]*?)\s*(-?\d{1,3}(?:\.\d{3})*,\d{2}(?:-?\d{1,3}(?:\.\d{3})*,\d{2})*)/gm
const FILA_TOTAL = /^Total\s*(-?\d{1,3}(?:\.\d{3})*,\d{2}(?:-?\d{1,3}(?:\.\d{3})*,\d{2})*)/m

function deResumen(a: number[]): Omit<ExecLine, 'capitulo' | 'label'> {
  const [inicial = 0, actual = 0, ejecutado = 0] = a
  return { inicial, modificaciones: round2(actual - inicial), actual, ejecutado }
}

function parseResumenPorCapitulos(text: string): Pick<ExecDoc, 'chapters' | 'total'> {
  const chapters: ExecLine[] = []
  for (const m of text.matchAll(FILA_DE_CAPITULO)) {
    const capitulo = Number(m[1])
    if (chapters.some((c) => c.capitulo === capitulo)) continue
    const label = m[2].replace(/\s+/g, ' ').trim()
    chapters.push({ capitulo, label, ...deResumen(firstAmounts(m[3], 3)) })
  }
  const total = (text.match(FILA_TOTAL) || [])[1]
  return { chapters, total: deResumen(total ? firstAmounts(total, 3) : []) }
}

export function parseBudgetExecutionPdf(text: string): ExecDoc {
  const kind: ExecKind =
    /Estado de ejecuci[oó]n de Ingresos/i.test(text) ||
    /Presupuestos?\s+Ingresos/i.test(text.slice(0, 600))
      ? 'ingresos'
      : 'gastos'
  const year = Number((text.match(/Periodo:\s*(\d{4})/) || [])[1]) || 0
  const fechaListado = (text.match(/Fecha de listado[^:]*:\s*([\d/]+)/) || [])[1] || null
  const fechaImpresion = fechaDeCabecera(text)

  if (RESUMEN_POR_CAPITULOS.test(text)) {
    return { kind, year, fechaListado, fechaImpresion, ...parseResumenPorCapitulos(text) }
  }

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

/**
 * El trimestre que nombra un enlace del índice, tal como lo escribe el
 * Ayuntamiento: «1T», «2T2025», «1T 2026», «2 y 3T2024» —la hoja llega hasta el
 * tercero—, «2º trimestre» o una fecha de cierre («30-06-23», el segundo). null
 * si no nombra ninguno: el de la página lo suple, y si tampoco, no se inventa.
 */
export function trimestreDeEnlace(texto: string): number | null {
  const t = texto.replace(/\s+/g, ' ')
  const vistos: number[] = []
  for (const m of t.matchAll(/(?<!\d)([1-4])\s*T(?![a-záéíóúñ])/gi)) vistos.push(Number(m[1]))
  for (const m of t.matchAll(/(?<!\d)([1-4])\s*º?\s*trimestre/gi)) vistos.push(Number(m[1]))
  for (const m of t.matchAll(/(?<!\d)(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)/g)) {
    const mes = Number(m[2])
    if (mes >= 1 && mes <= 12) vistos.push(Math.ceil(mes / 3))
  }
  return vistos.length ? Math.max(...vistos) : null
}

/** El año que nombra un enlace —«2T2025», «1T 2026», «30-06-23»—, o null. */
export function anioDeEnlace(texto: string): number | null {
  const t = texto.replace(/\s+/g, ' ')
  const trimestral = t.match(/(?<!\d)[1-4]\s*T\s*(20\d{2})(?!\d)/i)
  if (trimestral) return Number(trimestral[1])
  const fecha = t.match(/(?<!\d)\d{1,2}[-/.]\d{1,2}[-/.](\d{4}|\d{2})(?!\d)/)
  if (fecha) return fecha[1].length === 2 ? 2000 + Number(fecha[1]) : Number(fecha[1])
  const suelto = t.match(/(?<!\d)(20\d{2})(?!\d)/)
  return suelto ? Number(suelto[1]) : null
}

/** Los enlaces a PDF de una página de periodo, como etiquetas <a> enteras. */
export function enlacesPdf(html: string): string[] {
  return [...html.matchAll(/<a[^>]+href="[^"]+\.pdf[^"]*"[^>]*>[^<]*<\/a>/gi)].map((m) => m[0])
}

export interface HojaDeEjecucion {
  href: string
  texto: string
  /** null si el enlace no dice gastos o ingresos, o dice los dos (el resumen conjunto). */
  kind: ExecKind | null
  year: number | null
  trimestre: number | null
}

function claseDeEnlace(s: string): ExecKind | null {
  const g = /gasto/i.test(s)
  const i = /ingreso/i.test(s)
  return g && !i ? 'gastos' : i && !g ? 'ingresos' : null
}

/**
 * Las hojas de una página del índice: cada una con su clase, su año y su
 * trimestre, que se leen del enlace y, si el enlace no los trae, de la página.
 * Un mismo PDF enlazado dos veces es una hoja: la del trimestre más tardío que
 * le atribuye la página (en 2024, «2 y 3T» y «4T» apuntan al mismo cierre).
 */
export function hojasDePagina(pagina: { label: string; enlaces: string[] }): HojaDeEjecucion[] {
  const porHref = new Map<string, HojaDeEjecucion>()
  for (const a of pagina.enlaces) {
    const m = a.match(/href="([^"]+)"[^>]*>([^<]*)</i)
    if (!m) continue
    const href = m[1].startsWith('http') ? m[1] : `https://www.ribarroja.es${m[1]}`
    const texto = m[2].replace(/\s+/g, ' ').trim()
    const hoja: HojaDeEjecucion = {
      href,
      texto,
      kind: claseDeEnlace(texto) ?? claseDeEnlace(decodeURIComponent(href)),
      year: anioDeEnlace(texto) ?? anioDeEnlace(pagina.label),
      trimestre: trimestreDeEnlace(texto) ?? trimestreDeEnlace(pagina.label),
    }
    const previa = porHref.get(href)
    if (!previa || (hoja.trimestre ?? 0) > (previa.trimestre ?? 0)) porHref.set(href, hoja)
  }
  return [...porHref.values()]
}

/**
 * Por qué un periodo no se publica, o null si se publica. Las cifras tienen que
 * sostenerse solas: los dos totales, los capítulos de los dos lados —una hoja
 * con totales y sin desglose es la que publicaba ingresos al 0,1 %—, una
 * ejecución entre 0 y 110 %, el mismo corte en gastos y en ingresos —el 2025
 * publicado juntó los gastos de junio con los ingresos de diciembre—, y el año
 * de la hoja igual al del enlace. Se dice el motivo para que el raspador cuente
 * lo que descartó, y por qué, en vez de callarlo.
 */
export function motivoDeDescarte(
  p: BudgetExecutionPeriod,
  esperado: { year: number },
): string | null {
  const enRango = (x: number) => x > 0 && x <= 110
  if (!(p.gastos.total.actual > 0)) return 'gastos sin total legible'
  if (!(p.ingresos.total.actual > 0)) return 'ingresos sin total legible'
  if (p.gastos.chapters.length === 0) return 'gastos sin capítulos'
  if (p.ingresos.chapters.length === 0) return 'ingresos sin capítulos'
  if (!enRango(p.ejecucionPct.gastos))
    return `ejecución de gastos fuera de rango (${p.ejecucionPct.gastos} %)`
  if (!enRango(p.ejecucionPct.ingresos))
    return `ejecución de ingresos fuera de rango (${p.ejecucionPct.ingresos} %)`
  if (!p.mismoCorte) return 'gastos e ingresos con cortes distintos'
  if (p.year !== esperado.year)
    return `la hoja dice ${p.year || 'sin año'} y el enlace ${esperado.year}`
  return null
}

/**
 * Si un periodo es el cierre de su ejercicio: su corte es el 31 de diciembre de
 * su año. Lo que no lo es, es un año en curso, y se cuenta en presente —«lleva
 * gastados», no «gastó»—: decir de un primer trimestre que el año «acabó con»
 * algo es afirmar un cierre que no ha llegado.
 */
export function esCierre(
  p: { year?: number | null; fechaListado?: string | null } | null | undefined,
): boolean {
  return !!p?.year && p.fechaListado === `31/12/${p.year}`
}

/**
 * El último ejercicio cerrado: el periodo más tardío cuyo corte es el 31 de
 * diciembre de su año. Lo que compara un año con otro —el porcentaje de
 * ejecución, las modificaciones sobre lo aprobado— se mide sobre él, no sobre
 * un trimestre a medias.
 */
export function ultimoCierre<T extends Pick<BudgetExecutionPeriod, 'year' | 'fechaListado'>>(
  periodos: T[],
): T | null {
  const cierres = periodos.filter(esCierre)
  return cierres.sort((a, b) => a.year - b.year)[cierres.length - 1] ?? null
}

/**
 * La ejecución de UN ejercicio, para cotejarla con otra fuente del mismo año:
 * su cierre si lo hay, y si no el periodo más tardío de ese año. null si el
 * snapshot no tiene ninguno.
 *
 * Existe porque `latest` dejó de ser el cierre: con el 1T de 2026 como periodo
 * más nuevo, lo que cotejaba CONPREL de 2025 contra `latest` se quedaba sin
 * nada que cotejar —los años no casan— y el aviso de que el presupuesto del
 * Ministerio no cuadra dejó de pintarse, sin que nada lo dijera.
 */
export function periodoDelAnio<T extends { year?: number | null; fechaListado?: string | null }>(
  ejecucion:
    { latest?: T | null; ultimoCierre?: T | null; periods?: T[] | null } | null | undefined,
  year: number | null | undefined,
): T | null {
  if (!ejecucion || !year) return null
  const delAnio = [
    ejecucion.ultimoCierre,
    ...[...(ejecucion.periods ?? [])].reverse(),
    ejecucion.latest,
  ].filter((p): p is T => !!p && p.year === year)
  return delAnio.find(esCierre) ?? delAnio[0] ?? null
}

export interface PeriodoDelIndice {
  year: number
  trimestre: number
  gastos: string[]
  ingresos: string[]
}

/**
 * Un periodo por año y trimestre, con las hojas de gastos y de ingresos que le
 * tocan, de todas las páginas del índice. Una hoja sin clase, sin año o sin
 * trimestre no entra en ninguno: quien raspa la cuenta aparte.
 */
export function periodosDelIndice(
  paginas: Array<{ label: string; enlaces: string[] }>,
): PeriodoDelIndice[] {
  const porClave = new Map<string, PeriodoDelIndice>()
  for (const hoja of paginas.flatMap((p) => hojasDePagina(p))) {
    if (!hoja.kind || hoja.year == null || hoja.trimestre == null) continue
    const clave = `${hoja.year}-${hoja.trimestre}`
    const p = porClave.get(clave) ?? {
      year: hoja.year,
      trimestre: hoja.trimestre,
      gastos: [],
      ingresos: [],
    }
    if (!p[hoja.kind].includes(hoja.href)) p[hoja.kind].push(hoja.href)
    porClave.set(clave, p)
  }
  return [...porClave.values()].sort((a, b) => a.year - b.year || a.trimestre - b.trimestre)
}
