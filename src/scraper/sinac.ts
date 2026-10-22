/**
 * SINAC — calidad del agua de consumo, red a red. El primer resultado de
 * /eficiencia que no viene de una agregación: cada análisis es un boletín que
 * el gestor (aquí HIDRAQUA) notifica al Ministerio de Sanidad, con su fecha,
 * su calificación y el valor de cada parámetro legal (RD 3/2023).
 *
 * La consulta ciudadana es un formulario con sesión, sin descarga: el CLI
 * (`scripts/scrape-agua.ts`) hace los POST y este módulo sólo lee el HTML.
 * Tres cosas que el contrato (`tests/parse-sinac.test.ts`) fija porque la
 * página las pone fáciles de leer mal:
 *
 *  1. **Un parámetro sin cifra es `null`, nunca 0.** El boletín publica la
 *     unidad sola cuando el laboratorio no lo midió («Acrilamida µg/L»), y la
 *     red escribe «Sin datos en SINAC». Leerlo como 0 afirmaría que se midió y
 *     salió limpio (DATA_INTEGRITY.md, modo 6).
 *  2. **La calificación es una frase del ministerio**, y se traduce sólo si es
 *     una de las conocidas, por igualdad, nunca por parecido: «APTA» está
 *     dentro de «NO APTA». La frase original viaja al lado
 *     (`calificacionTexto`), para que el censo de vocabulario vigile al origen
 *     y no a nuestra traducción. «Gestionada por la Consejería» no dice apta
 *     ni no apta: es su propio valor.
 *  3. **La página sólo enseña los últimos** (10 de control, 10 completos, 5 de
 *     radiactividad). Lo que deja de enseñar no se ha borrado de la realidad,
 *     así que `fusionarBoletines` archiva: el snapshot crece, y lo recién leído
 *     manda sobre lo archivado si el ministerio corrige un boletín.
 *
 * Números: los parámetros llevan punto DECIMAL («0.67», «245.000» mg/L son
 * doscientos cuarenta y cinco); la población y el precio van en es-ES
 * («2.280», «0,81»). Dos lectores distintos, a propósito.
 *
 * Módulo puro: sin red, sin ficheros.
 */
import { load, type CheerioAPI } from 'cheerio'

/** Las frases de calificación que sabemos leer. Cualquier otra es `null`. */
export const CALIFICACIONES = ['apta', 'no-apta', 'gestionada-consejeria'] as const
export type Calificacion = (typeof CALIFICACIONES)[number]

/** Las secciones de boletines de la ficha de una red. */
export const TIPOS_ANALISIS = ['control', 'completo', 'radiactividad', 'vigilancia'] as const
export type TipoAnalisis = (typeof TIPOS_ANALISIS)[number]

export interface Red {
  idRed: number
  nombre: string
}

export interface Parametro {
  nombre: string
  /** `null` cuando la fuente no publica cifra: no medido, no cero. */
  valor: number | null
  unidad: string | null
  /** Sólo en la ficha de la red (último valor notificado), ISO. */
  fecha?: string | null
  codigo?: string | null
}

export interface Boletin {
  id: number
  idRed: number
  tipo: TipoAnalisis
  /** Fecha de toma, ISO (la hora, cuando la hay, se descarta). */
  fecha: string
  calificacion: Calificacion | null
  /** La frase del ministerio, tal cual. */
  calificacionTexto: string
  /** Sólo cuando se ha leído el detalle del boletín. */
  parametros?: Parametro[]
}

export interface DetalleRed {
  gestor: string | null
  responsable: string | null
  localidades: string[]
  suministro: { localidad: string; poblacion: number | null; pct: number | null }[]
  dotacionLHabDia: number | null
  precioEurM3: number | null
  /** Sin `idRed`: lo pone quien sabe qué red pidió. */
  boletines: Omit<Boletin, 'idRed'>[]
  parametros: Parametro[]
}

export interface DetalleBoletin {
  id: number
  red: string | null
  puntoMuestreo: string | null
  zona: string | null
  fecha: string | null
  tipoBoletin: string | null
  tipoAnalisis: string | null
  calificacion: Calificacion | null
  calificacionTexto: string
  parametros: Parametro[]
}

const limpio = (s: string | undefined | null) => (s ?? '').replace(/\s+/g, ' ').trim()

