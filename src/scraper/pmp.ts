/**
 * Periodo medio de pago a proveedores (PMP).
 *
 * Lo publica el Ministerio de Hacienda con la metodología del RD 1040/2017, y
 * es el mejor indicador de plazo que tiene este proyecto por tres razones que
 * no se juntan en ninguna otra fuente:
 *
 *  1. Tiene **umbral legal**. La Ley 3/2004 y la LOEPSF fijan 30 días. No hace
 *     falta que nadie opine si una cifra es alta.
 *  2. Tiene **serie**. Trimestre a trimestre desde 2018, en un solo fichero —
 *     justo lo que CESEL no da.
 *  3. Tiene **pares de verdad**: casi siete mil municipios en la misma tabla,
 *     calculados con la misma norma.
 *
 * La hoja «Tabla 6.3» son los municipios del grupo *variables* (los que no
 * están en el modelo de cesión, es decir los de menos de 75.000 habitantes),
 * que reportan trimestralmente. Sus columnas mensuales existen igualmente y
 * vienen vacías: por eso el parser distingue «sin dato» de cero y nunca
 * rellena un hueco.
 *
 * Parser puro — la descarga vive en scripts/scrape-pmp.ts.
 */
import * as XLSX from 'xlsx'

/** Días que la ley marca como referencia (Ley 3/2004, art. 4; LOEPSF art. 13.6). */
export const PLAZO_LEGAL_DIAS = 30

/** Hoja de municipios del grupo «variables», que es donde está Riba-roja. */
export const HOJA_MUNICIPIOS = 'Tabla 6.3'

export interface PuntoPmp {
  /** Normalizado: `2024-T2` o `2026-06`. La fuente mezcla ambos y su espaciado. */
  periodo: string
  dias: number
}

export interface PmpMunicipio {
  ine: string
  nombre: string
  ccaa: string
  provincia: string
  serie: PuntoPmp[]
}

export interface PmpDistribucion {
  periodo: string
  n: number
  p25: number
  mediana: number
  p75: number
}

/**
 * `S.1313-17-46-214-A-A-000` → `46214`.
 *
 * Sólo entidades `A-A` (ayuntamientos). Diputaciones, mancomunidades y
 * consorcios comparten tabla y no son unidades comparables.
 */
export function ineFromCodigoPmp(codigo: string): string | null {
  const m = /^S\.\d{4}-\d{2}-(\d{2})-(\d{3})-A-A-\d{3}$/.exec(String(codigo ?? '').trim())
  return m ? m[1] + m[2] : null
}

/**
 * La fuente escribe el mismo trimestre de tres maneras —`2018 - T2`,
 * `2023- T1`, `2025 - T1`— y los meses como `2026-06`. Sin normalizar, la serie
 * se ordena mal y los periodos no casan entre tablas.
 */
export function normalizarPeriodo(raw: unknown): string | null {
  const s = String(raw ?? '')
    .replace(/\s+/g, '')
    .trim()
  const trimestre = /^(\d{4})-?T([1-4])$/i.exec(s)
  if (trimestre) return `${trimestre[1]}-T${trimestre[2]}`
  const mes = /^(\d{4})-?(0[1-9]|1[0-2])$/.exec(s)
  if (mes) return `${mes[1]}-${mes[2]}`
  return null
}

interface Parsed {
  periodos: string[]
  municipios: PmpMunicipio[]
}

/** Lee la hoja de municipios entera: el propio y los pares salen del mismo sitio. */
export function parsePmpWorkbook(
  buffer: Buffer | ArrayBuffer,
  opts: { hoja?: string } = {},
): Parsed {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const hoja = wb.Sheets[opts.hoja ?? HOJA_MUNICIPIOS]
  if (!hoja) return { periodos: [], municipios: [] }
  const rows: unknown[][] = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: null })

  // La cabecera es la fila cuya primera celda dice «Código»: buscarla en vez de
  // fijar el índice deja el parser vivo si el ministerio añade una nota arriba.
  const iHead = rows.findIndex((r) => /^c[oó]digo$/i.test(String(r?.[0] ?? '').trim()))
  if (iHead < 0) return { periodos: [], municipios: [] }
  const head = rows[iHead]

  const columnas: { col: number; periodo: string }[] = []
  for (let c = 0; c < head.length; c++) {
    const p = normalizarPeriodo(head[c])
    if (p) columnas.push({ col: c, periodo: p })
  }

  const municipios: PmpMunicipio[] = []
  for (const r of rows.slice(iHead + 1)) {
    if (!r) continue
    const ine = ineFromCodigoPmp(String(r[0] ?? ''))
    if (!ine) continue
    const serie: PuntoPmp[] = []
    for (const { col, periodo } of columnas) {
      const v = r[col]
      // Un hueco NO es un cero. Las columnas mensuales de un municipio
      // trimestral vienen vacías, y rellenarlas con 0 pintaría un ayuntamiento
      // que paga el mismo día.
      if (typeof v === 'number' && Number.isFinite(v)) serie.push({ periodo, dias: v })
    }
    municipios.push({
      ine,
      nombre: String(r[3] ?? '').trim(),
      ccaa: String(r[1] ?? '').trim(),
      provincia: String(r[2] ?? '').trim(),
      serie,
    })
  }
  return { periodos: columnas.map((c) => c.periodo), municipios }
}

const cuantil = (ordenados: number[], q: number): number => {
  if (!ordenados.length) return 0
  const i = (ordenados.length - 1) * q
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return lo === hi ? ordenados[lo] : ordenados[lo] + (ordenados[hi] - ordenados[lo]) * (i - lo)
}

/** Reparto nacional de un periodo, para situar al municipio sin nombrar a 6.960. */
export function distribucionEn(
  municipios: PmpMunicipio[],
  periodo: string,
): PmpDistribucion | null {
  const vals = municipios
    .map((m) => m.serie.find((p) => p.periodo === periodo)?.dias)
    .filter((v): v is number => typeof v === 'number')
    .sort((a, b) => a - b)
  if (!vals.length) return null
  return {
    periodo,
    n: vals.length,
    p25: cuantil(vals, 0.25),
    mediana: cuantil(vals, 0.5),
    p75: cuantil(vals, 0.75),
  }
}

/** Qué porcentaje de municipios paga igual o más rápido. */
export function percentilEn(
  municipios: PmpMunicipio[],
  periodo: string,
  dias: number,
): number | null {
  const vals = municipios
    .map((m) => m.serie.find((p) => p.periodo === periodo)?.dias)
    .filter((v): v is number => typeof v === 'number')
  if (!vals.length) return null
  return Math.round((100 * vals.filter((v) => v <= dias).length) / vals.length)
}
