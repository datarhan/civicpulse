/**
 * La prensa de /cambios, una fila por noticia — puro, sin E/S.
 *
 * La auditoría de las dos lecturas (§2) vio la misma noticia dos veces en la
 * tarjeta de prensa, «en un medio valenciano y en uno castellano». La regla de
 * /laboratorio (`titularesDeLaMismaHistoria`, la de `clusterArticlesByStory`)
 * compara palabras enteras, y «projecta 30 quilòmetres de vies» no comparte
 * ninguna con «proyecta 30 kilómetros de vías»: el 28-10-2026, de las siete
 * noticias que salían en más de un sitio en catorce días, juntaba una.
 *
 * Dos piezas son la misma noticia cuando son de sitios distintos, con no más de
 * `DIAS_DE_UNA_NOTICIA` días entre ellas, y además:
 *
 *   1. lo dice la regla de /laboratorio; o
 *   2. comparten una cifra distintiva (`cifrasDistintivas`) y una raíz: las
 *      primeras `LETRAS_DE_RAIZ` letras de una palabra de contenido
 *      (`palabrasDeContenido`), que es lo que el castellano y el valenciano
 *      suelen compartir («persones»/«personas», «homenatjar»/«homenajear»); o
 *   3. sin cifra, comparten `MIN_RAICES_SIN_CIFRA` raíces y una proporción
 *      `MIN_PROPORCION_SIN_CIFRA` de las de ambas (coeficiente de Dice).
 *
 * Se midió sobre los 818 titulares de prensa que press.json ha publicado desde
 * mayo de 2025 (todas sus versiones en git, sin anuncios), leyendo uno a uno los
 * pares que une. Las tres condiciones de fuera salen de esa lectura:
 *
 *   · **Sitios distintos.** Los falsos de la regla 3 eran todos dos avisos de
 *     ribarroja.es: dos cursos de danza, dos procesos selectivos, dos escuelas.
 *   · **Una cifra sola no basta.** «Boletín … núm 12» y «Regimiento … nº 12»;
 *     «recibirá 9,5 millones» y «el PP vota en contra de los 9,5 millones».
 *   · **Tres días.** Sin tope, la regla de /laboratorio junta el anuncio de la
 *     Festa del Arròs con la crónica de cómo fue, trece días después, y los
 *     listados provisionales de una escuela con los definitivos. Tiene un coste
 *     medido: la formalización del contrato del agua, en la web municipal el 8-10
 *     y en Valencia Plaza el 15-10, sale en dos filas.
 *
 * Lo que no junta sale en dos filas, como antes; lo que juntara mal escondería
 * una noticia bajo el titular de otra. Por eso la regla prefiere lo primero, y la
 * fila enlaza cada pieza con su propio titular. No junta, medido el 28-10: la
 * Ofrena al Túria en Levante y en Valenciabonita (dos raíces en común), el
 * MeteoAula («lleva a las aulas las claves para entender la dana») ni el
 * proyecto CircSyst contado por dos medios con palabras distintas.
 *
 * El titular de la fila es el de un medio si en el grupo hay alguno
 * (`esFuenteOficial`: la nota de prensa de una administración es la fuente, no
 * un medio), y de ellos el primero que la publicó.
 */

import { claveDeMedio, palabrasDeContenido, titularesDeLaMismaHistoria } from './press-analytics'
import { esFuenteOficial } from './press-fuente-oficial'

/** Lo más que puede haber entre dos piezas de la misma noticia, en días de calendario. */
export const DIAS_DE_UNA_NOTICIA = 3
/** Cuántas letras de una palabra de contenido se comparan entre lenguas. */
export const LETRAS_DE_RAIZ = 5
/** Sin cifra en común, cuántas raíces hay que compartir. */
export const MIN_RAICES_SIN_CIFRA = 3
/** Sin cifra en común, qué parte de las raíces de los dos (Dice). */
export const MIN_PROPORCION_SIN_CIFRA = 0.4

export interface PiezaDePrensa {
  id: string
  title: string
  /** ISO 8601, con la hora: decide cuál se publicó primero. */
  date: string
  source: string
  sourceHost: string | null
  official?: boolean
}

export interface GrupoDeNoticia<T extends PiezaDePrensa> {
  /** La pieza cuyo titular encabeza la fila. */
  principal: T
  /** Todas, la principal primero y las demás por fecha. */
  piezas: T[]
}

