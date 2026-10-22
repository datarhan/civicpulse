/**
 * Estadística de Bibliotecas Públicas — lo que la biblioteca municipal
 * consigue, junto a lo que cuesta. El Ministerio de Cultura publica cada año,
 * por municipio, las visitas, los usuarios inscritos, los nuevos y los
 * prestatarios activos de sus bibliotecas públicas (anexo 28, «Visitas y
 * usuarios inscritos», en `mcu.es/alziraweb`).
 *
 * La página es una tabla HTML por provincia y año, servida en ISO-8859-1 con
 * entidades: el CLI (`scripts/scrape-bibliotecas.ts`) hace los GET y este
 * módulo sólo la lee. Tres cosas que el contrato
 * (`tests/parse-bibliotecas.test.ts`) fija porque la página las pone fáciles
 * de leer mal:
 *
 *  1. **«-» es sin dato, nunca 0.** Una biblioteca que el año no informó sale
 *     con las cuatro casillas a «-»; leerlo como 0 publicaría que nadie entró.
 *  2. **La fila TOTAL es la prueba de que no falta nadie.** No es un
 *     municipio, pero la suma de las filas tiene que cuadrar con ella; el CLI
 *     lo exige antes de escribir.
 *  3. **El nombre es del ministerio, no del INE.** «L' Alfàs del Pi» es
 *     «Alfàs del Pi (l')», «Xàbia/Jávea» es «Jávea/Xàbia». Se resuelve por
 *     variantes (cada lengua, sin artículo) y por igualdad, nunca por
 *     parecido: «Eliana» está dentro de «Meliana». Dos filas para un nombre
 *     es un fallo, no una elección.
 *
 * Módulo puro: sin red, sin ficheros.
 */
import { load } from 'cheerio'
import { stripDiacritics } from './normalize'

/** Las columnas del anexo 28, en su orden. Cualquier otra rompe la lectura. */
export const COLUMNAS_ANEXO_28 = [
  'Visitas',
  'Usuarios inscritos',
  'Nuevos usuarios',
  'Prestatarios activos',
] as const

const CAMPO: Record<(typeof COLUMNAS_ANEXO_28)[number], keyof Cifras> = {
  Visitas: 'visitas',
  'Usuarios inscritos': 'usuariosInscritos',
  'Nuevos usuarios': 'nuevosUsuarios',
  'Prestatarios activos': 'prestatariosActivos',
}

export interface Cifras {
  visitas: number | null
  usuariosInscritos: number | null
  nuevosUsuarios: number | null
  prestatariosActivos: number | null
}

export interface FilaMunicipio extends Cifras {
  /** El nombre tal como lo escribe el ministerio. */
  municipio: string
}

export interface AnexoMunicipios {
  anio: number
  /** «Comunidad Valenciana - Valencia/València», del título del anexo. */
  ambito: string
  columnas: string[]
  filas: FilaMunicipio[]
  total: Cifras
}

const limpio = (s: string | undefined | null) => (s ?? '').replace(/\s+/g, ' ').trim()

/** «1.077» → 1077; «-» o vacío → null. Enteros con punto de millar. */
function entero(s: string): number | null {
  const t = limpio(s)
  if (t === '' || t === '-' || t === '..') return null
  if (!/^\d{1,3}(\.\d{3})*$/.test(t)) {
    throw new Error(`[bibliotecas] «${t}» no es un entero de la tabla`)
  }
  return Number(t.replace(/\./g, ''))
}

