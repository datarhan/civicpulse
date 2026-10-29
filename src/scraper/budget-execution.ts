/**
 * Pure parser for Riba-roja's quarterly budget-EXECUTION listings (SICALWIN
 * "Estado de ejecución de Gastos/Ingresos" PDFs, pdf-parsed to text upstream).
 * No I/O. The listing ends each chapter with a `Total Capítulo N <LABEL>.<run>`
 * summary line and a `Total Gastos|Ingresos <run>` grand total; each `<run>` is
 * a concatenation of ES-formatted amounts whose COLUMN ORDER DIFFERS between
 * the two listings (see `filaDeTotales`). We keep inicial/modificaciones/actual and
 * `ejecutado` = the executed metric (gastos: Obligaciones Reconocidas Netas;
 * ingresos: Derechos Reconocidos NETOS) — the column each listing's printed %
 * is computed from, which `motivoDeDescarte` checks period by period.
 *
 * Tres plantillas más, cada una en su función: el resumen por capítulos de
 * «1_2 ITEM 37 Ejecución trimestral» (desde el 3T de 2025), el listado de
 * SICALWIN ordenado por programas —sin «Total Capítulo»: los capítulos se
 * suman de las partidas— y los formularios F.1.1 del Ministerio (2T de 2023),
 * con cada lado partido en dos hojas que `unirPartes` junta.
 */
export type ExecKind = 'gastos' | 'ingresos'

/**
 * Qué es el «definitivo» (`actual`) de una hoja. `a-la-fecha`: el crédito o la
 * previsión definitiva a su corte. `estimado`: la «Estimación … al final de
 * ejercicio» de los formularios del Ministerio, que suma las modificaciones
 * «ya tramitadas y/o previstas tramitar hasta final de ejercicio». La
 * ejecución sobre una y sobre otra no es la misma magnitud.
 */
export type Definitivo = 'a-la-fecha' | 'estimado'

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
  /**
   * El porcentaje de ejecución del total que imprime la hoja —obligaciones
   * sobre créditos, derechos netos sobre previsiones—, o null si no imprime
   * ninguno. Es contra lo que se coteja la columna leída.
   */
  pctImpreso: number | null
  definitivo: Definitivo
  /**
   * La mitad de un lado, en los formularios del Ministerio: operaciones
   * corrientes, o de capital y financieras. Sola no es un lado entero.
   */
  parte?: 'corriente' | 'capital'
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

// Importes y porcentajes, en el orden en que salen: «31.013,580,08%41,39%» es
// 31.013,58 · 0,08 % · 41,39 %. Leídos uno tras otro, cada uno empieza donde
// acaban los dos decimales del anterior.
const TOKEN = /-?\d{1,3}(?:\.\d{3})*,\d{2}%?/g

function pctsDe(run: string): number[] {
  return (run.match(TOKEN) || [])
    .filter((t) => t.endsWith('%'))
    .map((t) => parseSpanishAmount(t.slice(0, -1)))
}

/** 20000 → «20.000,00», como lo escribe la hoja. */
function cifra(n: number): string {
  const [entero, decimales] = Math.abs(n).toFixed(2).split('.')
  return `${n < 0 ? '-' : ''}${entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${decimales}`
}

type Importes = Omit<ExecLine, 'capitulo' | 'label'>

// The two listings have DIFFERENT layouts (confirmed against the fixtures +
// verified by the printed execution %, which `motivoDeDescarte` re-checks):
//   gastos   header: Inicial · Modificación · Actual · A · D · O(blig. recon.) · P · …
//            → ejecutado = Obligaciones Reconocidas Netas = index 5 («%O /Cr»)
//   ingresos header, first line: Inicial · Actual · Compromisos · DR · DR Anul. ·
//            Deudores · II Netos · … · Saldo; SECOND line: Modific. · CIC
//            pendiente · DR Netos · DR Canc. · OI · Dev. I · %DR s/Prev
//            → ejecutado = Derechos Reconocidos NETOS = the second line's index
//            2; actual = the first line's index 1. The first line's index 3 is
//            the gross DR, before cancellations and refunds: read there, 2T
//            2025 said 61,8 % where the sheet prints «61,37%».
const UN_IMPORTE = /-?\d{1,3}(?:\.\d{3})*,\d{2}/

