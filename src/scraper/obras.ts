/**
 * Pure parsers for the municipal "obras en curso" transparency listing + its
 * per-obra ficha PDFs (Item nº 69). No I/O. Honest nulls — a field whose pattern
 * doesn't match is omitted, never guessed. `técnico responsable` is deliberately
 * NOT parsed (libel-adjacent, not published).
 */
const HOST = 'https://www.ribarroja.es'

export interface ObraListItem {
  nombre: string
  fichaUrl: string
}

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

export function parseObrasList(html: string): ObraListItem[] {
  const main = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(html)?.[1] ?? html
  const out: ObraListItem[] = []
  const seen = new Set<string>()
  const re = /<a[^>]+href="([^"]+\.pdf[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(main))) {
    const text = decode(m[2])
    if (!/ficha/i.test(text)) continue // only the "NN_Ficha obra(s) <name>" rows
    // strip "NN_Ficha obra(s) " / "NN_Ficha obra " prefix → the obra name
    const nombre = text.replace(/^\d+[_\s]*ficha\s+obras?\s+/i, '').trim()
    if (nombre.length < 4) continue
    let url = m[1]
    if (url.startsWith('/')) url = HOST + url
    if (!/^https?:\/\//.test(url) || seen.has(url)) continue
    seen.add(url)
    out.push({ nombre, fichaUrl: url })
  }
  return out
}