export function parseAnexoMunicipios(html: string): AnexoMunicipios {
  const $ = load(html)
  const titulo = limpio($('h1.titulo_anexo').first().text())
  const m = titulo.match(/^Visitas y usuarios inscritos\. (\d{4})\. (.+)$/)
  if (!m) throw new Error(`[bibliotecas] el título del anexo no es el esperado: «${titulo}»`)

  const tabla = $('table#fixed_table').first()
  const columnas = tabla
    .find('thead th')
    .slice(1)
    .map((_, th) => limpio($(th).text()))
    .get()
  if (
    columnas.length !== COLUMNAS_ANEXO_28.length ||
    columnas.some((c, i) => c !== COLUMNAS_ANEXO_28[i])
  ) {
    throw new Error(
      `[bibliotecas] columnas «${columnas.join(' | ')}» — no son las del anexo 28; ` +
        'una columna que no se conoce no se lee por su posición',
    )
  }

  const filas: FilaMunicipio[] = []
  let total: Cifras | null = null
  tabla.find('tbody tr').each((_, tr) => {
    const th = $(tr).find('th').first()
    // `.toArray().map`, no `.map().get()`: el de cheerio descarta los null,
    // y una fila toda de «-» se quedaba sin casillas.
    const celdas = $(tr)
      .find('td')
      .toArray()
      .map((td) => entero($(td).text()))
    if (celdas.length !== columnas.length) {
      throw new Error(`[bibliotecas] una fila con ${celdas.length} casillas`)
    }
    const cifras = Object.fromEntries(
      COLUMNAS_ANEXO_28.map((c, i) => [CAMPO[c], celdas[i]]),
    ) as unknown as Cifras
    if (th.hasClass('totalanexocv')) total = cifras
    else filas.push({ municipio: limpio(th.text()), ...cifras })
  })
  if (!filas.length || !total) {
    throw new Error('[bibliotecas] la tabla no trae municipios o no trae su fila TOTAL')
  }
  return { anio: Number(m[1]), ambito: m[2], columnas, filas, total }
}

