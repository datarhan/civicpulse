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
import type { FilaAnexo, FormatoAnexo, PuntoZona } from './informe-agua'
import { OTRAS_LECTURAS_AGUA, cotejarLectura } from './otras-lecturas-agua'

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

/** Un municipio leído en SINAC, en la forma que guardan agua.json y agua-pares.json. */
export interface MunicipioAgua {
  ine: string
  nombre: string
  redes: { idRed: number; nombre: string; gestor: string | null; poblacion: number }[]
  boletines: Boletin[]
}

/**
 * La red que abastece a más gente censada. `null` si ninguna declara
 * población: una red de 0 habitantes no representa al municipio, y elegir la
 * primera de la lista sería elegir por el orden de la página.
 */
export function redPrincipal(m: Pick<MunicipioAgua, 'redes'>) {
  const r = [...m.redes].sort((a, b) => b.poblacion - a.poblacion || a.idRed - b.idRed)[0]
  return r && r.poblacion > 0 ? r : null
}

/** Cuartiles con interpolación lineal, como el resto de bandas de la casa. */
function cuantil(ordenados: number[], p: number): number {
  const i = (ordenados.length - 1) * p
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return ordenados[lo] + (ordenados[hi] - ordenados[lo]) * (i - lo)
}

/** Por debajo de esto no se publica banda: la misma regla que reciclaje. */
export const MIN_PARES = 15

/**
 * La banda del nitrato: el MISMO dato que el propio —media del año `anio` en
 * los análisis completos de la red principal— en cada municipio de la banda.
 * Quien no tiene análisis completos con nitrato ese año queda fuera y no
 * cuenta en `n`. El propio municipio no entra en su banda.
 */
export function paresNitrato(
  municipios: MunicipioAgua[],
  anio: number,
  valorPropio: number,
  conjunto: string,
  inePropio: string,
) {
  const vals: number[] = []
  for (const m of municipios) {
    if (m.ine === inePropio) continue
    const red = redPrincipal(m)
    if (!red) continue
    const v = serieParametro(m.boletines, red.idRed, 'Nitrato').find((p) => p.anio === anio)
    if (v) vals.push(v.valor)
  }
  if (vals.length < MIN_PARES) return null
  vals.sort((a, b) => a - b)
  return {
    conjunto: `${conjunto} · nitrato medio de ${anio} en su red principal`,
    n: vals.length,
    percentil: Math.round((100 * vals.filter((v) => v <= valorPropio).length) / vals.length),
    p25: cuantil(vals, 0.25),
    mediana: cuantil(vals, 0.5),
    p75: cuantil(vals, 0.75),
  }
}

/**
 * ¿Es raro un «no apta»? Cuenta, en los municipios de la banda, las redes con
 * algún boletín «no apta» entre los que SINAC enseña, y separa las que tienen
 * un gestor distinto del de la red principal de su municipio: en Riba-roja las
 * dos que lo tuvieron son de ésas, y la pregunta es si eso es un patrón.
 */
export function noAptaEnPares(municipios: MunicipioAgua[], inePropio: string) {
  let redes = 0
  let redesConNoApta = 0
  let otroGestor = 0
  let calificados = 0
  let noAptas = 0
  const conNoApta = new Set<string>()
  for (const m of municipios) {
    if (m.ine === inePropio) continue
    const principal = redPrincipal(m)
    for (const r of m.redes) {
      redes++
      const suyos = m.boletines.filter((b) => b.idRed === r.idRed)
      const cal = suyos.filter((b) => b.calificacion === 'apta' || b.calificacion === 'no-apta')
      const malos = cal.filter((b) => b.calificacion === 'no-apta')
      calificados += cal.length
      noAptas += malos.length
      if (malos.length) {
        redesConNoApta++
        conNoApta.add(m.ine)
        if (principal && r.gestor !== principal.gestor) otroGestor++
      }
    }
  }
  return {
    municipios: municipios.filter((m) => m.ine !== inePropio).length,
    municipiosConNoApta: conNoApta.size,
    redes,
    redesConNoApta,
    redesConNoAptaOtroGestor: otroGestor,
    calificados,
    noAptas,
  }
}

/** Lo que `scrape-agua-informe.ts` escribe en agua-informe-anual.json. */
export interface InformeAnual {
  zonaPrincipal: string
  anios: {
    anio: number
    formato: FormatoAnexo
    definiciones: { apto: string | null; noApto: string | null }
    filas: FilaAnexo[]
  }[]
  serieZonaPrincipal: PuntoZona[]
}

/**
 * El año entero, del informe del ministerio: la zona principal año a año y las
 * otras zonas del término que ese año tuvieron algún «no apto» (o menos del
 * 100 % de aptos, desde que el informe sólo da porcentajes). Cada año en su
 * formato, sin convertir un porcentaje en recuento.
 */