function amountsToLine(a: number[]): Importes {
  const [inicial = 0, modificaciones = 0, actual = 0, , , ejecutado = 0] = a
  return { inicial, modificaciones, actual, ejecutado }
}

/**
 * Una fila de totales de SICALWIN —«Total Capítulo», «Total Concepto», «Total
 * Gastos|Ingresos»—, leída desde su primer importe: sus importes y el
 * porcentaje de ejecución que imprime. En ingresos son DOS líneas, y los netos
 * se cuentan desde el principio de la segunda, no de corrido: la primera copia
 * de cada «Total Capítulo» del cierre de 2025 trae mal impreso el saldo, la
 * última columna de la primera línea («1.783.564,730», «701477,61»). Contados
 * de corrido, los netos del capítulo 9 salían 0 y los capítulos no sumaban.
 */
function filaDeTotales(
  ventana: string,
  kind: ExecKind,
): { importes: Importes; pctImpreso: number | null } {
  if (kind === 'gastos')
    // «%» (saldo) y «%O /Cr» al final de la primera línea: el segundo.
    return {
      importes: amountsToLine(firstAmounts(ventana, 9)),
      pctImpreso: pctsDe(ventana)[1] ?? null,
    }
  const [primera = '', segunda = ''] = ventana.split('\n').filter((l) => UN_IMPORTE.test(l))
  const [inicial = 0, actual = 0] = firstAmounts(primera, 2)
  const ejecutado = firstAmounts(segunda, 3)[2] ?? 0
  return {
    importes: { inicial, modificaciones: round2(actual - inicial), actual, ejecutado },
    // «%DR s/Prev», el primero de la segunda línea.
    pctImpreso: pctsDe(segunda)[0] ?? null,
  }
}

/**
 * Los nombres de los capítulos de la clasificación económica (Orden
 * EHA/3565/2008), para las hojas que suman sus capítulos sin imprimirlos.
 */
