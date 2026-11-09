/**
 * Plataforma de Rendición de Cuentas (rendiciondecuentas.es) — where every
 * local entity sends its Cuenta General to the Tribunal de Cuentas and the
 * regional audit bodies, the Sindicatura de Comptes among them. Per ejercicio
 * it publishes whether the account was rendered and the date of each step:
 * definitive budget approval, liquidation, formation of the account, the
 * Comisión Especial's report, public exposure, the Pleno, and the sending.
 *
 * Why it matters here: having presented the Cuenta General to the Sindicatura
 * is a condition for being a beneficiary of the Fondo de Cooperación Municipal
 * (Ley 5/2021, art. 4.2), and three of those dates are acts whose deadline the
 * TRLRHL fixes. Measured 2026-11-09: Riba-roja rendered every ejercicio from
 * 2012 to 2025; the 2025 account went out on 14-10, one day inside the limit.
 *
 * Two decisions the fixtures pin:
 *
 *   · The ejercicios come from what the search and the history page LINK.
 *     A year the platform does not offer answers HTTP 500 (measured with 2026),
 *     so a loop over years would turn a server error into «no rendida».
 *   · Only three dates are judged against a deadline: those where the
 *     published date IS the act the law dates (`PLAZOS`). The liquidation's
 *     deadline is for drawing it up (art. 191.3), not for approving it; the
 *     Comisión's is for submitting the account to its report (art. 212.2), not
 *     for the report. Their published dates prove neither compliance nor delay,
 *     so they are shown as dates and nothing more.
 *
 * Pure: no network, no fs. The pages arrive in ISO-8859-1 and the CLI
 * (scripts/scrape-rendicion-cuentas.ts) decodes them before calling in here.
 */

import { decodeHtmlEntities } from './normalize'

export const ORIGEN = 'https://www.rendiciondecuentas.es'
export const RUTA_CONSULTA = '/es/consultadeentidadesycuentas/buscarCuentas/'

/** The platform's own id for the Ayuntamiento de Riba-roja de Túria. */
export const ID_ENTIDAD_RIBA_ROJA = 7174

/**
 * Status icons, keyed by the `alt` the platform prints — the words of the
 * source, not ours. `N.D.` is the one status the history page writes as text.
 */
export const ESTADOS_CUENTA = {
  'Cuenta rendida': 'rendida',
  'Cuenta rendida no disponible': 'rendida-no-disponible',
  'Cuenta no rendida': 'no-rendida',
  'No aplica': 'no-aplica',
  'N.D.': 'no-disponible',
} as const

export type EstadoCuenta = (typeof ESTADOS_CUENTA)[keyof typeof ESTADOS_CUENTA]

/** The legend's one icon that is a link to the history, not a status. */
export const ICONO_EJERCICIOS_ANTERIORES = 'Observatorio de Rendición'

/** Row labels of the per-ejercicio table, verbatim, and the key each fills. */
export const CAMPOS_FECHA = {
  'Fecha aprobación definitiva del Presupuesto': 'presupuestoAprobado',
  'Fecha aprobación de liquidación del Presupuesto': 'liquidacionAprobada',
  'Fecha de formación de la Cuenta General': 'cuentaFormada',
  'Fecha de Informe de la Comisión Especial de Cuentas': 'informeComision',
  'Fecha de inicio de la exposición pública': 'exposicionPublica',
  'Fecha de presentación de la Cuenta General al Pleno': 'presentadaAlPleno',
  'Fecha de aprobación de la Cuenta General': 'cuentaAprobada',
  'Fecha de envío': 'enviada',
} as const

export type CampoFecha = (typeof CAMPOS_FECHA)[keyof typeof CAMPOS_FECHA]
export type Fechas = Record<CampoFecha, string | null>

const BOE_TRLRHL = 'https://www.boe.es/buscar/act.php?id=BOE-A-2004-4214'

/**
 * The three deadlines, with the article's words. Unchanged since the 2004 text
 * (the only later edit to art. 212, by Ley 11/2020, touched apartados 3 and
 * 5), so they apply to every ejercicio the platform holds.
 */
export const PLAZOS = {
  presupuestoAprobado: {
    articulo: 'art. 169.2 TRLRHL',
    literal:
      'La aprobación definitiva del presupuesto general por el Pleno de la corporación habrá de realizarse antes del día 31 de diciembre del año anterior al del ejercicio en que deba aplicarse.',
    url: `${BOE_TRLRHL}#a169`,
    limite: (ejercicio: number) => `${ejercicio - 1}-12-31`,
  },
  cuentaAprobada: {
    articulo: 'art. 212.4 TRLRHL',
    literal:
      'la cuenta general se someterá al Pleno de la corporación, para que, en su caso, pueda ser aprobada antes del día 1 de octubre.',
    url: `${BOE_TRLRHL}#a212`,
    limite: (ejercicio: number) => `${ejercicio + 1}-10-01`,
  },
  enviada: {
    articulo: 'art. 223.2 TRLRHL',
    literal:
      'las entidades locales rendirán al citado Tribunal, antes del día 15 de octubre de cada año, la cuenta general a que se refiere el artículo 209 de esta ley correspondiente al ejercicio económico anterior.',
    url: `${BOE_TRLRHL}#a223`,
    limite: (ejercicio: number) => `${ejercicio + 1}-10-15`,
  },
} as const