// Un artículo de palabra necesita su espacio detrás: sin él, «Eliana» perdía
// su «el» y dejaba de ser L'Eliana.
const ARTICULO = /^(?:(?:el|la|els|les|los|las)\s+|l['’]\s*)/
const ARTICULO_FINAL =
  /\s*(?:\((?:el|la|els|les|los|las|l'|l’)\)|,\s*(?:el|la|els|les|los|las|l'|l’))$/

/** Las claves de un nombre: una por lengua, sin artículo, sin acentos ni signos. */
export function variantesNombre(nombre: string): string[] {
  return limpio(nombre)
    .split('/')
    .map((v) =>
      stripDiacritics(v.trim().toLowerCase())
        .replace(ARTICULO_FINAL, '')
        .replace(ARTICULO, '')
        .replace(/[^a-z0-9]/g, ''),
    )
    .filter(Boolean)
}

/**
 * La fila de un municipio por su nombre (el del INE o el del ministerio):
 * coincide si comparten una variante. Ninguna o más de una → null.
 */
export function resolverMunicipio<T extends { municipio: string }>(
  filas: T[],
  nombre: string,
): T | null {
  const buscadas = new Set(variantesNombre(nombre))
  const hits = filas.filter((f) => variantesNombre(f.municipio).some((v) => buscadas.has(v)))
  return hits.length === 1 ? hits[0] : null
}

export interface Pares {
  conjunto: string
  n: number
  percentil: number
  p25: number
  mediana: number
  p75: number
}

function cuantil(ordenada: number[], p: number): number {
  const i = (ordenada.length - 1) * p
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return lo === hi ? ordenada[lo] : ordenada[lo] + (ordenada[hi] - ordenada[lo]) * (i - lo)
}

/** Mínimo de comparables para publicar un grupo, como criminalidad y reciclaje. */
export const MIN_PARES = 15

/**
 * El grupo de comparables de un valor. `valores` NO incluye el propio: un
 * percentil que te cuenta a ti mismo se compara contra un espejo.
 */
export function paresDe(valores: number[], propio: number, conjunto: string): Pares | null {
  if (valores.length < MIN_PARES) return null
  const v = [...valores].sort((a, b) => a - b)
  return {
    conjunto,
    n: v.length,
    percentil: Math.round((100 * v.filter((x) => x <= propio).length) / v.length),
    p25: cuantil(v, 0.25),
    mediana: cuantil(v, 0.5),
    p75: cuantil(v, 0.75),
  }
}

// ── Del anexo al resultado ───────────────────────────────────────────────────

/**
 * Las dos tasas que se publican. Los usuarios inscritos NO: en la serie sólo
 * suben, también en 2024 mientras las visitas bajaban, como un acumulado.
 * Los préstamos tampoco: ya son el divisor de la tarjeta de coste.
 */
export const TASAS = ['prestatariosPorMil', 'visitasPorHabitante'] as const
export type Tasa = (typeof TASAS)[number]

export interface Tasas {
  prestatariosPorMil: number | null
  visitasPorHabitante: number | null
}

export function tasasDe(c: Cifras, poblacion: number | null): Tasas {
  const ok = (v: number | null) => typeof v === 'number' && !!poblacion && poblacion > 0
  return {
    prestatariosPorMil: ok(c.prestatariosActivos)
      ? (1000 * c.prestatariosActivos!) / poblacion!
      : null,
    visitasPorHabitante: ok(c.visitas) ? c.visitas! / poblacion! : null,
  }
}

export interface PuntoBiblioteca extends Cifras, Tasas {
  anio: number
  /** Padrón a 1 de enero del mismo año (INE). */
  poblacion: number | null
}

export interface FilaPar extends Tasas {
  ine: string
  nombre: string
  anio: number
  /** El nombre con que lo escribe el ministerio; null si no se encontró. */
  nombreFuente: string | null
  prestatariosActivos: number | null
  visitas: number | null
  poblacion: number | null
}

export interface GrupoTasa {
  /** El último año: todos los de la banda con dato ese año. */
  ultimo: Pares | null
  /**
   * La mediana de cada año sobre un PANEL FIJO: los de la banda con dato todos
   * los años. Con un grupo que cambia de miembros, la mediana se movería por
   * quién entra y quién sale, no por lo que pasa en las bibliotecas.
   */
  serie: { anio: number; mediana: number; n: number }[] | null
}

/** Los grupos de una tasa: el último año y la serie del panel fijo. */
export function grupoDe(
  filas: FilaPar[],
  propio: PuntoBiblioteca[],
  tasa: Tasa,
  conjunto: string,
): GrupoTasa {
  const anios = propio.map((p) => p.anio).sort((a, b) => a - b)
  const ultimoAnio = anios.at(-1)
  const propioUltimo = propio.find((p) => p.anio === ultimoAnio)?.[tasa]
  const del = (anio: number) =>
    filas.filter((f) => f.anio === anio && typeof f[tasa] === 'number').map((f) => f[tasa]!)
  const ultimo =
    ultimoAnio !== undefined && typeof propioUltimo === 'number'
      ? paresDe(del(ultimoAnio), propioUltimo, `${conjunto} · con dato en ${ultimoAnio}`)
      : null

  const porIne = new Map<string, Map<number, number>>()
  for (const f of filas) {
    if (typeof f[tasa] !== 'number') continue
    const m = porIne.get(f.ine) ?? new Map<number, number>()
    m.set(f.anio, f[tasa]!)
    porIne.set(f.ine, m)
  }
  const panel = [...porIne.values()].filter((m) => anios.every((a) => m.has(a)))
  const serie =
    panel.length >= MIN_PARES
      ? anios.map((anio) => {
          const v = panel.map((m) => m.get(anio)!).sort((a, b) => a - b)
          return { anio, mediana: cuantil(v, 0.5), n: v.length }
        })
      : null
  return { ultimo, serie }
}

export interface BibliotecasSnapshot {
  generatedAt: string
  fuente: { nombre: string; url: string; atribucion: string; licencia: string }
  municipio: { ine: string; nombre: string; serie: PuntoBiblioteca[] }
  pares: {
    conjunto: string
    miembros: number
    filas: FilaPar[]
    grupos: Record<Tasa, GrupoTasa>
  }
}

const SERVICIO_BIBLIOTECA = 'a3321-330p-coste-unitario'
// Con el punto de millar SIEMPRE: es-ES no agrupa por debajo de 10.000 y
// escribía «5190» al lado de «22.761».
const fmt = (n: number, d = 0) => {
  const [ent, dec] = n.toFixed(d).split('.')
  return ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (dec ? `,${dec}` : '')
}

/**
 * Los dos resultados de la biblioteca, junto a su tarjeta de coste. El primero
 * (prestatarios) es el que lleva «Cuesta · Consigue · Responde»; la ficha del
 * servicio enseña los dos.
 */
export function resultadosBibliotecas(snap: BibliotecasSnapshot) {
  const serie = [...snap.municipio.serie].sort((a, b) => a.anio - b.anio)
  const ultimo = serie.at(-1)
  if (!ultimo) return []
  const primero = serie[0]

  const inscritos = serie.map((p) => p.usuariosInscritos)
  const soloSube =
    inscritos.every((v) => typeof v === 'number') &&
    inscritos.every((v, i) => i === 0 || v! >= inscritos[i - 1]!)
  const visitasAntes = serie.at(-2)?.visitas
  const inscritosNota = soloSube
    ? `Los usuarios inscritos no se usan como resultado: en la serie sólo suben (de ` +
      `${fmt(primero.usuariosInscritos!)} en ${primero.anio} a ${fmt(ultimo.usuariosInscritos!)} en ${ultimo.anio}` +
      (typeof visitasAntes === 'number' &&
      typeof ultimo.visitas === 'number' &&
      ultimo.visitas < visitasAntes
        ? `; subieron también en ${ultimo.anio}, cuando las visitas bajaron`
        : '') +
      `), así que cuentan carnés acumulados, no uso.`
    : `Los usuarios inscritos no se usan como resultado: un carné cuenta aunque no se use.`

  const comun = [
    'Los préstamos ya son la unidad de la tarjeta de coste (euros por préstamo); por eso aquí se ' +
      'cuentan personas y visitas, no préstamos.',
    inscritosNota,
    `Las tasas usan el padrón a 1 de enero de cada año (INE): ${serie
      .map((p) => `${p.anio}, ${p.poblacion === null ? 'sin padrón' : fmt(p.poblacion)}`)
      .join('; ')} habitantes.`,
  ]
  // Los de la banda que faltan algún año, por su nombre: fuera de la línea del
  // grupo, y el lector tiene que poder ver quiénes.
  const fueraDelPanel = (tasa: Tasa) =>
    [
      ...new Set(snap.pares.filas.filter((f) => typeof f[tasa] !== 'number').map((f) => f.nombre)),
    ].sort((a, b) => a.localeCompare(b, 'es'))
  const nota = (g: GrupoTasa, tasa: Tasa) => {
    if (!g.ultimo)
      return 'Sin grupo de comparación: menos de 15 municipios de la banda tienen dato.'
    const fuera = fueraDelPanel(tasa)
    return (
      `La banda de comparación es propia: los municipios de la banda de coste ` +
      `(${snap.pares.conjunto}) con dato en el anexo en ${ultimo.anio} (n=${g.ultimo.n} de ` +
      `${snap.pares.miembros}).` +
      (g.serie
        ? ` La línea del grupo es la mediana de los ${g.serie[0].n} que tienen dato los ` +
          `${serie.length} años, siempre los mismos` +
          (fuera.length ? `; quedan fuera, por algún año sin dato, ${fuera.join(', ')}.` : '.')
        : '')
    )
  }

  const base = (
    tasa: Tasa,
    id: string,
    etiqueta: string,
    unidad: string,
    decimales: number,
    comoSeLee: string,
  ) => {
    const puntos = serie.filter((p) => typeof p[tasa] === 'number')
    const fin = puntos.at(-1)
    if (!fin) return null
    const g = snap.pares.grupos[tasa]
    return {
      id,
      servicioRelacionado: SERVICIO_BIBLIOTECA,
      etiqueta,
      valor: fin[tasa]!,
      unidad,
      decimales,
      periodo: String(fin.anio),
      serie: puntos.map((p) => ({ anio: p.anio, valor: p[tasa]! })),
      pares: g.ultimo,
      paresSerie: g.serie,
      comoSeLee,
      caveats: [...comun, nota(g, tasa)],
      fuente: {
        nombre: snap.fuente.nombre,
        url: snap.fuente.url,
        atribucion: snap.fuente.atribucion,
      },
    }
  }

  const contexto =
    'Lo recogen las comunidades autónomas con un cuestionario común (norma ISO 2789), y la ' +
    'cifra suma todas las bibliotecas públicas del término que informan a la estadística. Depende de la ' +
    'colección, el horario y los hábitos de lectura del pueblo, no sólo de lo que gasta el ' +
    'ayuntamiento: se publica junto al coste, nunca dividido por él.'
  return [
    base(
      'prestatariosPorMil',
      'biblioteca-prestatarios-por-mil',
      'Prestatarios activos de la biblioteca',
      'por 1.000 hab.',
      1,
      `Cuántas personas se llevaron algo en préstamo durante el año, por cada 1.000 habitantes. ${contexto}`,
    ),
    base(
      'visitasPorHabitante',
      'biblioteca-visitas-por-habitante',
      'Visitas a la biblioteca',
      'por habitante',
      2,
      `Cuántas veces se entró en la biblioteca durante el año, por habitante. ${contexto}`,
    ),
  ].filter((x): x is NonNullable<typeof x> => x !== null)
}