export const CAPITULOS: Record<ExecKind, Record<number, string>> = {
  gastos: {
    1: 'Gastos de personal',
    2: 'Gastos en bienes corrientes y servicios',
    3: 'Gastos financieros',
    4: 'Transferencias corrientes',
    5: 'Fondo de contingencia y otros imprevistos',
    6: 'Inversiones reales',
    7: 'Transferencias de capital',
    8: 'Activos financieros',
    9: 'Pasivos financieros',
  },
  ingresos: {
    1: 'Impuestos directos',
    2: 'Impuestos indirectos',
    3: 'Tasas, precios públicos y otros ingresos',
    4: 'Transferencias corrientes',
    5: 'Ingresos patrimoniales',
    6: 'Enajenación de inversiones reales',
    7: 'Transferencias de capital',
    8: 'Activos financieros',
    9: 'Pasivos financieros',
  },
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

function parseResumenPorCapitulos(
  text: string,
): Pick<ExecDoc, 'chapters' | 'total' | 'pctImpreso'> {
  const chapters: ExecLine[] = []
  for (const m of text.matchAll(FILA_DE_CAPITULO)) {
    const capitulo = Number(m[1])
    if (chapters.some((c) => c.capitulo === capitulo)) continue
    const label = m[2].replace(/\s+/g, ' ').trim()
    chapters.push({ capitulo, label, ...deResumen(firstAmounts(m[3], 3)) })
  }
  const fila = text.match(FILA_TOTAL)
  const total = fila?.[1]
  // El «%» de la fila Total va al pie, en la línea siguiente («11,07%»).
  const pie = fila?.index != null ? text.slice(fila.index, fila.index + 200) : ''
  return {
    chapters,
    total: deResumen(total ? firstAmounts(total, 3) : []),
    pctImpreso: pctsDe(pie)[0] ?? null,
  }
}

/**
 * Una partida del listado de gastos: « 132/12101» y, PEGADO al código
 * económico, el inicial; detrás, modificación, actual, A, D, O, P, RP, saldo.
 * El código no tiene longitud fija —cinco, siete u ocho cifras— y la hoja lo
 * pega a la primera cifra: « 151/227993520.000,00» puede ser el 2279935 con
 * 20.000,00 o el 227993 con 520.000,00. Lo que sigue al primer importe no es
 * ambiguo, porque cada importe acaba en sus dos decimales, así que el inicial
 * se deduce —actual menos modificación— y se comprueba contra lo que la hoja
 * pega al código. Una partida que no casa no se suma: sus capítulos no
 * cuadrarán con el total, y `motivoDeDescarte` lo dirá.
 */
const PARTIDA = /^ ?\d*\/(\d)(\d*(?:\.\d{3})*,\d{2})(.*)$/gm

function sumarPorCapitulo(kind: ExecKind, filas: Array<[number, Importes]>): ExecLine[] {
  const porCapitulo = new Map<number, Importes>()
  for (const [capitulo, f] of filas) {
    const c = porCapitulo.get(capitulo) ?? {
      inicial: 0,
      modificaciones: 0,
      actual: 0,
      ejecutado: 0,
    }
    porCapitulo.set(capitulo, {
      inicial: c.inicial + f.inicial,
      modificaciones: c.modificaciones + f.modificaciones,
      actual: c.actual + f.actual,
      ejecutado: c.ejecutado + f.ejecutado,
    })
  }
  return [...porCapitulo]
    .sort(([a], [b]) => a - b)
    .map(([capitulo, c]) => ({
      capitulo,
      label: CAPITULOS[kind][capitulo] ?? `Capítulo ${capitulo}`,
      inicial: round2(c.inicial),
      modificaciones: round2(c.modificaciones),
      actual: round2(c.actual),
      ejecutado: round2(c.ejecutado),
    }))
}

function capitulosDePartidas(text: string): ExecLine[] {
  const filas: Array<[number, Importes]> = []
  for (const m of text.matchAll(PARTIDA)) {
    const [modificaciones, actual, , , ejecutado] = firstAmounts(m[3], 5)
    if (ejecutado == null) continue
    const inicial = round2(actual - modificaciones)
    if (!(m[1] + m[2]).endsWith(cifra(inicial))) continue
    filas.push([Number(m[1]), { inicial, modificaciones, actual, ejecutado }])
  }
  return sumarPorCapitulo('gastos', filas)
}

/**
 * Los ingresos sin «Total Capítulo» (1T de 2024) sí cierran cada concepto con
 * su «Total Concepto  112 …», en las mismas dos líneas que el total: se suman
 * por la primera cifra del concepto.
 */
const TOTAL_CONCEPTO = /Total Concepto\s+(\d)\d{2}\b[\s\S]{0,120}?(?=-?\d{1,3}(?:\.\d{3})*,\d{2})/g

function capitulosDeConceptos(text: string): ExecLine[] {
  const filas: Array<[number, Importes]> = []
  for (const m of text.matchAll(TOTAL_CONCEPTO)) {
    const desde = m.index + m[0].length
    filas.push([Number(m[1]), filaDeTotales(text.slice(desde, desde + 400), 'ingresos').importes])
  }
  return sumarPorCapitulo('ingresos', filas)
}

/**
 * Los formularios F.1.1 de las «Ejecuciones trimestrales de las entidades
 * locales» del Ministerio (el 2T de 2023): F.1.1.2 ingresos corrientes, F.1.1.3
 * de capital y financieros, F.1.1.4 gastos corrientes, F.1.1.5 de capital y
 * financieros. Cada capítulo es una fila con su cifra sola o pegada al nombre
 * en mayúsculas —«1IMPUESTOS DIRECTOS», «4\nTRANSFERENCIAS\nCORRIENTES»— y
 * cinco columnas: inicial · Estimación … al final de ejercicio · reconocido
 * neto · pagos o recaudación líquida · lo de ejercicios cerrados. El fondo de
 * contingencia trae sólo las dos primeras. Ni fecha de impresión ni
 * porcentaje: el corte es el fin del trimestre que declaran («Datos de
 * ejecución acumulados a final del trimestre vencido»).
 */
const FORMULARIO_MINISTERIO = /EJECUCIONES TRIMESTRALES DE LAS ENTIDADES[\s\S]{0,40}F\.1\.1\.\d/
const RUN = '-?\\d{1,3}(?:\\.\\d{3})*,\\d{2}(?:-?\\d{1,3}(?:\\.\\d{3})*,\\d{2})*'
const FILA_F11 = new RegExp(
  `^([1-9])(?![\\d.,])\\n?([A-ZÁÉÍÓÚÜÑ\\uFFFD][A-ZÁÉÍÓÚÜÑ\\uFFFD ,\\n]*?)\\n?(${RUN})`,
  'gm',
)
const TOTAL_F11 = new RegExp(`^TOTAL (?:INGRESOS|GASTOS)[^\\d]*?(${RUN})`, 'im')
const FIN_DE_TRIMESTRE = ['31/03', '30/06', '30/09', '31/12']

function deFormulario(a: number[]): Importes {
  const [inicial = 0, actual = 0, ejecutado = 0] = a
  return { inicial, modificaciones: round2(actual - inicial), actual, ejecutado }
}

function parseFormularioMinisterio(text: string): ExecDoc {
  const kind: ExecKind = /Desglose de (?:los )?ingresos/i.test(text) ? 'ingresos' : 'gastos'
  const titulo = (text.match(/F\.1\.1\.\d+\s*-\s*Desglose de ([^\n]*)/) || [])[1] ?? ''
  const year = Number((text.match(/Ejercicio:\s*(\d{4})/) || [])[1]) || 0
  const trimestre = Number((text.match(/Periodo:\s*Trimestre\s*([1-4])/) || [])[1]) || 0
  const chapters: ExecLine[] = []
  for (const m of text.matchAll(FILA_F11)) {
    const capitulo = Number(m[1])
    if (chapters.some((c) => c.capitulo === capitulo)) continue
    const label = m[2].replace(/\s+/g, ' ').trim()
    chapters.push({ capitulo, label, ...deFormulario(firstAmounts(m[3], 3)) })
  }
  const total = (text.match(TOTAL_F11) || [])[1]
  return {
    kind,
    year,
    fechaListado: year && trimestre ? `${FIN_DE_TRIMESTRE[trimestre - 1]}/${year}` : null,
    fechaImpresion: null,
    chapters,
    total: deFormulario(total ? firstAmounts(total, 3) : []),
    pctImpreso: null,
    definitivo: 'estimado',
    parte: /capital/i.test(titulo) ? 'capital' : 'corriente',
  }
}

export function parseBudgetExecutionPdf(text: string): ExecDoc {
  if (FORMULARIO_MINISTERIO.test(text.slice(0, 400))) return parseFormularioMinisterio(text)
  const kind: ExecKind =
    /Estado de ejecuci[oó]n de Ingresos/i.test(text) ||
    /Presupuestos?\s+Ingresos/i.test(text.slice(0, 600))
      ? 'ingresos'
      : 'gastos'
  const year = Number((text.match(/Periodo:\s*(\d{4})/) || [])[1]) || 0
  const fechaListado = (text.match(/Fecha de listado[^:]*:\s*([\d/]+)/) || [])[1] || null
  const fechaImpresion = fechaDeCabecera(text)

  if (RESUMEN_POR_CAPITULOS.test(text)) {
    return {
      kind,
      year,
      fechaListado,
      fechaImpresion,
      definitivo: 'a-la-fecha',
      ...parseResumenPorCapitulos(text),
    }
  }

  let chapters: ExecLine[] = []
  // Marker → label = chars up to the first amount digit (handles both the
  // wrapped gastos Capítulo 2 AND ingresos, whose amounts sit on the NEXT line).
  // Then read the row in a bounded window (`filaDeTotales` takes only its own
  // line or two, so the next partida row can't bleed in).
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
    const fila = filaDeTotales(text.slice(markerRe.lastIndex, markerRe.lastIndex + 400), kind)
    chapters.push({ capitulo, label, ...fila.importes })
  }
  // Ordenado por programas (gastos del 1T de 2024 y de 2025) o sin capítulos
  // (ingresos del 1T de 2024), el listado no trae «Total Capítulo».
  if (chapters.length === 0)
    chapters = kind === 'gastos' ? capitulosDePartidas(text) : capitulosDeConceptos(text)

  // Grand total: amounts may share the "Total Gastos" line OR fall on the next
  // line ("Total Ingresos"). Window from the LAST marker occurrence handles both.
  const totMarker = kind === 'gastos' ? 'Total Gastos' : 'Total Ingresos'
  const ti = text.lastIndexOf(totMarker)
  const total = filaDeTotales(
    ti >= 0 ? text.slice(ti + totMarker.length, ti + totMarker.length + 400) : '',
    kind,
  )

  return {
    kind,
    year,
    fechaListado,
    fechaImpresion,
    chapters,
    total: total.importes,
    pctImpreso: total.pctImpreso,
    definitivo: 'a-la-fecha',
  }
}

