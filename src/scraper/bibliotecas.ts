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