/** «11/10/2024 10:57» → «2024-10-11». Lo que no tenga esa forma es null. */
export function fechaIso(s: string): string | null {
  const m = limpio(s).match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

/** Valor de parámetro: punto decimal. Vacío o texto → null. */
function numeroPunto(s: string): number | null {
  const t = limpio(s)
  if (!/^-?\d+(?:\.\d+)?$/.test(t)) return null
  return Number(t)
}

/** es-ES: punto de millar, coma decimal («2.280», «314,38 L/Hab/día»). */
function numeroEs(s: string): number | null {
  const m = limpio(s).match(/^-?[\d.]+(?:,\d+)?/)
  if (!m) return null
  const n = Number(m[0].replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const FRASES: ReadonlyArray<readonly [RegExp, Calificacion]> = [
  [/^AGUA APTA PARA EL CONSUMO$/, 'apta'],
  [/^AGUA NO APTA PARA EL CONSUMO$/, 'no-apta'],
  // La página la sirve con la tilde rota («Calificaci�n … Consejer�a»): se
  // reconoce por lo que no se rompe.
  [/^CALIFICACI.{1,3}N GESTIONADA POR LA CONSEJER.{1,3}A$/, 'gestionada-consejeria'],
]

/** La frase del ministerio → nuestra calificación, por igualdad. */
export function calificacion(texto: string): Calificacion | null {
  const t = limpio(texto).toUpperCase()
  for (const [re, c] of FRASES) if (re.test(t)) return c
  return null
}

function tipoDeLeyenda(legend: string): TipoAnalisis | null {
  const l = limpio(legend).toLowerCase()
  if (!l.startsWith('análisis de')) return null
  if (l.includes('control')) return 'control'
  if (l.includes('completo')) return 'completo'
  if (l.includes('radiactividad')) return 'radiactividad'
  if (l.includes('vigilancia')) return 'vigilancia'
  return null
}

/** Las redes de distribución de un municipio (`informacionRedes.do`). */
export function parseRedes(html: string): Red[] {
  const $ = load(html)
  const redes: Red[] = []
  $('a[href^="javascript:eleccionRedDistribucion("]').each((_, a) => {
    const m = ($(a).attr('href') ?? '').match(/eleccionRedDistribucion\((\d+)\)/)
    if (m) redes.push({ idRed: Number(m[1]), nombre: limpio($(a).text()) })
  })
  return redes
}

/** Filas «etiqueta | valor» de una tabla de cabecera. */
function pares($: CheerioAPI, scope: string): Map<string, string> {
  const out = new Map<string, string>()
  $(scope)
    .find('tr')
    .each((_, tr) => {
      const tds = $(tr).children('td')
      if (tds.length !== 2) return
      const k = limpio($(tds[0]).text())
      if (k && !out.has(k)) out.set(k, $(tds[1]).html() ?? '')
    })
  return out
}

const texto = ($: CheerioAPI, html: string | undefined) => limpio(load(html ?? '').text())

/** La ficha de una red (`informacionAbastecimientoActionDetalleRed.do`). */
export function parseDetalleRed(html: string): DetalleRed {
  const $ = load(html)
  const red = pares($, '#contenidoPestaniaCaracteristicas')
  const localidades = (red.get('Localidades abastecidas') ?? '')
    .split(/<br\s*\/?>/i)
    .map((s) => texto($, s))
    .filter(Boolean)

  const suministro: DetalleRed['suministro'] = []
  $('fieldset.bloqueFieldsetU').each((_, fs) => {
    if (limpio($(fs).children('legend').first().text()) !== 'Suministro') return
    $(fs)
      .find('tr')
      .each((_, tr) => {
        const tds = $(tr).children('td.negrita')
        if (tds.length !== 3) return
        suministro.push({
          localidad: limpio($(tds[0]).text()),
          poblacion: numeroEs($(tds[1]).text()),
          pct: numeroEs($(tds[2]).text()),
        })
      })
  })

  const dotacion = $('th#dotacion').closest('tr').children('td').last().text()

  let precio: number | null = null
  $('td.negrita').each((_, td) => {
    if (precio === null && limpio($(td).text()) === 'Euros/metro cúbico:')
      precio = numeroEs($(td).next('td').text())
  })

  const boletines: DetalleRed['boletines'] = []
  $('fieldset.bloqueFieldsetU').each((_, fs) => {
    const tipo = tipoDeLeyenda($(fs).children('legend').first().text())
    if (!tipo) return
    $(fs)
      .find('tbody > tr')
      .each((_, tr) => {
        const tds = $(tr).children('td')
        const m = ($(tr).find('a[href*="verDetalle("]').attr('href') ?? '').match(
          /verDetalle\((\d+)\)/,
        )
        const fecha = fechaIso($(tds[0]).text())
        if (!m || !fecha) return
        const frase = limpio($(tds[1]).text())
        boletines.push({
          id: Number(m[1]),
          tipo,
          fecha,
          calificacion: calificacion(frase),
          calificacionTexto: frase,
        })
      })
  })

  const parametros: Parametro[] = []
  $('fieldset.bloqueFieldsetU').each((_, fs) => {
    const legend = limpio($(fs).children('legend').first().text())
    if (!legend.startsWith('Últimos valor notificado')) return
    $(fs)
      .find('tbody > tr')
      .each((_, tr) => {
        const tds = $(tr).children('td')
        if (tds.length !== 6) return
        parametros.push({
          codigo: limpio($(tds[0]).text()) || null,
          nombre: limpio($(tds[1]).text()),
          valor: numeroPunto($(tds[2]).text()),
          unidad: limpio($(tds[3]).text()) || null,
          fecha: fechaIso($(tds[4]).text()),
        })
      })
  })

  return {
    gestor: texto($, red.get('Gestor')) || null,
    responsable: texto($, red.get('Responsable')) || null,
    localidades,
    suministro,
    dotacionLHabDia: numeroEs(dotacion),
    precioEurM3: precio,
    boletines,
    parametros,
  }
}

/** El detalle de un boletín (`detalleBoletin.do`). */
export function parseBoletin(html: string): DetalleBoletin {
  const $ = load(html)
  const cab = pares($, 'body')
  const get = (k: string) => texto($, cab.get(k)) || null
  const id = Number(limpio($('body').text()).match(/Código:\s*(\d+)/)?.[1] ?? NaN)

  let frase = ''
  const parametros: Parametro[] = []
  $('fieldset.bloqueFieldsetU').each((_, fs) => {
    const legend = limpio($(fs).children('legend').first().text())
    if (legend === 'Calificacion de la muestra') frase = limpio($(fs).find('label').first().text())
    if (!legend.startsWith('Parametros')) return
    $(fs)
      .find('tbody > tr')
      .each((_, tr) => {
        const tds = $(tr).children('td')
        if (tds.length !== 3) return
        parametros.push({
          nombre: limpio($(tds[0]).text()),
          valor: numeroPunto($(tds[1]).text()),
          unidad: limpio($(tds[2]).text()) || null,
        })
      })
  })

  return {
    id,
    red: get('Red'),
    puntoMuestreo: get('Punto de muestreo'),
    zona: get('Zona abastecimiento'),
    fecha: fechaIso(get('Fecha de toma') ?? ''),
    tipoBoletin: get('Tipo de Boletin'),
    tipoAnalisis: get('Tipo de analisis'),
    calificacion: calificacion(frase),
    calificacionTexto: frase,
    parametros,
  }
}

/**
 * El archivo: lo ya guardado más lo recién leído, por id, lo nuevo mandando.
 * Ordenado por fecha descendente (y por id, para que el orden sea estable).
 */
export function fusionarBoletines<T extends { id: number; fecha: string }>(
  archivados: T[],
  leidos: T[],
): T[] {
  const porId = new Map<number, T>()
  for (const b of archivados) porId.set(b.id, b)
  for (const b of leidos) porId.set(b.id, { ...porId.get(b.id), ...b })
  return [...porId.values()].sort((a, b) =>
    a.fecha === b.fecha ? b.id - a.id : a.fecha < b.fecha ? 1 : -1,
  )
}

/**
 * Media anual de un parámetro en los análisis COMPLETOS de una red. Sólo los
 * completos: los de control miden una lista corta y mezclarlos movería la
 * media por el tipo de análisis, no por el agua. Cada punto lleva su `n`,
 * porque un año con un solo análisis no es lo mismo que uno con dos.
 */
export function serieParametro(
  boletines: Boletin[],
  idRed: number,
  parametro: string,
): { anio: number; valor: number; n: number }[] {
  const porAnio = new Map<number, number[]>()
  for (const b of boletines) {
    if (b.idRed !== idRed || b.tipo !== 'completo') continue
    const v = b.parametros?.find((p) => p.nombre === parametro)?.valor
    if (typeof v !== 'number') continue
    const anio = Number(b.fecha.slice(0, 4))
    porAnio.set(anio, [...(porAnio.get(anio) ?? []), v])
  }
  return [...porAnio.entries()]
    .sort(([a], [b]) => a - b)
    .map(([anio, vs]) => ({
      anio,
      valor: vs.reduce((s, v) => s + v, 0) / vs.length,
      n: vs.length,
    }))
}