/**
 * Las dos mitades de un lado —operaciones corrientes, de capital y
 * financieras— hacen un documento cuando las dos son del mismo año y corte:
 * sus capítulos juntos y sus totales sumados. Lo que no es una mitad pasa tal
 * cual; una mitad sin su pareja también, y `elegirDocumento` no la elige
 * nunca: sus totales no son los del lado.
 */
export function unirPartes(docs: ExecDoc[]): ExecDoc[] {
  const enteros: ExecDoc[] = []
  const mitades = new Map<string, ExecDoc[]>()
  for (const d of docs) {
    if (!d.parte) enteros.push(d)
    else {
      const clave = `${d.kind}|${d.year}|${fechaDeCorte(d)}`
      mitades.set(clave, [...(mitades.get(clave) ?? []), d])
    }
  }
  for (const grupo of mitades.values()) {
    const corriente = grupo.find((d) => d.parte === 'corriente')
    const capital = grupo.find((d) => d.parte === 'capital')
    if (!corriente || !capital) {
      enteros.push(...grupo)
      continue
    }
    const suma = (k: keyof Importes) => round2(corriente.total[k] + capital.total[k])
    enteros.push({
      kind: corriente.kind,
      year: corriente.year,
      fechaListado: corriente.fechaListado,
      fechaImpresion: corriente.fechaImpresion,
      chapters: [...corriente.chapters, ...capital.chapters].sort(
        (a, b) => a.capitulo - b.capitulo,
      ),
      total: {
        inicial: suma('inicial'),
        modificaciones: suma('modificaciones'),
        actual: suma('actual'),
        ejecutado: suma('ejecutado'),
      },
      // Ninguna de las dos lo imprime para el lado entero.
      pctImpreso: null,
      definitivo:
        corriente.definitivo === 'estimado' || capital.definitivo === 'estimado'
          ? 'estimado'
          : 'a-la-fecha',
    })
  }
  return enteros
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
 * ocho cada uno ganaba el primero de la página: el de junio. Una mitad sola
 * (`unirPartes`) no cuenta: es medio lado.
 */
export function elegirDocumento(docs: ExecDoc[]): ExecDoc | null {
  const validos = docs.filter((d) => d.total.actual > 0 && !d.parte)
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
  /**
   * Contra qué se cotejó cada lado: el porcentaje que imprime su hoja (null si
   * no imprime ninguno) y qué es su «definitivo».
   */
  cotejo: Record<ExecKind, Pick<ExecDoc, 'pctImpreso' | 'definitivo'>>
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
    cotejo: {
      gastos: { pctImpreso: gastos.pctImpreso, definitivo: gastos.definitivo },
      ingresos: { pctImpreso: ingresos.pctImpreso, definitivo: ingresos.definitivo },
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

const LADOS: ExecKind[] = ['gastos', 'ingresos']

/** Qué campo de los capítulos no suma su total, con las dos cifras; o null si cuadran. */
function descuadre(lado: BudgetExecutionPeriod['gastos']): string | null {
  for (const campo of ['inicial', 'actual', 'ejecutado'] as const) {
    const suma = round2(lado.chapters.reduce((s, c) => s + c[campo], 0))
    if (Math.abs(suma - lado.total[campo]) > 0.005)
      return `${campo}: ${cifra(suma)} € frente a ${cifra(lado.total[campo])} €`
  }
  return null
}

/**
 * Por qué un periodo no se publica, o null si se publica. Las cifras tienen que
 * sostenerse solas: los dos totales, los capítulos de los dos lados —una hoja
 * con totales y sin desglose es la que publicaba ingresos al 0,1 %—, unos
 * capítulos que suman su total, un total cuyo porcentaje es el que imprime la
 * hoja —leída en otra columna, la cifra no es la que la hoja da por
 * ejecutada—, un «definitivo» que sea el crédito a la fecha y no una
 * estimación, unos ingresos ya contabilizados, una ejecución entre 0 y 110 %,
 * el mismo corte en gastos y en ingresos —el 2025 publicado juntó los gastos
 * de junio con los ingresos de diciembre—, y el año de la hoja igual al del
 * enlace. Se dice el motivo para que el raspador cuente lo que descartó, y por
 * qué, en vez de callarlo.
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
  for (const lado of LADOS) {
    const d = descuadre(p[lado])
    if (d) return `los capítulos de ${lado} no suman su total (${d})`
  }
  const estimados = LADOS.filter((lado) => p.cotejo[lado].definitivo === 'estimado')
  if (estimados.length)
    return (
      `el «definitivo» de ${estimados.join(' y de ')} es la estimación a fin de ejercicio ` +
      `del formulario F.1.1 del Ministerio, no el vigente a ${p.fechaListado ?? 'la fecha'}`
    )
  for (const lado of LADOS) {
    const impreso = p.cotejo[lado].pctImpreso
    if (impreso == null) return `la hoja de ${lado} no imprime porcentaje con que cotejar su total`
    const leido = (100 * p[lado].total.ejecutado) / p[lado].total.actual
    // La hoja redondea a dos decimales: más de medio céntimo de punto es otra columna.
    if (Math.abs(leido - impreso) > 0.0051)
      return `la ejecución de ${lado} leída (${cifra(leido)} %) no es la que imprime la hoja (${cifra(impreso)} %)`
  }
  // Las entregas a cuenta del Estado llegan cada mes y se apuntan en el
  // capítulo 4. Con sus derechos NETOS a cero o en negativo —más devoluciones
  // que derechos—, la hoja se sacó antes de contabilizar los ingresos: su
  // porcentaje no dice cuánto se ingresó, sino cuánto se había apuntado —el 1T
  // de 2024, impreso el 9 de abril: 3.597,18 € reconocidos, 14.700 devueltos,
  // un 0,08 % del total—.
  const c4 = p.ingresos.chapters.find((c) => c.capitulo === 4)
  if (c4 && c4.actual > 0 && c4.ejecutado <= 0)
    return (
      `ingresos sin contabilizar a ${p.fechaListado ?? 'la fecha de la hoja'}: las transferencias ` +
      `corrientes (cap. 4), donde entran las entregas mensuales del Estado, suman ` +
      `${cifra(c4.ejecutado)} € de derechos netos —más devoluciones que derechos— de ` +
      `${cifra(c4.actual)} € previstos`
    )
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
