/**
 * Pure parser for the municipal hiring-processes list page
 * (ribarroja.es/es/noticia/publicaciones-procesos-selectivos, server-rendered
 * HTML). Extracts one row per hiring process (título + detail URL); tipo is
 * classified from the title. No I/O; per-process document extraction (bases /
 * listas / tribunal PDFs on the detail pages) is a deferred follow-up.
 *
 * La lista corta el texto de cada enlace a 80 caracteres con «…», y la página
 * de cada proceso trae el título entero en `og:title`: `tituloDePagina` lo lee
 * y `completaTitulo` decide si se usa. Una lista vacía no se publica
 * (`exigeProcesos`): sería un «no hay procesos» que nadie midió.
 */
/** Los tipos, en el orden en que /empleo-publico los agrupa. `otro` es el cajón de sastre. */
export const PROCESO_TIPOS = ['oposicion', 'bolsa', 'estabilizacion', 'otro'] as const
export type ProcesoTipo = (typeof PROCESO_TIPOS)[number]

export interface ProcesoSelectivo {
  id: string
  titulo: string
  tipo: ProcesoTipo
  url: string
  /** De dónde sale `titulo`: el texto del enlace de la lista o la página del proceso. */
  tituloDe: 'listado' | 'pagina'
}

/**
 * Qué pasó al completar un título. `entero`: el enlace no estaba cortado y no
 * hacía falta su página. `completado`: se tomó el de la página. `sin-titulo`:
 * la página no trae uno entero. `no-casa`: el de la página no parece el mismo
 * proceso. En los tres últimos casos que no completan, se queda el cortado.
 */
export const RESULTADOS_TITULO = ['entero', 'completado', 'sin-titulo', 'no-casa'] as const
export type ResultadoTitulo = (typeof RESULTADOS_TITULO)[number]

const HOST = 'https://www.ribarroja.es'
const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&aacute;/g, 'á')
    .replace(/&eacute;/g, 'é')
    .replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó')
    .replace(/&uacute;/g, 'ú')
    .replace(/&ntilde;/g, 'ñ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// A link is a hiring process iff its (decoded) text reads like one.
const PROCESO_RE =
  /proceso selectivo|bolsa de trabajo|convocatoria|oposici|estabilizaci|provisi[oó]n|plazas?|bases|concurso|agente|auxiliar|conserje|inspector|profesor|polic[ií]a|t[eé]cnic/i
const CHROME_RE =
  /facebook|twitter|instagram|youtube|redes|inicio|buscar|portada|cookies|aviso legal|mapa web|^\W*$/i

export function classify(titulo: string): ProcesoTipo {
  const t = titulo.toLowerCase()
  if (/estabilizaci/.test(t)) return 'estabilizacion'
  if (/bolsa/.test(t)) return 'bolsa'
  if (/proceso selectivo|oposici|convocatoria|provisi|plazas?|bases|concurso/.test(t))
    return 'oposicion'
  return 'otro'
}

export function parseProcesosList(html: string): ProcesoSelectivo[] {
  // Restrict to the main content region when present (drops header/footer nav).
  const main = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(html)?.[1] ?? html
  const out: ProcesoSelectivo[] = []
  const seen = new Set<string>()
  const linkRe = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(main))) {
    const titulo = decode(m[2])
    if (!titulo || titulo.length < 7) continue
    if (CHROME_RE.test(titulo) || !PROCESO_RE.test(titulo)) continue
    let url = m[1]
    if (url.startsWith('/')) url = HOST + url
    if (!/^https?:\/\//.test(url) || seen.has(url)) continue
    seen.add(url)
    const idMatch = url.match(/\/contenidos\/(\d+)/) || url.match(/([^/]+)\/?$/)
    out.push({
      id: idMatch ? idMatch[1] : url,
      titulo,
      tipo: classify(titulo),
      url,
      tituloDe: 'listado',
    })
  }
  return out
}

/** El texto del enlace acaba en «…» (o en tres puntos): la lista lo cortó. */
export function estaCortado(titulo: string): boolean {
  return /(…|\.\.\.)\s*$/.test(titulo)
}

const NOMBRE_DEL_SITIO = 'Ayuntamiento de Riba-roja de Túria'