/**
 * Las cifras de un titular que distinguen una noticia, normalizadas: «31'6%»,
 * «31,6 %» y «31’6» son 31.6; «2.800» es 2800. Fuera los años (1900–2099) y las
 * de un dígito: «2026» y «el 8 de novembre» salen en muchas noticias distintas.
 */
export function cifrasDistintivas(titulo: string): Set<string> {
  const out = new Set<string>()
  for (const m of titulo.replace(/[’‘]/g, "'").matchAll(/\d+(?:[.,']\d+)*/g)) {
    // Un punto seguido de tres cifras separa millares; coma y apóstrofo, decimales.
    const n = Number(m[0].replace(/\.(\d{3})(?!\d)/g, '$1').replace(/[,']/g, '.'))
    if (!Number.isFinite(n)) continue
    if (Number.isInteger(n) && (n < 10 || (n >= 1900 && n <= 2099))) continue
    out.add(String(n))
  }
  return out
}

const raices = (titulo: string): Set<string> =>
  new Set(palabrasDeContenido(titulo).map((w) => w.slice(0, LETRAS_DE_RAIZ)))

const comunes = (a: Set<string>, b: Set<string>): number => {
  let n = 0
  for (const x of a) if (b.has(x)) n += 1
  return n
}

const DIA_MS = 24 * 60 * 60 * 1000
const diasEntre = (a: string, b: string): number =>
  Math.abs(Date.parse(a.slice(0, 10)) - Date.parse(b.slice(0, 10))) / DIA_MS

/** ¿Cuentan `a` y `b` la misma noticia? Simétrica. */
export function mismaNoticia(a: PiezaDePrensa, b: PiezaDePrensa): boolean {
  if (claveDeMedio(a) === claveDeMedio(b)) return false
  if (!(diasEntre(a.date, b.date) <= DIAS_DE_UNA_NOTICIA)) return false
  if (titularesDeLaMismaHistoria(a.title, b.title)) return true
  const ra = raices(a.title)
  const rb = raices(b.title)
  const enComun = comunes(ra, rb)
  if (enComun === 0) return false
  if (comunes(cifrasDistintivas(a.title), cifrasDistintivas(b.title)) > 0) return true
  return (
    enComun >= MIN_RAICES_SIN_CIFRA &&
    (2 * enComun) / (ra.size + rb.size) >= MIN_PROPORCION_SIN_CIFRA
  )
}

const antes = (x: PiezaDePrensa, y: PiezaDePrensa): number =>
  x.date.localeCompare(y.date) || x.id.localeCompare(y.id)

/**
 * Las piezas, agrupadas por noticia: componentes conexas de `mismaNoticia`.
 * Las filas van de la más reciente a la más antigua, por la fecha de su
 * principal. Una pieza sin pareja es un grupo de una.
 */
export function agruparPorNoticia<T extends PiezaDePrensa>(
  piezas: readonly T[],
): GrupoDeNoticia<T>[] {
  const padre = piezas.map((_, i) => i)
  const raiz = (i: number): number => {
    while (padre[i] !== i) {
      padre[i] = padre[padre[i]]
      i = padre[i]
    }
    return i
  }
  for (let i = 0; i < piezas.length; i++) {
    for (let j = i + 1; j < piezas.length; j++) {
      if (!mismaNoticia(piezas[i], piezas[j])) continue
      const ri = raiz(i)
      const rj = raiz(j)
      if (ri !== rj) padre[Math.max(ri, rj)] = Math.min(ri, rj)
    }
  }
  const porRaiz = new Map<number, T[]>()
  for (let i = 0; i < piezas.length; i++) {
    const r = raiz(i)
    const g = porRaiz.get(r)
    if (g) g.push(piezas[i])
    else porRaiz.set(r, [piezas[i]])
  }
  const grupos: GrupoDeNoticia<T>[] = []
  for (const miembros of porRaiz.values()) {
    const medios = miembros.filter((p) => !esFuenteOficial(p))
    const principal = [...(medios.length ? medios : miembros)].sort(antes)[0]
    const resto = miembros.filter((p) => p !== principal).sort(antes)
    grupos.push({ principal, piezas: [principal, ...resto] })
  }
  return grupos.sort((x, y) => antes(y.principal, x.principal))
}
