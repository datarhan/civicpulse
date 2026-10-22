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
import { stripDiacritics } from './normalize'

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
  /** «Origen del Agua», tal cual: «Pozo Entubado (1)». */
  origen: string[]
  /** Los procesos unitarios del tratamiento: «Desinfección - Químicos». */
  procesos: string[]
  /** Sin `idRed`: lo pone quien sabe qué red pidió. */
  boletines: Omit<Boletin, 'idRed'>[]
  parametros: Parametro[]
  /** Leyendas «Análisis …» que no son ninguna de `TIPOS_ANALISIS`. */
  seccionesSinReconocer: string[]
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

/** Leyenda sin tildes ni mayúsculas: la página las cambia sin avisar. */
const leyenda = (s: string) => stripDiacritics(limpio(s)).toLowerCase()

/**
 * La sección de boletines por su leyenda. El 22-10-2026 la misma ficha decía
 * «Análisis de completo» por la mañana y «Análisis completo» por la tarde; un
 * `startsWith('análisis de')` perdió la sección entera sin decir nada. Por eso
 * se reconoce por la palabra, y lo que empieza por «análisis» y no se reconoce
 * se devuelve aparte (`seccionesSinReconocer`) para que el CLI falle.
 */
export function tipoDeLeyenda(legend: string): TipoAnalisis | null {
  const l = leyenda(legend)
  if (!l.startsWith('analisis')) return null
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

  const origen: string[] = []
  const procesos: string[] = []
  $('fieldset.bloqueFieldsetU').each((_, fs) => {
    const l = leyenda($(fs).children('legend').first().text())
    if (l === 'origen del agua')
      $(fs)
        .find('label')
        .each((_, x) => {
          const t = limpio($(x).text())
          if (t) origen.push(t)
        })
    if (l.startsWith('tratamiento'))
      $(fs)
        .find('tbody > tr')
        .each((_, tr) => {
          const celda = $(tr).children('td').eq(1).html() ?? ''
          for (const t of celda.split(/<br\s*\/?>/i).map((x) => texto($, x)))
            if (t) procesos.push(t)
        })
  })

  const boletines: DetalleRed['boletines'] = []
  const seccionesSinReconocer: string[] = []
  $('fieldset.bloqueFieldsetU').each((_, fs) => {
    const texto = $(fs).children('legend').first().text()
    const tipo = tipoDeLeyenda(texto)
    if (!tipo) {
      if (leyenda(texto).startsWith('analisis')) seccionesSinReconocer.push(limpio(texto))
      return
    }
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
    if (!leyenda($(fs).children('legend').first().text()).startsWith('ultimos valor')) return
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
    origen,
    procesos,
    boletines,
    parametros,
    seccionesSinReconocer,
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

/** El límite paramétrico del nitrato (RD 3/2023, anexo I): 50 mg/L. */
export const LIMITE_NITRATO_MG_L = 50

interface AguaSnapshot {
  consultadoEl: string
  fuente: { nombre: string; url: string; atribucion: string; licencia: string }
  redes: {
    idRed: number
    nombre: string
    gestor: string | null
    poblacion: number
    origen?: string[]
    procesos?: string[]
  }[]
  boletines: Boletin[]
}

const fechaEs = (iso: string) => iso.split('-').reverse().join('-')
const num = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 1 })

/**
 * El resultado que acompaña a la tarjeta de abastecimiento: el nitrato de la
 * red que abastece a casi todo el término, año a año, y en las salvedades lo
 * que pasó en TODAS las redes. Devuelve `null` si no hay serie que publicar,
 * nunca un cero.
 *
 * Por qué el nitrato y no «% de análisis aptos»: en la red principal todos
 * los análisis publicados salen aptos, y una serie plana en 100 % no se puede
 * indexar ni dice nada que una frase no diga. El nitrato sí se mueve, tiene un
 * límite legal que no ponemos nosotros, y es lo que hizo «no apta» el agua de
 * las dos redes que lo fueron.
 *
 * La red principal se elige por población abastecida, no por id: si SINAC
 * reordena o renombra, la elección sigue a los vecinos. Sólo años cerrados
 * (`anio < anioEnCurso`): una media de un año a medias movería la línea con
 * una sola muestra; la última muestra va en las salvedades, con su fecha.
 */
export function resultadoAgua(agua: AguaSnapshot, anioEnCurso: number) {
  const redes = [...agua.redes].sort((a, b) => b.poblacion - a.poblacion)
  const principal = redes[0]
  if (!principal) return null
  const total = redes.reduce((s, r) => s + r.poblacion, 0)
  const serieCompleta = serieParametro(agua.boletines, principal.idRed, 'Nitrato')
  const serie = serieCompleta.filter((p) => p.anio < anioEnCurso)
  const ultimo = serie.at(-1)
  if (!ultimo) return null

  const ultimaMuestra = agua.boletines.find(
    (b) =>
      b.idRed === principal.idRed &&
      b.tipo === 'completo' &&
      typeof b.parametros?.find((p) => p.nombre === 'Nitrato')?.valor === 'number',
  )
  const nitratoUltima = ultimaMuestra?.parametros?.find((p) => p.nombre === 'Nitrato')?.valor

  const calificados = agua.boletines.filter(
    (b) => b.calificacion === 'apta' || b.calificacion === 'no-apta',
  )
  const noAptas = calificados.filter((b) => b.calificacion === 'no-apta')
  const desde = calificados.at(-1)?.fecha.slice(0, 4)
  const nombreRed = new Map(agua.redes.map((r) => [r.idRed, r]))
  const detalleNoApta = noAptas.map((b) => {
    const red = nombreRed.get(b.idRed)
    const n = b.parametros?.find((p) => p.nombre === 'Nitrato')?.valor
    return (
      `${fechaEs(b.fecha)}, red con gestor ${red?.gestor ?? 'sin declarar'}` +
      (typeof n === 'number' ? ` (nitrato ${num(n)} mg/L)` : '')
    )
  })
  const principalesDelGestor = agua.redes.filter((r) => r.gestor === principal.gestor)
  const noAptaEnGestorPrincipal = noAptas.some(
    (b) => nombreRed.get(b.idRed)?.gestor === principal.gestor,
  )

  const origenLegible = principal.origen?.length
    ? principal.origen.map((o) => o.replace(/\s*\(\d+\)$/, '').toLowerCase()).join(', ')
    : 'un origen que la ficha no declara'
  const tratamientoLegible = principal.procesos?.length
    ? principal.procesos
        // «Desinfección - Químicos» → «desinfección química»: la ficha da
        // proceso y modo con un guion; la frase los necesita juntos.
        .map((p) => p.toLowerCase().replace(/^(.+?) - químicos$/, '$1 química'))
        .join(', ')
    : 'un tratamiento que la ficha no declara'

  const caveats = [
    `La serie es la de la red ${principal.nombre}, que abastece a ${num(principal.poblacion)} de las ` +
      `${num(total)} personas censadas en las ${redes.length} redes del término. Cada año es la media ` +
      `de sus análisis completos (análisis por año — ${serie.map((p) => `${p.anio}: ${p.n}`).join('; ')}).`,
    ...(ultimaMuestra &&
    typeof nitratoUltima === 'number' &&
    ultimaMuestra.fecha.slice(0, 4) >= String(anioEnCurso)
      ? [
          `El último análisis completo, del ${fechaEs(ultimaMuestra.fecha)}, dio ${num(nitratoUltima)} mg/L; ` +
            `${anioEnCurso} no entra en la serie hasta que se cierre.`,
        ]
      : []),
    noAptas.length
      ? `De los ${calificados.length} análisis calificados en las ${redes.length} redes que la página ` +
        `deja ver (desde ${desde}), ${noAptas.length} salieron «no apta»: ${detalleNoApta.join('; ')}. ` +
        `El nitrato pasaba de su límite legal (${LIMITE_NITRATO_MG_L} mg/L); el boletín no dice ` +
        `qué parámetro decidió la calificación.` +
        (noAptaEnGestorPrincipal
          ? ''
          : ` Ninguno en las ${principalesDelGestor.length} redes de ${principal.gestor}.`)
      : `Los ${calificados.length} análisis calificados en las ${redes.length} redes que la página ` +
        `deja ver (desde ${desde}) salieron «apta».`,
    'SINAC sólo enseña los últimos boletines de cada red; el archivo crece desde el 22-10-2026, ' +
      'y lo anterior es lo que la página aún mostraba ese día.',
  ]

  return {
    id: 'agua-nitrato-red-principal',
    servicioRelacionado: 'a161-coste-unitario',
    etiqueta: `Nitrato en el agua de la red principal (límite legal: ${LIMITE_NITRATO_MG_L} mg/L)`,
    valor: ultimo.valor,
    unidad: 'mg/L',
    periodo: String(ultimo.anio),
    serie: serie.map(({ anio, valor }) => ({ anio, valor })),
    pares: null,
    comoSeLee:
      'El nitrato llega al agua desde el acuífero —abono agrícola filtrado al subsuelo—, no ' +
      `desde la red: según su ficha en SINAC, la principal toma el agua de ${origenLegible} y la ` +
      `trata con ${tratamientoLegible}. Mide el agua que sale del grifo, no lo bien que se ` +
      'gestiona la red ni lo que cuesta: se publica junto al coste, nunca dividido por él.',
    caveats,
    fuente: {
      nombre: agua.fuente.nombre,
      url: agua.fuente.url,
      atribucion: agua.fuente.atribucion,
    },
  }
}
