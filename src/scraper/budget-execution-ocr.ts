/**
 * Las hojas de ejecución presupuestaria que el Ayuntamiento publica SIN capa de
 * texto, leídas por OCR. Puro: recibe el texto que devuelve Tesseract —las
 * columnas separadas por dos o más espacios— y no toca red ni disco; el lector
 * está en budget-execution-ocr-fetch.ts.
 *
 * No son escaneos. «Microsoft: Print To PDF» dibujó cada letra como un trazo,
 * sin fuente, y pdf-parse no saca de ellas ni un carácter: las seis hojas del
 * 3T de 2025 y la de ingresos del cierre de 2024 salían en
 * `lectura.hojasSinTexto` y sus dos periodos no se publicaban.
 *
 * Una cifra leída por OCR no se publica porque el OCR la haya leído, sino
 * porque cuadra con las demás de su hoja:
 *
 *   resumen  cada capítulo y el total imprimen su porcentaje de ejecución; el
 *            ejecutado entre el crédito definitivo tiene que darlo al redondeo,
 *            y las cinco columnas de los nueve capítulos tienen que sumar la
 *            fila «Total» al céntimo.
 *   estado   (la plantilla SICALWIN antigua) cada fila trae diecisiete cifras
 *            atadas por seis identidades —los DR netos son los DR menos los
 *            anulados, los cancelados y las devoluciones; el saldo, lo previsto
 *            menos los DR netos…— y dos porcentajes; las quince columnas de los
 *            capítulos tienen que sumar «Total Ingresos» al céntimo.
 *   desglose el detalle de operaciones corrientes o de capital no se publica:
 *            su fila «Total» coteja la suma de los capítulos del resumen que
 *            cubre, leída de otra hoja.
 *
 * Una lectura que no cuadra no se corrige ni se adivina: se descarta, y el
 * motivo dice qué cifra no cuadró (docs/DATA_INTEGRITY.md, regla 2).
 */
import type { ExecDoc, ExecKind, ExecLine } from './budget-execution'

export type PlantillaOcr = 'resumen' | 'estado' | 'desglose'

/**
 * El importe de una celda, en céntimos, leyendo SÓLO sus cifras: toda cifra de
 * estas hojas lleva dos decimales, así que los separadores no informan de nada
 * y son justo lo que el OCR confunde —«265 416,53», «4.090.267 48», «147%» por
 * «1,47%»—. null si la celda trae cualquier otra cosa: una letra es una cifra
 * mal leída, y no se adivina cuál.
 */
export function centimosOcr(celda: string): number | null {
  const c = celda.trim()
  if (!/^[-–—]?\s*\d[\d.,\s]*%?$/.test(c)) return null
  const cifras = c.replace(/\D/g, '')
  if (cifras.length < 3) return null
  return (/^[-–—]/.test(c) ? -1 : 1) * Number(cifras)
}

/** Las celdas de una línea de OCR: Tesseract separa las columnas con dos o más espacios. */
export function celdasOcr(linea: string): string[] {
  return linea
    .trim()
    .split(/\s{2,}/)
    .filter(Boolean)
}

export interface HojaOcr {
  plantilla: PlantillaOcr | null
  kind: ExecKind | null
  /** Los capítulos que cubre un desglose: 1–5 el corriente, 6–9 el de capital. */
  capitulos: number[] | null
}

const TITULO = /(Resumen por cap[ií]tulos|Desglose de Operaciones|Estado de ejecuci[oó]n de)/i