export type CampoConPlazo = keyof typeof PLAZOS

/**
 * `pendiente` and `sin-fecha` are not delays: the first is a deadline still
 * open, the second a date the platform does not publish — done late, or
 * never, or simply not recorded, and we cannot tell which.
 */
export const VEREDICTOS = ['en-plazo', 'fuera-de-plazo', 'pendiente', 'sin-fecha'] as const
export type Veredicto = (typeof VEREDICTOS)[number]

export interface Evaluacion {
  /** The law says «antes del día…»: this day itself is already out. */
  limite: string
  veredicto: Veredicto
  /** Days from `limite` to the date, only when out of time (0 = that day). */
  diasTras: number | null
}

export interface CeldaEjercicio {
  ejercicio: number
  /** null when the cell carries an icon or text we do not know. */
  estado: EstadoCuenta | null
  /** The raw alt (or text) of the cell, kept so an unknown one can be named. */
  marca: string | null
  enlace: boolean
}

export interface FilaBusqueda {
  idEntidad: number | null
  tipo: string
  denominacion: string
  historico: boolean
  ejercicios: CeldaEjercicio[]
}

export interface Cuenta {
  entidad: string | null
  ejercicio: number | null
  estadoPrincipal: EstadoCuenta | null
  fechas: Fechas
  /**
   * How many label/value rows the dates table yielded. Zero means the table
   * was not found — a changed page, not eight blank dates — and the CLI
   * refuses to write it as «sin fecha».
   */
  camposLeidos: number
  /** Labels the table carried that `CAMPOS_FECHA` does not know. */
  camposDesconocidos: string[]
  /** Non-empty values that are not a dd/mm/yyyy date. */
  fechasIlegibles: string[]
}

// ── HTML helpers ─────────────────────────────────────────────────────────────

function texto(s: string): string {
  return decodeHtmlEntities(s.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function tablas(html: string): string[] {
  return html.match(/<table\b[\s\S]*?<\/table>/gi) ?? []
}

function alts(fragmento: string): string[] {
  return [...fragmento.matchAll(/<img\b[^>]*\balt="([^"]*)"/gi)].map((m) =>
    decodeHtmlEntities(m[1]).trim(),
  )
}

function celdas(fila: string): string[] {
  return [...fila.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1])
}

function filasCuerpo(tabla: string): string[] {
  const cuerpo = tabla.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] ?? ''
  return cuerpo.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? []
}

function ejerciciosCabecera(tabla: string): number[] {
  return [...tabla.matchAll(/<th\b[^>]*>\s*Ejercicio\s*<span>\s*(\d{4})\s*<\/span>/gi)].map((m) =>
    Number(m[1]),
  )
}

