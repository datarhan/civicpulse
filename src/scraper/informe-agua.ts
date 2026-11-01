/**
 * El informe anual «Calidad del agua de consumo humano en España» del
 * Ministerio de Sanidad, Anexo I: una fila por zona de abastecimiento con los
 * boletines del AÑO ENTERO. Es la otra mitad de SINAC: la consulta ciudadana
 * (`sinac.ts`) enseña los últimos boletines de cada red, unos pocos; este
 * anexo cuenta todos los del año, cientos en la zona principal. Sin él, «de los
 * boletines que se ven, ninguno salió no apto» se leía como «nunca», y el
 * informe de 2021 cuenta 55 «no apto» en la zona principal.
 *
 * Lo que el contrato (`tests/parse-informe-agua.test.ts`) fija:
 *
 *  - **Dos formatos, sin traducir uno en otro.** Hasta 2022 el anexo da
 *    recuentos (apto / no apto / sin calificar / total); desde 2023 sólo
 *    «% Aptos». Un 99,1 % no dice cuántos fueron «no apto» y cuántos «sin
 *    calificar», así que no se deduce un recuento de un porcentaje.
 *  - **Las definiciones son del año.** «Apto» incluía «con no conformidad» en
 *    2021 y no lo nombra en 2022; «No apto» incluye «con riesgos para la
 *    salud». Viajan tal cual en el snapshot.
 *  - **Control de columnas.** apto + no apto + sin calificar = total, o la
 *    lectura está desalineada y se lanza. Una fila sin cifras es null.
 *  - **El señuelo.** RIBA-ROJA D'EBRE es Tarragona: el patrón la excluye.
 *
 * Módulo puro: recibe el texto de `pdftotext -layout`; el CLI descarga.
 */

/** La zona que abastece el casco urbano (su boletín en SINAC lo dice así). */
export const ZONA_PRINCIPAL = 'RIBA-ROJA DE TURIA 1'

const ZONA = /\b(RIBA\s*-?\s*ROJA|RIBARROJA)\b/i
const SENUELO = /D'EBRE/i

export type FormatoAnexo = 'recuento' | 'porcentaje'

export interface FilaRecuento {
  formato: 'recuento'
  zona: string
  zonaNormalizada: string
  poblacion: number | null
  apto: number | null
  noApto: number | null
  sinCalificar: number | null
  total: number | null
}

export interface FilaPorcentaje {
  formato: 'porcentaje'
  zona: string
  zonaNormalizada: string
  boletines: number | null
  pctAptos: number | null
  poblacion: number | null
}

export type FilaAnexo = FilaRecuento | FilaPorcentaje

/** «21.584» → 21584, «99,1» → 99.1, «-» → null. */
function numero(t: string): number | null {
  const s = t.trim()
  if (s === '-' || s === '') return null
  if (!/^\d{1,3}(?:\.\d{3})*(?:,\d+)?$|^\d+(?:,\d+)?$/.test(s))
    throw new Error(`[informe-agua] «${t}» no es una cifra`)
  return Number(s.replace(/\./g, '').replace(',', '.'))
}

export function formatoAnexo(texto: string): FormatoAnexo {
  if (/%\s*Aptos/.test(texto)) return 'porcentaje'
  if (/Calificar/.test(texto)) return 'recuento'
  throw new Error('[informe-agua] no reconozco la cabecera del anexo — ¿cambió el formato?')
}

/** Las notas (*) y (**) de la tabla, la primera vez que aparecen bien escritas. */
export function definicionesAnexo(texto: string): { apto: string | null; noApto: string | null } {
  const limpia = (s: string | undefined) => (s ? s.replace(/\s+/g, ' ').trim() : null)
  return {
    apto: limpia(texto.match(/^\s*\(\*\)\s*(Boletines Aptos[^\n]*)/m)?.[1]),
    noApto: limpia(texto.match(/^\s*\(\*\*\)\s*(Boletines No Aptos[^\n]*)/m)?.[1]),
  }
}

