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

// An uppercase-led token run ending in a Spanish company suffix. Shared by both
// ficha templates; expects single-line (whitespace-collapsed) input for
// companies the pdf splits across lines.
const EMPRESA_RE = /([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑñ0-9.&\- ]*?,?\s*S\.[ALC]\.(?:U\.)?)/

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

  const emp = text.match(EMPRESA_RE)
  if (emp) out.empresa = emp[1].replace(/\s+/g, ' ').trim()

  return out
}

// ---------------------------------------------------------------------------
// Plan RENOVE de adecuación de viales (urbanismo/vias_y_obras · fichas feb
// 2024). Same publisher, different listing page + a bilingual ficha template:
// Nombre de la inversión / Zona afectada / Fecha ejecución / Adjudicatario /
// Coste total previsto / Financiación / Resumen. Only ONE amount is published
// (coste total previsto) — never mapped onto the licitación/adjudicación pair.
// ---------------------------------------------------------------------------

/** "Ficha QR Asfaltado X" / "Fichas obras Plan renove_Acera Y" → obra name. */
export function parseRenoveList(html: string): ObraListItem[] {
  const main = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(html)?.[1] ?? html
  const out: ObraListItem[] = []
  const seen = new Set<string>()
  const re = /<a[^>]+href="([^"]+\.pdf[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(main))) {
    const text = decode(m[2])
    if (!/^fichas?\b/i.test(text)) continue // only ficha rows, not the program pdf
    const nombre = text
      .replace(/^ficha\s+qr\s+/i, '')
      .replace(/^fichas?\s+obras?\s+plan\s+renove[_\s]*/i, '')
      .trim()
    if (nombre.length < 4) continue
    let url = m[1]
    if (url.startsWith('/')) url = HOST + url
    if (!/^https?:\/\//.test(url) || seen.has(url)) continue
    seen.add(url)
    out.push({ nombre, fichaUrl: url })
  }
  return out
}

export interface RenoveFicha {
  zona?: string
  fechaEjecucion?: string
  empresa?: string
  costePrevisto?: number
  financiacion?: string
}

export function parseRenoveFicha(text: string): RenoveFicha {
  const out: RenoveFicha = {}
  const t = text.replace(/\s+/g, ' ').trim()

  // Zona afectada sits between the "Adjudicatari" header (the last header of
  // the row block; \b keeps "Adjudicatario" from matching early) and the
  // execution date. It may carry a Valencian duplicate — kept verbatim: it is
  // the geo-resolution input, and more real needles only help.
  const zonaDate = t.match(/Adjudicatari\b\s*(.*?)\s*(\d{1,2})\/(\d{1,2})\/(20\d{2})/)
  if (zonaDate) {
    const zona = zonaDate[1].trim()
    if (zona.length >= 4) out.zona = zona
    out.fechaEjecucion = `${zonaDate[4]}-${zonaDate[3].padStart(2, '0')}-${zonaDate[2].padStart(2, '0')}`
    const emp = t.slice(zonaDate.index! + zonaDate[0].length).match(EMPRESA_RE)
    if (emp) out.empresa = emp[1].trim()
  }

  // Single published amount; anchored after its header so a stray € elsewhere
  // (e.g. in the resumen) can never be mistaken for the coste.
  const coste = /Coste total previsto[\s\S]*?([\d.]+,\d{2})\s*€/.exec(text)
  if (coste) out.costePrevisto = parseSpanishAmount(coste[1])

  if (/FONDOS\s+PROPIOS/i.test(t)) out.financiacion = 'Fondos propios'

  return out
}