function leerCelda(ejercicio: number, html: string): CeldaEjercicio {
  const [alt] = alts(html)
  const marca = alt ?? (texto(html) || null)
  const estado =
    marca !== null && Object.hasOwn(ESTADOS_CUENTA, marca)
      ? ESTADOS_CUENTA[marca as keyof typeof ESTADOS_CUENTA]
      : null
  return {
    ejercicio,
    estado,
    marca,
    enlace: /consultarCuenta\.html\?[^"]*ejercicio=\d{4}/.test(html),
  }
}

function tablaResultados(html: string): string | null {
  return tablas(html).find((t) => /\bid="resultados"/.test(t)) ?? null
}

// ── Parsers ──────────────────────────────────────────────────────────────────

/** Every icon `alt` in the page's «Leyenda» table. */
export function parseLeyenda(html: string): string[] {
  const t = tablas(html).find((x) => /<th\b[^>]*>\s*Leyenda\s*<\/th>/i.test(x))
  return t ? alts(t) : []
}

/** The search results: one row per entity, the recent ejercicios as columns. */
export function parseBusqueda(html: string): { filas: FilaBusqueda[] } {
  const t = tablaResultados(html)
  if (!t) return { filas: [] }
  const anios = ejerciciosCabecera(t)
  const filas = filasCuerpo(t).map((tr) => {
    const tds = celdas(tr)
    const id = tr.match(/idEntidad=(\d+)/)?.[1]
    // Columns: tipo, denominación, «Ejercicios anteriores», then one per year.
    return {
      idEntidad: id ? Number(id) : null,
      tipo: texto(tds[0] ?? ''),
      denominacion: texto(tds[1] ?? ''),
      historico: /consultarCuentasEjercicios\.html/.test(tds[2] ?? ''),
      ejercicios: anios.map((anio, i) => leerCelda(anio, tds[3 + i] ?? '')),
    }
  })
  return { filas }
}

/** The history page: one column per earlier ejercicio, a single row. */
export function parseEjercicios(html: string): CeldaEjercicio[] {
  const t = tablaResultados(html)
  if (!t) return []
  const anios = ejerciciosCabecera(t)
  const [tr] = filasCuerpo(t)
  const tds = tr ? celdas(tr) : []
  return anios.map((anio, i) => leerCelda(anio, tds[i] ?? ''))
}

function isoDesde(ddmmyyyy: string): string | null {
  const m = ddmmyyyy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  const [, d, mes, a] = m
  const iso = `${a}-${mes}-${d}`
  // Reject 31/02 and friends rather than let Date roll them forward.
  const t = new Date(`${iso}T00:00:00Z`)
  return t.toISOString().slice(0, 10) === iso ? iso : null
}

/** One ejercicio's page: the dates table and the principal entity's status. */
export function parseCuenta(html: string): Cuenta {
  const fechas = Object.fromEntries(Object.values(CAMPOS_FECHA).map((k) => [k, null])) as Fechas
  const camposDesconocidos: string[] = []
  const fechasIlegibles: string[] = []
  let camposLeidos = 0

  const titulo = texto(html.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1] ?? '')
  const mt = titulo.match(/^(.*),\s*Ejercicio\s+(\d{4})$/)

  const tabla = tablas(html).find((t) => /tramitaci[oó]n de la Cuenta General/i.test(t))
  if (tabla) {
    // A label cannot span another <th>: without the guard the caption row
    // («Presupuesto, Liquidación…») glued itself onto the first label.
    const par = /<th\b[^>]*>((?:(?!<\/?th\b)[\s\S])*?)<\/th>\s*<td\b[^>]*>([\s\S]*?)<\/td>/gi
    for (const m of tabla.matchAll(par)) {
      const etiqueta = texto(m[1])
      const valor = texto(m[2])
      camposLeidos++
      if (!Object.hasOwn(CAMPOS_FECHA, etiqueta)) {
        camposDesconocidos.push(etiqueta)
        continue
      }
      const clave = CAMPOS_FECHA[etiqueta as keyof typeof CAMPOS_FECHA]
      if (valor === '') continue
      const iso = isoDesde(valor)
      if (iso === null) fechasIlegibles.push(`${etiqueta}: ${valor}`)
      fechas[clave] = iso
    }
  }

  const principal = tablas(html).find((t) => /Entidad Principal/i.test(t))
  const [alt] = principal ? alts(principal) : []
  const estadoPrincipal =
    alt !== undefined && Object.hasOwn(ESTADOS_CUENTA, alt)
      ? ESTADOS_CUENTA[alt as keyof typeof ESTADOS_CUENTA]
      : null

  return {
    entidad: mt ? mt[1].trim() : null,
    ejercicio: mt ? Number(mt[2]) : null,
    estadoPrincipal,
    fechas,
    camposLeidos,
    camposDesconocidos,
    fechasIlegibles,
  }
}

/**
 * Today as a Spanish calendar day (YYYY-MM-DD). The deadlines are Spanish
 * legal days, and `toISOString()` gives the UTC day — the day before, for an
 * hour or two after every Madrid midnight.
 */
export function diaEnEspana(ahora: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora)
}

/**
 * The ejercicios whose account consta rendida — available or not on the
 * platform: «Cuenta rendida no disponible» is a rendered account whose content
 * the platform does not show — out of those with a status at all. `no-aplica`
 * and `no-disponible` (N.D.) say nothing either way, so they are in neither.
 */
export function recuentoRendidas(estados: readonly EstadoCuenta[]): {
  rendidas: number
  conEstado: number
} {
  const rendidas = estados.filter((e) => e === 'rendida' || e === 'rendida-no-disponible').length
  return { rendidas, conEstado: rendidas + estados.filter((e) => e === 'no-rendida').length }
}

// ── Deadlines ────────────────────────────────────────────────────────────────

const DIA = 86_400_000

function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA)
}

/** Judge one dated act against the deadline the law gives it. */
export function evaluarPlazo(
  campo: CampoConPlazo,
  ejercicio: number,
  fecha: string | null,
  hoy: string,
): Evaluacion {
  const limite = PLAZOS[campo].limite(ejercicio)
  if (fecha === null) {
    return { limite, veredicto: hoy < limite ? 'pendiente' : 'sin-fecha', diasTras: null }
  }
  return fecha < limite
    ? { limite, veredicto: 'en-plazo', diasTras: null }
    : { limite, veredicto: 'fuera-de-plazo', diasTras: diasEntre(limite, fecha) }
}

export function urlCuenta(idEntidad: number, ejercicio: number): string {
  return `${ORIGEN}${RUTA_CONSULTA}consultarCuenta.html?idEntidad=${idEntidad}&ejercicio=${ejercicio}`
}

export function urlEjercicios(idEntidad: number): string {
  return `${ORIGEN}${RUTA_CONSULTA}consultarCuentasEjercicios.html?idEntidad=${idEntidad}`
}
