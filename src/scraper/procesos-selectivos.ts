/**
 * Pure parser for the municipal hiring-processes list page
 * (ribarroja.es/es/noticia/publicaciones-procesos-selectivos, server-rendered
 * HTML). Extracts one row per hiring process (título + detail URL); tipo is
 * classified from the title. No I/O; per-process document extraction (bases /
 * listas / tribunal PDFs on the detail pages) is a deferred follow-up.
 */
export type ProcesoTipo = 'oposicion' | 'bolsa' | 'estabilizacion' | 'otro'

export interface ProcesoSelectivo {
  id: string
  titulo: string
  tipo: ProcesoTipo
  url: string
}

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

function classify(titulo: string): ProcesoTipo {
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
    out.push({ id: idMatch ? idMatch[1] : url, titulo, tipo: classify(titulo), url })
  }
  return out
}