/** Mayúsculas, guiones sin espacios alrededor, espacios simples. */
export function normalizarZona(z: string): string {
  return z
    .toUpperCase()
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Las filas de Riba-roja de una página (o del anexo entero) de texto. */
export function filasRibaRoja(texto: string): FilaAnexo[] {
  const formato = formatoAnexo(texto)
  const filas: FilaAnexo[] = []
  for (const linea of texto.split('\n')) {
    if (!ZONA.test(linea) || SENUELO.test(linea)) continue
    // `pdftotext -layout` separa las columnas con dos o más espacios.
    const celdas = linea.trim().split(/\s{2,}/)
    const iZona = celdas.findIndex((c) => ZONA.test(c))
    const zona = celdas[iZona].replace(/\s+/g, ' ')
    const cifras = celdas.slice(iZona + 1).map(numero)
    const base = { zona, zonaNormalizada: normalizarZona(zona) }

    if (formato === 'porcentaje') {
      if (cifras.length !== 3)
        throw new Error(`[informe-agua] «${zona}»: ${cifras.length} columnas, esperaba 3`)
      const [boletines, pctAptos, poblacion] = cifras
      filas.push({ formato, ...base, boletines, pctAptos, poblacion })
      continue
    }

    let poblacion: number | null = null
    let resto: (number | null)[]
    if (cifras.length === 0) resto = [null, null, null, null]
    else if (cifras.length === 5) [poblacion, ...resto] = cifras
    else if (cifras.length === 4) resto = cifras
    else throw new Error(`[informe-agua] «${zona}»: ${cifras.length} columnas, esperaba 4 o 5`)
    const [apto, noApto, sinCalificar, total] = resto
    if (total !== null && (apto ?? 0) + (noApto ?? 0) + (sinCalificar ?? 0) !== total)
      throw new Error(
        `[informe-agua] «${zona}»: ${apto} + ${noApto} + ${sinCalificar} no suma ${total} — columnas desalineadas`,
      )
    filas.push({ formato, ...base, poblacion, apto, noApto, sinCalificar, total })
  }
  return filas
}

export type PuntoZona =
  | {
      anio: number
      formato: 'recuento'
      noApto: number
      total: number
      sinCalificar: number
      filas: number
    }
  | { anio: number; formato: 'porcentaje'; boletines: number; pctAptos: number; filas: number }

/**
 * Un punto por año para una zona. Si un año de recuento la lista más de una vez
 * (2022: con y sin guion, una con población y otra sin ella), se suman sus
 * filas y `filas` lo dice. En un año de porcentaje no se suman porcentajes: dos
 * filas lanzan. Un año sin cifras para la zona no tiene punto.
 */
export function serieZona(
  anios: { anio: number; formato: FormatoAnexo; filas: FilaAnexo[] }[],
  zona: string,
): PuntoZona[] {
  const out: PuntoZona[] = []
  for (const a of [...anios].sort((x, y) => x.anio - y.anio)) {
    const suyas = a.filas.filter((f) => f.zonaNormalizada === zona)
    if (a.formato === 'recuento') {
      const r = suyas.filter((f): f is FilaRecuento => f.formato === 'recuento' && f.total !== null)
      if (!r.length) continue
      out.push({
        anio: a.anio,
        formato: 'recuento',
        noApto: r.reduce((s, f) => s + (f.noApto ?? 0), 0),
        total: r.reduce((s, f) => s + (f.total ?? 0), 0),
        sinCalificar: r.reduce((s, f) => s + (f.sinCalificar ?? 0), 0),
        filas: r.length,
      })
    } else {
      const p = suyas.filter(
        (f): f is FilaPorcentaje =>
          f.formato === 'porcentaje' && f.boletines !== null && f.pctAptos !== null,
      )
      if (!p.length) continue
      if (p.length > 1)
        throw new Error(`[informe-agua] ${a.anio}: «${zona}» aparece ${p.length} veces con %`)
      out.push({
        anio: a.anio,
        formato: 'porcentaje',
        boletines: p[0].boletines as number,
        pctAptos: p[0].pctAptos as number,
        filas: 1,
      })
    }
  }
  return out
}