/** Qué hoja es, por su título: la plantilla, gastos o ingresos y, si es un desglose, qué capítulos. */
export function plantillaOcr(texto: string): HojaOcr {
  const titulo = texto.split('\n').find((l) => TITULO.test(l)) ?? ''
  const g = /gastos/i.test(titulo)
  const i = /ingresos/i.test(titulo)
  const kind: ExecKind | null = g && !i ? 'gastos' : i && !g ? 'ingresos' : null
  if (/Resumen por cap[ií]tulos/i.test(titulo))
    return { plantilla: 'resumen', kind, capitulos: null }
  if (/Estado de ejecuci[oó]n de/i.test(titulo))
    return { plantilla: 'estado', kind, capitulos: null }
  if (/Desglose de Operaciones/i.test(titulo)) {
    const capitulos = /capital|financier/i.test(titulo)
      ? [6, 7, 8, 9]
      : /corriente/i.test(titulo)
        ? [1, 2, 3, 4, 5]
        : null
    return { plantilla: 'desglose', kind, capitulos }
  }
  return { plantilla: null, kind, capitulos: null }
}

/**
 * Los nombres de los capítulos de la clasificación económica (Orden
 * EHA/3565/2008), sin tildes ni signos, con la variante que imprime el
 * Ayuntamiento («TRANSFERENCIA CORRIENTES»). El nombre no tiene aritmética que
 * lo compruebe; lo comprueba esto. Se publica el que se lee.
 */
export const CAPITULOS: Record<ExecKind, Record<number, string[]>> = {
  gastos: {
    1: ['GASTOS DE PERSONAL'],
    2: ['GASTOS CORRIENTES EN BIENES Y SERVICIOS'],
    3: ['GASTOS FINANCIEROS'],
    4: ['TRANSFERENCIAS CORRIENTES'],
    5: ['FONDO DE CONTINGENCIA Y OTROS IMPREVISTOS'],
    6: ['INVERSIONES REALES'],
    7: ['TRANSFERENCIAS DE CAPITAL'],
    8: ['ACTIVOS FINANCIEROS'],
    9: ['PASIVOS FINANCIEROS'],
  },
  ingresos: {
    1: ['IMPUESTOS DIRECTOS'],
    2: ['IMPUESTOS INDIRECTOS'],
    3: ['TASAS PRECIOS PUBLICOS Y OTROS INGRESOS'],
    4: ['TRANSFERENCIAS CORRIENTES', 'TRANSFERENCIA CORRIENTES'],
    5: ['INGRESOS PATRIMONIALES'],
    6: ['ENAJENACION DE INVERSIONES REALES'],
    7: ['TRANSFERENCIAS DE CAPITAL'],
    8: ['ACTIVOS FINANCIEROS'],
    9: ['PASIVOS FINANCIEROS'],
  },
}

const soloLetras = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')

