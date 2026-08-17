/**
 * Infracciones penales por municipio, del Portal Estadístico de Criminalidad.
 *
 * Es el primer RESULTADO del panel de eficiencia: la tarjeta de policía local
 * publica su coste (p85 de la banda) y hasta ahora terminaba en «la fuente no
 * publica ningún indicador de resultado con el que contrastarlo». Éste es ese
 * indicador — publicado AL LADO del coste, nunca dividido por él, y con la
 * frase no-causal delante: el SEC agrega los hechos conocidos por TODOS los
 * cuerpos (Policía Nacional, Guardia Civil y policías locales), así que la
 * cifra no es producto del servicio municipal ni de nadie en concreto.
 *
 * ## La fuente, medida antes de escribir esto
 *
 * Los balances viven en un Jaxi con GET plano y una gramática determinista:
 *
 *   /sec/jaxiPx/files/_px/es/csv/DatosBalanceAnt/l0/{ID}.csv
 *   ID = (año − 2010) ++ "09" ++ pad3((trimestre − 1) · 3 + nivel)
 *   nivel 3 = municipios >20.000 hab (431 filas desde 2021)
 *
 * Los periodos son ACUMULADOS (T4 = enero–diciembre), así que la serie anual
 * sale de los balances T4 y de nada más; publicar un T2 como si fuera medio
 * año comparable sería falso (cada fichero trae además el MISMO periodo del
 * año anterior — el balance de 2021 regala 2020). Dos roturas de esquema que
 * este parser absorbe y sus fixtures fijan:
 *
 *   · 2023→2024 las filas de municipio ganan el código INE; antes sólo nombre.
 *   · 2021→2022 el árbol gana el desglose convencional/ciber y el TOTAL cambia
 *     de etiqueta. El total se lee SIEMPRE de la fila TOTAL de su era: sumarlo
 *     aquí contaría los sub-epígrafes (5.1, 7.1) dos veces.
 *
 * Reutilización: Ley 37/2007 y RD 1495/2011, con atribución obligatoria
 * «Origen de los datos: Portal Estadístico de Criminalidad».
 *
 * Parser puro — la descarga vive en scripts/scrape-criminalidad.ts.
 */

/** Etiqueta del total desde 2022 (árbol convencional + ciber). */
export const TOTAL_2022_EN_ADELANTE = 'III. TOTAL INFRACCIONES PENALES'
/** Etiqueta del total en 2021 (árbol plano). */
export const TOTAL_2021 = 'TOTAL INFRACCIONES PENALES'

export interface MunicipioCrimen {
  /** Código INE de 5 dígitos, o `null` en la era sin código (≤2023). */
  ine: string | null
  nombre: string
  /** Total de infracciones penales por año natural, leído de la fila TOTAL. */
  totales: Record<number, number>
}

/** «1.417» → 1417 · «-1,7» → -1.7 · vacío → null. */
function numero(celda: string | undefined): number | null {
  const s = (celda ?? '').trim()
  if (!s) return null
  const n = Number(s.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * Lee un balance municipal (CSV Jaxi, tabulado, UTF-8 pese a la cabecera HTTP
 * que declara ISO). Devuelve un municipio por bloque de geografía municipal;
 * las comunidades y provincias del mismo fichero no pasan.
 */
export function parseBalanceMunicipal(
  texto: string,
  opts: { anioActual: number },
): MunicipioCrimen[] {
  // El BOM va como escape y no como carácter literal: el literal es invisible
  // en un diff y dispara no-irregular-whitespace.
  const lineas = texto.replace(/^\uFEFF/, '').split('\n')
  const anioActual = opts.anioActual
  const anioAnterior = anioActual - 1

  const etiquetaTotal = anioActual >= 2022 ? TOTAL_2022_EN_ADELANTE : TOTAL_2021

  const out: MunicipioCrimen[] = []
  let actual: MunicipioCrimen | null = null

  for (const linea of lineas) {
    if (!linea.trim()) continue
    const esGeo = !/^[\s\t]/.test(linea)
    if (esGeo) {
      // Una geografía municipal es «46214 Nombre» (era con código) o
      // «-Municipio de Nombre» (era sin él). Todo lo demás —comunidades,
      // provincias, la cabecera— no produce municipio.
      const geo = linea.replace(/\t+$/, '').trim()
      const conCodigo = /^(\d{5})\s+(.+)$/.exec(geo)
      const sinCodigo = /^-Municipio de\s+(.+)$/.exec(geo)
      if (conCodigo) {
        actual = { ine: conCodigo[1], nombre: conCodigo[2], totales: {} }
        out.push(actual)
      } else if (sinCodigo) {
        actual = { ine: null, nombre: sinCodigo[1], totales: {} }
        out.push(actual)
      } else {
        actual = null
      }
      continue
    }
    if (!actual) continue
    const celdas = linea.split('\t')
    const categoria = celdas[0]?.trim()
    if (categoria !== etiquetaTotal) continue
    const anterior = numero(celdas[1])
    const presente = numero(celdas[2])
    if (anterior !== null) actual.totales[anioAnterior] = anterior
    if (presente !== null) actual.totales[anioActual] = presente
  }
  return out
}

/**
 * Une los balances de varios años en una serie por municipio.
 *
 * La clave es el INE cuando existe; para la era sin código, el nombre
 * normalizado. Cuando dos ficheros traen el mismo año (el balance de 2022
 * repite 2021), gana el fichero MÁS RECIENTE: es el que incorpora las
 * revisiones del portal.
 */
export function unirBalances(
  balances: { anioActual: number; filas: MunicipioCrimen[] }[],
): MunicipioCrimen[] {
  // La unión es SIEMPRE por nombre normalizado: es lo único que las dos eras
  // comparten. Con el INE de clave, «46214 Riba-roja de Túria» (2024) y
  // «-Municipio de Riba-roja de Túria» (2021) eran dos municipios distintos y
  // la serie perdía en silencio sus tres primeros años — exactamente la rotura
  // de esquema que el fixture de dos eras existe para no olvidar. El código
  // INE se conserva en cuanto alguna era lo trae.
  const porNombre = new Map<string, MunicipioCrimen>()
  for (const b of [...balances].sort((x, y) => x.anioActual - y.anioActual)) {
    for (const m of b.filas) {
      const k = normalizaNombre(m.nombre)
      const previo = porNombre.get(k)
      if (!previo) {
        porNombre.set(k, { ...m, totales: { ...m.totales } })
        continue
      }
      if (m.ine) previo.ine = m.ine
      // El fichero más reciente pisa al viejo en los años repetidos: es el que
      // incorpora las revisiones del portal.
      Object.assign(previo.totales, m.totales)
    }
  }
  return [...porNombre.values()]
}

/** Para casar «Jávea/Xàbia» consigo mismo entre eras y con el roster CONPREL. */
export function normalizaNombre(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}
