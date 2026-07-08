/**
 * Pure parsers for the municipal "obras en curso" transparency listing + its
 * per-obra ficha PDFs (Item nº 69). No I/O. Honest nulls — a field whose pattern
 * doesn't match is omitted, never guessed. `técnico responsable` is deliberately
 * NOT parsed (libel-adjacent, not published).
 */
import { parseSpanishAmount } from './budget-execution'

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

export interface ObraFicha {
  titulo?: string
  empresa?: string
  plazoMeses?: number
  inicio?: string
  importeLicitacion?: number
  importeAdjudicacion?: number
}

const MESES: Record<string, string> = {
  enero: '01',
  febrero: '02',
  marzo: '03',
  abril: '04',
  mayo: '05',
  junio: '06',
  julio: '07',
  agosto: '08',
  septiembre: '09',
  setiembre: '09',
  octubre: '10',
  noviembre: '11',
  diciembre: '12',
}

export function parseObraFicha(text: string): ObraFicha {
  const out: ObraFicha = {}

  // The two euro amounts appear in template order: licitación, then adjudicación.
  const euros = [...text.matchAll(/([\d.]+,\d{2})\s*€/g)].map((m) => parseSpanishAmount(m[1]))
  if (euros.length >= 2) {
    const [lic, adj] = euros
    // sanity gate: adjudicación ≤ licitación, else don't trust the pair
    if (lic > 0 && adj > 0 && adj <= lic) {
      out.importeLicitacion = lic
      out.importeAdjudicacion = adj
    }
  }

  const plazo = text.match(/(\d+)\s*meses/i)
  if (plazo) out.plazoMeses = Number(plazo[1])

  const date = text.match(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(20\d{2})/i)
  if (date) {
    const mm = MESES[date[2].toLowerCase()]
    if (mm) out.inicio = `${date[3]}-${mm}-${date[1].padStart(2, '0')}`
  }

  // Company: an uppercase-led token run ending in a Spanish company suffix.
  const emp = text.match(/([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑñ0-9.&\- ]*?,?\s*S\.[ALC]\.(?:U\.)?)/)
  if (emp) out.empresa = emp[1].replace(/\s+/g, ' ').trim()

  return out
}
