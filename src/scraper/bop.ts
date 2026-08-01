/**
 * Parse a Boletín Oficial de la Provincia de València (BOP) daily-bulletin
 * sumario (already extracted to plain text from the day's PDF) into the
 * Riba-roja de Túria anuncios.
 *
 * Why the BOP and not the town tablón: the municipal "tablón de edictos"
 * (oficinavirtual.ribarroja.es) is an indenova GWT app behind Cl@ve login and
 * never renders a list over HTTP. The BOP is the *canonical* legal-notice
 * channel for the municipality and exposes stable, unauthenticated PDFs.
 *
 * Sumario shape (pdf-parse flattens the 2-column layout to one stream):
 *   … <Entity> <Anuncio title>. <RegNumber> <Entity> <Anuncio title>. <Reg> …
 * The register number FOLLOWS its title; the entity heading PRECEDES it. We
 * anchor on the "Ayuntamiento de Riba-roja de Túria" heading and take the text
 * up to the next register number (20YY/NNNNN) as that anuncio's title — so a
 * neighbouring municipality's reg (which sits just before our heading) is never
 * mis-attributed to Riba-roja.
 *
 * Pure parser — the PDF fetch + text extraction live in bop-fetch.ts.
 */

import { sha256Short } from './hash'

export interface BopAnuncio {
  id: string // stable: sha256Short(regNumber)
  regNumber: string // "2026/07376"
  title: string
  entity: string // always "Ayuntamiento de Riba-roja de Túria"
  date: string // ISO date (YYYY-MM-DD) of the bulletin
  bulletinDate: string // "18/06/2026" (BOP's own date format)
  pdfUrl: string // the single-anuncio PDF
  bulletinUrl: string // the whole-day bulletin PDF
}

export interface BopSnapshot {
  generatedAt: string
  source: { name: string; home: string; note: string }
  stats: {
    total: number
    daysCovered: number
    /** Window size, so daysCovered has a denominator. Absent before 2026-08. */
    daysRequested?: number
    /** Bulletins whose fetch failed. Absent before 2026-08. */
    fetchFailures?: number
    latestDate: string | null
  }
  anuncios: BopAnuncio[]
}

const REG = '20\\d\\d/\\d{3,6}'
// Entity heading → lazy title → the trailing register number.
const ANUNCIO_RE = new RegExp(
  `Ayuntamiento de Riba-?roja de T[úu]ria\\s+([\\s\\S]*?)\\s+(${REG})`,
  'gi',
)

function bopPdf(regNumber: string): string {
  return `https://bop.dival.es/bop/downloads?anuncioNumReg=${encodeURIComponent(regNumber)}`
}

export function bopBulletinUrl(bulletinDate: string): string {
  return `https://bop.dival.es/bop/downloads?boletinFecha=${encodeURIComponent(bulletinDate)}`
}

/**
 * Extract Riba-roja anuncios from one day's bulletin text.
 * @param text       pdf-parsed bulletin text
 * @param bulletinDate "dd/mm/yyyy" (BOP format)
 * @param isoDate    "YYYY-MM-DD"
 */
export function parseBopBulletin(
  text: string,
  bulletinDate: string,
  isoDate: string,
): BopAnuncio[] {
  const out: BopAnuncio[] = []
  const seen = new Set<string>()
  let m: RegExpExecArray | null
  ANUNCIO_RE.lastIndex = 0
  while ((m = ANUNCIO_RE.exec(text)) !== null) {
    const regNumber = m[2]
    if (seen.has(regNumber)) continue
    const title = m[1].replace(/\s+/g, ' ').replace(/\.$/, '').trim()
    // Guard against a runaway lazy capture (heading with no real title before
    // the next reg) — a legitimate anuncio title is a full sentence.
    if (title.length < 12) continue
    seen.add(regNumber)
    out.push({
      id: sha256Short(regNumber),
      regNumber,
      title,
      entity: 'Ayuntamiento de Riba-roja de Túria',
      date: isoDate,
      bulletinDate,
      pdfUrl: bopPdf(regNumber),
      bulletinUrl: bopBulletinUrl(bulletinDate),
    })
  }
  return out
}
