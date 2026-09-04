/**
 * Deuda viva de los ayuntamientos — el saldo que el municipio DEBE.
 *
 * Fuente: Ministerio de Hacienda, Central de Información Económico-Financiera,
 * `deuda-viva-ayuntamientos-<AAAA>12.xlsx`. Un fichero por ejercicio, con los
 * ~8.100 ayuntamientos de España y su saldo a 31 de diciembre.
 *
 * No es lo que ya enseña `/presupuesto`. Allí el capítulo «Deuda pública» es el
 * dinero que el presupuesto aparta ESE año para atender deuda; esto es el saldo
 * vivo. Un vecino que pregunta «¿cuánto debe mi ayuntamiento?» pregunta por lo
 * segundo, y hasta ahora el sitio no lo sabía.
 *
 * Dos cosas que este módulo hace a propósito:
 *
 * · **Casa por código INE, jamás por nombre.** Buscar «Riba-roja» en el libro
 *   encuentra ANTES `Riba-roja d'Ebre`, en Tarragona, que es otro municipio con
 *   otra deuda. El libro trae provincia y municipio en columnas separadas, así
 *   que la clave existe y es exacta: 46 + 214.
 * · **Convierte a euros.** La columna viene rotulada «(miles de euros)».
 *
 * Puro: no toca red ni disco. El CLI le pasa el buffer.
 */
import * as XLSX from 'xlsx'

export interface DeudaVivaMunicipio {
  /** Ejercicio al que se refiere el saldo, leído del fichero. */
  ejercicio: number
  /** Fecha del saldo — siempre el 31 de diciembre del ejercicio. */
  fecha: string
  ineCode: string
  municipio: string
  provincia: string
  comunidad: string
  /** Saldo vivo en EUROS. El libro lo publica en miles. */
  deudaEuros: number
}

/** Las columnas del libro, por su posición en la fila de cabecera. */
const COL = {
  ejercicio: 0,
  comunidad: 2,
  codProvincia: 3,
  provincia: 4,
  codMunicipio: 5,
  municipio: 6,
  deudaMiles: 7,
} as const

const limpia = (v: unknown): string => String(v ?? '').trim()

/**
 * El saldo de UN municipio, o `null` si el libro no lo trae.
 *
 * `null` es un desenlace, no un fallo: un municipio puede no estar en una
 * entrega. Devolver 0 en su lugar publicaría «no debe nada» de algo que no se
 * ha mirado.
 */
export function parseDeudaViva(
  buffer: Buffer | ArrayBuffer | Uint8Array,
  opts: { ineCode: string; sheetName?: string },
): DeudaVivaMunicipio | null {
  const provincia = opts.ineCode.slice(0, 2)
  const municipio = opts.ineCode.slice(2)
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const nombreHoja = opts.sheetName ?? 'Datos'
  const hoja = wb.Sheets[nombreHoja] ?? wb.Sheets[wb.SheetNames[0]]
  if (!hoja) return null
  const filas: unknown[][] = XLSX.utils.sheet_to_json(hoja, {
    header: 1,
    raw: true,
    defval: null,
  })

  for (const f of filas) {
    if (limpia(f[COL.codProvincia]) !== provincia) continue
    if (limpia(f[COL.codMunicipio]) !== municipio) continue
    const miles = f[COL.deudaMiles]
    if (typeof miles !== 'number') continue
    const ejercicio = Number(limpia(f[COL.ejercicio]))
    if (!Number.isFinite(ejercicio)) continue
    return {
      ejercicio,
      fecha: `${ejercicio}-12-31`,
      ineCode: opts.ineCode,
      municipio: limpia(f[COL.municipio]),
      provincia: limpia(f[COL.provincia]),
      comunidad: limpia(f[COL.comunidad]),
      // Redondeo al euro: el libro da miles con decimales y un céntimo
      // arrastrado de una división no significa nada aquí.
      deudaEuros: Math.round(miles * 1000),
    }
  }
  return null
}

/**
 * Las URL candidatas del libro de un ejercicio.
 *
 * El ministerio no nombra igual todas las entregas: 2022–2025 son
 * `deuda-viva-ayuntamientos-<AAAA>12.xlsx` y 2021 es `-<AAAA>1231.xlsx`. Con un
 * solo patrón el raspador daba 2021 por «no publicado» teniendo el fichero
 * delante, que es informar una ausencia inventada.
 */
export function urlsDeuda(anio: number): string[] {
  const base =
    'https://www.hacienda.gob.es/cdi/' +
    encodeURIComponent('sist financiacion y deuda') +
    `/informacioneells/${anio}/deuda-viva-ayuntamientos-`
  return [`${base}${anio}12.xlsx`, `${base}${anio}1231.xlsx`]
}

/** El reparto nacional, en euros y sin nombrar a ningún municipio. */
export interface RepartoDeuda {
  n: number
  /** Cuántos declaran CERO. Medido: 5.243 de 8.134, así que la mediana es 0 €. */
  aCero: number
  mediana: number
  p75: number
  p90: number
}

/**
 * El reparto a partir de los saldos en MILES de euros que trae el libro.
 *
 * Se publica el reparto y nunca la tabla: nombrar a ocho mil ayuntamientos
 * sería firmar una afirmación sobre cada uno de ellos, y aquí no tienen derecho
 * de réplica. Es la misma línea que traza `/laboratorio/frontera`.
 */
export function repartoDeuda(milesDeEuros: number[]): RepartoDeuda | null {
  const v = [...milesDeEuros].sort((a, b) => a - b)
  if (v.length === 0) return null
  const en = (q: number) => Math.round(v[Math.floor((v.length - 1) * q)] * 1000)
  return {
    n: v.length,
    aCero: v.filter((x) => x === 0).length,
    mediana: en(0.5),
    p75: en(0.75),
    p90: en(0.9),
  }
}

/**
 * En qué percentil queda un saldo dentro del reparto. Redondeado al entero:
 * más precisión de la que sostiene una tabla con 5.243 empates a cero.
 */
export function percentilDeuda(milesDeEuros: number[], euros: number): number | null {
  if (milesDeEuros.length === 0) return null
  const bajo = milesDeEuros.filter((x) => x * 1000 < euros).length
  return Math.round((bajo / milesDeEuros.length) * 100)
}