const ENTIDADES: Record<string, string> = {
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  agrave: 'à',
  egrave: 'è',
  ograve: 'ò',
  ntilde: 'ñ',
  ccedil: 'ç',
  middot: '·',
}

/** Un atributo o un <title> en texto: entidades con nombre y numéricas, espacios juntos. */
function textoDeAtributo(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * El título de la página de un proceso: su `og:title`, o el `<title>` sin el
 * nombre del sitio. El nombre del sitio solo, o nada, es `null`.
 */
export function tituloDePagina(html: string): string | null {
  const og =
    /<meta[^>]+property="og:title"[^>]*content="([^"]*)"/i.exec(html)?.[1] ??
    /<meta[^>]+content="([^"]*)"[^>]*property="og:title"/i.exec(html)?.[1]
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]
  const crudo = og ?? title
  if (crudo == null) return null
  const sufijo = new RegExp(`\\s*[|·–-]\\s*${NOMBRE_DEL_SITIO}\\s*$`)
  const titulo = textoDeAtributo(crudo).replace(sufijo, '').trim()
  if (!titulo || titulo === NOMBRE_DEL_SITIO) return null
  return titulo
}

/** Las palabras de cuatro letras o más, en minúscula y sin acentos. */
function palabras(s: string): string[] {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 4)
}

/**
 * Qué parte de las palabras enteras del enlace cortado tiene que estar en el
 * título de la página. Medido el 29-10-2026 sobre los diez enlaces cortados:
 * con su propia página comparten entre el 75 % (la bolsa de ayudante de
 * auditorio, redactada de otra manera que su enlace) y el 100 %.
 *
 * NO distingue un proceso de otro: los títulos de este portal son de fórmula,
 * y el de otro proceso de la misma lista llega al 88 % («Proceso selectivo
 * promoción interna restringida N plazas…»). Qué proceso es lo dice la URL del
 * enlace, y el raspador no acepta una página a la que se llegó por una
 * redirección. Esto sólo rechaza una página cuyo título habla de otra cosa: un
 * «no encontrada», la portada, un aviso cualquiera.
 */
export const UMBRAL_MISMO_PROCESO = 0.6

/**
 * El título que se publica. Sólo se cambia un enlace cortado, y sólo por el
 * título entero de su página (`UMBRAL_MISMO_PROCESO` dice lo que comprueba y lo
 * que no). Lo que falla deja el cortado: nunca se pone un título que la página
 * no dé. Con el título nuevo se vuelve a clasificar el tipo.
 */
export function completaTitulo(
  proceso: ProcesoSelectivo,
  tituloPagina: string | null,
): { proceso: ProcesoSelectivo; resultado: ResultadoTitulo } {
  if (!estaCortado(proceso.titulo)) return { proceso, resultado: 'entero' }
  if (!tituloPagina || estaCortado(tituloPagina)) return { proceso, resultado: 'sin-titulo' }
  // La última palabra del enlace cortado está a medias: no cuenta.
  const delEnlace = palabras(proceso.titulo.replace(/\S*(…|\.\.\.)\s*$/, ''))
  const deLaPagina = new Set(palabras(tituloPagina))
  const compartidas = delEnlace.filter((w) => deLaPagina.has(w)).length
  if (delEnlace.length === 0 || compartidas / delEnlace.length < UMBRAL_MISMO_PROCESO)
    return { proceso, resultado: 'no-casa' }
  return {
    proceso: { ...proceso, titulo: tituloPagina, tipo: classify(tituloPagina), tituloDe: 'pagina' },
    resultado: 'completado',
  }
}

/**
 * Una lista sin procesos no se publica. Lo que la deja vacía es casi siempre
 * un cambio de maquetación que deja al parser sin enlaces, y la página diría
 * «No hay procesos selectivos publicados ahora mismo» sin haberlo medido. Que
 * el raspado falle deja la instantánea anterior.
 */
export function exigeProcesos(procesos: ProcesoSelectivo[]): ProcesoSelectivo[] {
  if (procesos.length === 0)
    throw new Error(
      'procesos-selectivos: la lista no trae ningún proceso — no se publica una lista vacía (¿cambió la maquetación?)',
    )
  return procesos
}