function frasesInforme(informe: InformeAnual | null | undefined): string[] {
  if (!informe?.serieZonaPrincipal.length) return []
  const pct = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 1 })
  const principal = informe.serieZonaPrincipal
    .map((p) =>
      p.formato === 'recuento'
        ? `${p.anio}, ${num(p.noApto)} «no apto» de ${num(p.total)}` +
          (p.filas > 1
            ? ' (el informe la lista dos veces, con grafías distintas; sumamos las dos)'
            : '')
        : `${p.anio}, ${pct(p.pctAptos)} % de aptos de ${num(p.boletines)}`,
    )
    .join('; ')
  const otras: string[] = []
  for (const a of [...informe.anios].sort((x, y) => x.anio - y.anio)) {
    for (const f of a.filas) {
      if (f.zonaNormalizada === informe.zonaPrincipal) continue
      if (f.formato === 'recuento' && f.noApto && f.total)
        otras.push(`${a.anio}, ${f.zona}: ${num(f.noApto)} «no apto» de ${num(f.total)}`)
      if (f.formato === 'porcentaje' && f.pctAptos !== null && f.pctAptos < 100 && f.boletines)
        otras.push(`${a.anio}, ${f.zona}: ${pct(f.pctAptos)} % de aptos de ${num(f.boletines)}`)
    }
  }
  const def = informe.anios.find((a) => a.definiciones.noApto)?.definiciones.noApto
  return [
    `El año entero lo cuenta el informe anual del Ministerio de Sanidad, por zona de ` +
      `abastecimiento. Zona ${informe.zonaPrincipal}, la de la red principal: ${principal}. ` +
      (def ? `«No apto» es, según el informe, «${def}». ` : '') +
      'No dice qué parámetro, y desde 2023 publica sólo el porcentaje de aptos, que no separa ' +
      '«no apto» de «sin calificar».',
    ...(otras.length ? [`Otras zonas del término en el mismo informe: ${otras.join('; ')}.`] : []),
  ]
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
export function resultadoAgua(
  agua: AguaSnapshot,
  anioEnCurso: number,
  pares?: { conjunto: string; inePropio: string; municipios: MunicipioAgua[] } | null,
  informe?: InformeAnual | null,
) {
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
  const nombreRed = new Map(agua.redes.map((r) => [r.idRed, r]))
  const detalleNoApta = noAptas.map((b) => {
    const red = nombreRed.get(b.idRed)
    const n = b.parametros?.find((p) => p.nombre === 'Nitrato')?.valor
    return (
      `${fechaEs(b.fecha)}, red con gestor ${red?.gestor ?? 'sin declarar'}` +
      (typeof n === 'number' ? ` (nitrato ${num(n)} mg/L)` : '')
    )
  })
  // Los «no apta» cuyo nitrato pasaba del límite: la frase sólo puede decir
  // que el nitrato lo pasaba de esos; un «no apta» por otro parámetro la haría falsa.
  const nitratoSobreLimite = noAptas.filter((b) => {
    const n = b.parametros?.find((p) => p.nombre === 'Nitrato')?.valor
    return typeof n === 'number' && n > LIMITE_NITRATO_MG_L
  }).length

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

  const enPares = pares?.municipios.length ? noAptaEnPares(pares.municipios, pares.inePropio) : null

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
    // La ventana de SINAC, dicha como ventana: «ninguno de los que se ven» se
    // leyó como «nunca», y el informe anual de 2021 cuenta 55 en la zona
    // principal. Lo del año entero va en la frase siguiente.
    `La consulta pública de SINAC enseña sólo los últimos boletines de cada red, no todos los del ` +
      `año. Entre los ${calificados.length} calificados que enseña hoy en las ${redes.length} redes, ` +
      (noAptas.length
        ? `${noAptas.length} salieron «no apta»: ${detalleNoApta.join('; ')}. ` +
          (nitratoSobreLimite === noAptas.length
            ? `El nitrato pasaba de su límite legal (${LIMITE_NITRATO_MG_L} mg/L) en todos; `
            : nitratoSobreLimite
              ? `El nitrato pasaba de su límite legal (${LIMITE_NITRATO_MG_L} mg/L) en ${nitratoSobreLimite}; `
              : '') +
          'el boletín no dice qué parámetro decidió la calificación.'
        : 'ninguno salió «no apta».'),
    ...frasesInforme(informe),
    ...(enPares
      ? [
          `En los ${enPares.municipios} municipios parecidos (${pares!.conjunto}), ` +
            `${enPares.redesConNoApta} de sus ${enPares.redes} redes tienen algún «no apta» entre ` +
            `los boletines que SINAC enseña (${enPares.noAptas} de ${enPares.calificados} ` +
            `análisis calificados), en ${enPares.municipiosConNoApta} municipios; ` +
            `${enPares.redesConNoAptaOtroGestor} de esas redes tienen un gestor distinto del de ` +
            `la red principal de su municipio.`,
        ]
      : []),
    'Guardamos cada boletín que SINAC enseña desde el 22-10-2026; lo anterior es lo que la ' +
      'página aún mostraba ese día.',
  ]

  return {
    id: 'agua-nitrato-red-principal',
    servicioRelacionado: 'a161-coste-unitario',
    etiqueta: `Nitrato en el agua de la red principal (límite legal: ${LIMITE_NITRATO_MG_L} mg/L)`,
    valor: ultimo.valor,
    unidad: 'mg/L',
    periodo: String(ultimo.anio),
    serie: serie.map(({ anio, valor }) => ({ anio, valor })),
    pares: pares
      ? paresNitrato(pares.municipios, ultimo.anio, ultimo.valor, pares.conjunto, pares.inePropio)
      : null,
    comoSeLee:
      'El nitrato llega al agua desde el acuífero —abono agrícola filtrado al subsuelo—, no ' +
      `desde la red: según su ficha en SINAC, la principal toma el agua de ${origenLegible} y la ` +
      `trata con ${tratamientoLegible}. Mide el agua que sale del grifo, no lo bien que se ` +
      'gestiona la red ni lo que cuesta: se publica junto al coste, nunca dividido por él.',
    caveats,
    // Lo que han publicado terceros, con su cotejo contra el archivo
    // (`otras-lecturas-agua.ts`): «coincide» sólo si el boletín está.
    otrasLecturas: OTRAS_LECTURAS_AGUA.map((l) => cotejarLectura(l, agua)),
    fuente: {
      nombre: agua.fuente.nombre,
      url: agua.fuente.url,
      atribucion: agua.fuente.atribucion,
    },
  }
}