function nombreConocido(kind: ExecKind, capitulo: number, label: string): boolean {
  return (CAPITULOS[kind][capitulo] ?? []).some((n) => soloLetras(n) === soloLetras(label))
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

/**
 * La fecha de impresión, «3 de Noviembre del 2025» → «03/11/2025». En la hoja
 * va al pie, no en la cabecera, así que se busca en todo el texto.
 */
export function fechaImpresaOcr(texto: string): string | null {
  for (const m of texto.matchAll(/(\d{1,2}) de ([A-Za-zÁÉÍÓÚáéíóú]+) del? (\d{4})/g)) {
    const mes = MESES.indexOf(m[2].toLowerCase()) + 1
    if (mes) return `${m[1].padStart(2, '0')}/${String(mes).padStart(2, '0')}/${m[3]}`
  }
  return null
}

/** Céntimos con formato español, para los motivos. */
function es(c: number): string {
  const s = (Math.abs(c) / 100).toFixed(2).split('.')
  return `${c < 0 ? '-' : ''}${s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${s[1]}`
}

/**
 * ¿Da el porcentaje impreso? `pct` en centésimas de punto («62,33%» → 6233); un
 * porcentaje impreso con dos decimales admite medio de su última cifra.
 */
function cuadraPct(ejecutado: number, base: number, pct: number): boolean {
  if (base === 0) return pct === 0
  return Math.abs((ejecutado / base) * 10000 - pct) <= 0.5 + 1e-9
}

const pctEs = (p: number) => `${es(p)} %`

function motivoDe(fallos: string[]): string {
  return fallos.length <= 3
    ? fallos.join('; ')
    : `${fallos.slice(0, 3).join('; ')} y ${fallos.length - 3} más`
}

const euros = (c: number) => c / 100

export interface LecturaValida {
  plantilla: 'resumen' | 'estado'
  doc: ExecDoc
  /** Las cifras de cada capítulo en céntimos, tal como se cotejaron: para el desglose. */
  importes: Record<number, number[]>
  motivo: null
}
export interface DesgloseLeido {
  plantilla: 'desglose'
  kind: ExecKind
  capitulos: number[]
  /** Los cinco importes de su fila «Total», en céntimos; null si no se leyó. */
  total: number[] | null
  motivo: null
}
export interface LecturaFallida {
  plantilla: PlantillaOcr | null
  motivo: string
}
export type LecturaOcr = LecturaValida | DesgloseLeido | LecturaFallida

interface Fila {
  capitulo: number | null
  label: string
  importes: number[]
  pcts: number[]
}

/**
 * Una fila de cifras: `n` importes y `p` porcentajes al final, en ese orden.
 * null si sobra o falta una celda o alguna no se deja leer.
 */
function cifrasDeFila(
  celdas: string[],
  n: number,
  p: number,
): { importes: number[]; pcts: number[] } | null {
  if (celdas.length !== n + p) return null
  const v = celdas.map(centimosOcr)
  if (v.some((x) => x == null)) return null
  for (let k = 0; k < n + p; k++) if (/%/.test(celdas[k]) !== k >= n) return null
  return { importes: v.slice(0, n) as number[], pcts: v.slice(n) as number[] }
}

const fechaListadoOcr = (texto: string) =>
  (texto.match(/Fecha de listado igual a:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i) || [])[1] ?? null
const anioOcr = (texto: string) => Number((texto.match(/Periodo:\s*(\d{4})/) || [])[1]) || 0

/**
 * «Resumen por capítulos» (desde el 3T de 2025): una fila por capítulo, del 1
 * al 9, y una fila «Total». Cinco importes y un porcentaje:
 *   gastos   créditos iniciales · definitivos · obligaciones reconocidas netas
 *            · pagos realizados · pagos de ejercicios cerrados · %
 *   ingresos previsiones iniciales · definitiva · derechos reconocidos netos ·
 *            recaudación líquida · recaudación de cerrados · %
 */
function leerResumen(texto: string, kind: ExecKind): LecturaOcr {
  const fallos: string[] = []
  const filas = new Map<number, Fila>()
  let total: Fila | null = null
  for (const linea of texto.split('\n')) {
    const celdas = celdasOcr(linea)
    if (!celdas.length) continue
    const cab = celdas[0].match(/^([1-9])(?:\s+(\D.*))?$/)
    // Una fila de capítulo trae cifras: un «1» suelto delante de la cabecera es ruido.
    if (cab && celdas.filter((c) => /\d/.test(c)).length > 2) {
      const capitulo = Number(cab[1])
      const label = (cab[2] ?? celdas[1] ?? '').trim()
      const cifras = cifrasDeFila(celdas.slice(cab[2] ? 1 : 2), 5, 1)
      if (!cifras)
        fallos.push(
          `la fila del capítulo ${capitulo} no trae cinco importes y un porcentaje legibles`,
        )
      else if (filas.has(capitulo)) fallos.push(`el capítulo ${capitulo} sale dos veces`)
      else filas.set(capitulo, { capitulo, label, ...cifras })
    } else if (/^Total$/i.test(celdas[0])) {
      const cifras = cifrasDeFila(celdas.slice(1), 5, 1)
      if (!cifras) fallos.push('la fila «Total» no trae cinco importes y un porcentaje legibles')
      else total = { capitulo: null, label: 'Total', ...cifras }
    }
  }
  for (let c = 1; c <= 9; c++)
    if (!filas.has(c) && !fallos.some((f) => f.includes(`capítulo ${c} `)))
      fallos.push(`falta el capítulo ${c}`)
  if (!total && !fallos.some((f) => f.includes('«Total»'))) fallos.push('falta la fila «Total»')
  if (fallos.length) return { plantilla: 'resumen', motivo: motivoDe(fallos) }

  const capitulos = [...filas.values()].sort((a, b) => a.capitulo! - b.capitulo!)
  for (const f of capitulos)
    if (!nombreConocido(kind, f.capitulo!, f.label))
      fallos.push(`el capítulo ${f.capitulo} se lee «${f.label}», que no es su nombre`)
  for (const f of [...capitulos, total!]) {
    const [, definitivo, ejecutado] = f.importes
    if (!cuadraPct(ejecutado, definitivo, f.pcts[0])) {
      const calc = definitivo ? Math.round((ejecutado / definitivo) * 10000) : 0
      const quien = f.capitulo ? `capítulo ${f.capitulo}` : 'total'
      fallos.push(`${quien}: imprime ${pctEs(f.pcts[0])} y sus cifras dan ${pctEs(calc)}`)
    }
  }
  for (let k = 0; k < 5; k++) {
    const suma = capitulos.reduce((s, f) => s + f.importes[k], 0)
    if (suma !== total!.importes[k])
      fallos.push(
        `la columna ${k + 1} suma ${es(suma)} y el total imprime ${es(total!.importes[k])}`,
      )
  }
  if (fallos.length) return { plantilla: 'resumen', motivo: motivoDe(fallos) }

  const linea = (f: Fila): Omit<ExecLine, 'capitulo' | 'label'> => {
    const [inicial, definitivo, ejecutado] = f.importes
    return {
      inicial: euros(inicial),
      modificaciones: euros(definitivo - inicial),
      actual: euros(definitivo),
      ejecutado: euros(ejecutado),
    }
  }
  return {
    plantilla: 'resumen',
    motivo: null,
    importes: Object.fromEntries(capitulos.map((f) => [f.capitulo!, f.importes])),
    doc: {
      kind,
      year: anioOcr(texto),
      fechaListado: fechaListadoOcr(texto),
      fechaImpresion: fechaImpresaOcr(texto),
      chapters: capitulos.map((f) => ({ capitulo: f.capitulo!, label: f.label, ...linea(f) })),
      total: linea(total!),
    },
  }
}

/**
 * La plantilla SICALWIN antigua de ingresos («Estado de ejecución de Ingresos»,
 * la del cierre de 2024): cada capítulo cierra con «Total Capítulo N …» en dos
 * líneas, y la hoja con «Total Ingresos».
 *   línea 1  Inicial · Actual · Compromisos · DR · DR Anul. · Deudores · I · I Netos · Saldo
 *   línea 2  Modific. · CIC pendiente · DR Netos · DR Canc. · OI · Dev. I · %DR s/Prev · % I Neto s/DRN
 * El ejecutado que se publica son los DR netos, los mismos que mide su
 * «%DR s/Prev» y los que trae la plantilla nueva.
 */
const L1 = { inicial: 0, actual: 1, dr: 3, anulados: 4, deudores: 5, i: 6, iNetos: 7, saldo: 8 }
const L2 = { modific: 9, drNetos: 11, cancelados: 12, devoluciones: 14 }

function identidades(v: number[], pcts: number[]): string[] {
  const f: string[] = []
  if (v[L2.modific] !== v[L1.actual] - v[L1.inicial])
    f.push('las modificaciones no son lo actual menos lo inicial')
  if (v[L2.drNetos] !== v[L1.dr] - v[L1.anulados] - v[L2.cancelados] - v[L2.devoluciones])
    f.push('los DR netos no son los DR menos anulados, cancelados y devoluciones')
  if (v[L1.iNetos] !== v[L1.i] - v[L2.devoluciones])
    f.push('los ingresos netos no son los ingresos menos las devoluciones')
  if (v[L1.deudores] !== v[L2.drNetos] - v[L1.iNetos])
    f.push('los deudores no son los DR netos menos lo ingresado')
  if (v[L1.saldo] !== v[L1.actual] - v[L2.drNetos])
    f.push('el saldo no es lo actual menos los DR netos')
  if (!cuadraPct(v[L2.drNetos], v[L1.actual], pcts[0]))
    f.push(`imprime ${pctEs(pcts[0])} de DR sobre previsión y sus cifras no lo dan`)
  if (!cuadraPct(v[L1.iNetos], v[L2.drNetos], pcts[1]))
    f.push(`imprime ${pctEs(pcts[1])} de ingreso sobre DR netos y sus cifras no lo dan`)
  return f
}

function leerEstado(texto: string, kind: ExecKind): LecturaOcr {
  if (kind !== 'ingresos')
    return { plantilla: 'estado', motivo: 'la plantilla antigua de gastos no se lee por OCR' }
  const lineas = texto
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const fallos: string[] = []
  const filas = new Map<number, Fila>()
  let total: Fila | null = null
  for (let n = 0; n < lineas.length; n++) {
    const cap = lineas[n].match(/^Total\s+Cap[ií]tulo\s+([1-9])\s+(.*)$/i)
    const tot = /^Total\s+Ingresos\b/i.test(lineas[n])
    if (!cap && !tot) continue
    const resto = cap ? celdasOcr(cap[2]) : celdasOcr(lineas[n].replace(/^Total\s+Ingresos/i, ''))
    const primera = resto.findIndex((c) => centimosOcr(c) != null)
    const label = cap
      ? resto.slice(0, Math.max(primera, 0)).join(' ').replace(/\.$/, '').trim()
      : 'Total'
    const a = primera >= 0 ? cifrasDeFila(resto.slice(primera), 9, 0) : null
    const b = cifrasDeFila(celdasOcr(lineas[n + 1] ?? ''), 6, 2)
    const quien = cap ? `capítulo ${cap[1]}` : '«Total Ingresos»'
    if (!a || !b) {
      fallos.push(`la fila del ${quien} no trae sus diecisiete cifras legibles`)
      continue
    }
    const fila: Fila = {
      capitulo: cap ? Number(cap[1]) : null,
      label,
      importes: [...a.importes, ...b.importes],
      pcts: b.pcts,
    }
    if (!cap) total = fila
    else if (filas.has(fila.capitulo!))
      continue // una cabecera repetida en la página siguiente
    else filas.set(fila.capitulo!, fila)
  }
  if (!total && !fallos.some((f) => f.includes('Total Ingresos')))
    fallos.push('falta la fila «Total Ingresos»')
  if (!filas.size) fallos.push('no se lee ningún «Total Capítulo»')
  if (fallos.length) return { plantilla: 'estado', motivo: motivoDe(fallos) }

  const capitulos = [...filas.values()].sort((a, b) => a.capitulo! - b.capitulo!)
  for (const f of capitulos)
    if (!nombreConocido(kind, f.capitulo!, f.label))
      fallos.push(`el capítulo ${f.capitulo} se lee «${f.label}», que no es su nombre`)
  for (const f of [...capitulos, total!])
    for (const x of identidades(f.importes, f.pcts))
      fallos.push(`${f.capitulo ? `capítulo ${f.capitulo}` : 'total'}: ${x}`)
  for (let k = 0; k < 15; k++) {
    const suma = capitulos.reduce((s, f) => s + f.importes[k], 0)
    if (suma !== total!.importes[k])
      fallos.push(
        `la columna ${k + 1} de los capítulos suma ${es(suma)} y «Total Ingresos» imprime ${es(total!.importes[k])}`,
      )
  }
  if (fallos.length) return { plantilla: 'estado', motivo: motivoDe(fallos) }

  const linea = (f: Fila): Omit<ExecLine, 'capitulo' | 'label'> => ({
    inicial: euros(f.importes[L1.inicial]),
    modificaciones: euros(f.importes[L2.modific]),
    actual: euros(f.importes[L1.actual]),
    ejecutado: euros(f.importes[L2.drNetos]),
  })
  return {
    plantilla: 'estado',
    motivo: null,
    importes: Object.fromEntries(capitulos.map((f) => [f.capitulo!, f.importes])),
    doc: {
      kind,
      year: anioOcr(texto),
      fechaListado: fechaListadoOcr(texto),
      fechaImpresion: fechaImpresaOcr(texto),
      chapters: capitulos.map((f) => ({ capitulo: f.capitulo!, label: f.label, ...linea(f) })),
      total: linea(total!),
    },
  }
}

/** La fila «Total» de un desglose: sus cinco importes, de la última que se lea. */
function totalDeDesglose(texto: string): number[] | null {
  let total: number[] | null = null
  for (const linea of texto.split('\n')) {
    const celdas = celdasOcr(linea)
    if (!/^Total$/i.test(celdas[0] ?? '')) continue
    const cifras = cifrasDeFila(celdas.slice(1), 5, 0)
    if (cifras) total = cifras.importes
  }
  return total
}

/** Lee una hoja sin capa de texto a partir de su OCR. */
export function leerHojaOcr(texto: string): LecturaOcr {
  const hoja = plantillaOcr(texto)
  if (!hoja.plantilla) return { plantilla: null, motivo: 'no se reconoce la plantilla de la hoja' }
  if (!hoja.kind)
    return { plantilla: hoja.plantilla, motivo: 'el título no dice si es de gastos o de ingresos' }
  if (hoja.plantilla === 'desglose') {
    if (!hoja.capitulos)
      return {
        plantilla: 'desglose',
        motivo: 'el título no dice si el desglose es corriente o de capital',
      }
    return {
      plantilla: 'desglose',
      kind: hoja.kind,
      capitulos: hoja.capitulos,
      total: totalDeDesglose(texto),
      motivo: null,
    }
  }
  return hoja.plantilla === 'resumen' ? leerResumen(texto, hoja.kind) : leerEstado(texto, hoja.kind)
}

/**
 * ¿Sirve esta lectura? Un resumen o un estado, si cuadran; un desglose, si se
 * leyó su fila «Total», que es para lo único que se lee.
 */
export function lecturaAceptable(l: LecturaOcr): l is LecturaValida | DesgloseLeido {
  return l.motivo === null && (l.plantilla !== 'desglose' || (l as DesgloseLeido).total != null)
}

export type Cotejo = { estado: 'coincide' | 'sin-total' } | { estado: 'contradice'; motivo: string }

/**
 * ¿Suma el resumen, en los capítulos que cubre el desglose, lo que imprime la
 * fila «Total» del desglose? Las dos son hojas distintas del mismo listado.
 * `sin-total` si no se leyó esa fila: no se ha cotejado, y no se dice que sí.
 */
export function cotejarDesglose(resumen: LecturaValida, desglose: DesgloseLeido): Cotejo {
  if (!desglose.total) return { estado: 'sin-total' }
  for (let k = 0; k < 5; k++) {
    const suma = desglose.capitulos.reduce((s, c) => s + (resumen.importes[c]?.[k] ?? 0), 0)
    if (suma !== desglose.total[k]) {
      const caps = `${desglose.capitulos[0]}–${desglose.capitulos[desglose.capitulos.length - 1]}`
      return {
        estado: 'contradice',
        motivo: `los capítulos ${caps} del resumen suman ${es(suma)} en la columna ${k + 1} y su desglose imprime ${es(desglose.total[k])}`,
      }
    }
  }
  return { estado: 'coincide' }
}
