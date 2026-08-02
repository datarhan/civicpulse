import { load, type CheerioAPI } from 'cheerio'
import type { AnyNode } from 'domhandler'
import { slugify } from './normalize'

export const PARTIES = ['PSOE', 'PP', 'VOX', 'Compromís', 'Ciudadanos', 'EU-Podem', 'Otro'] as const
export type Party = (typeof PARTIES)[number]
export type Role = 'alcalde' | 'concejal'

export interface Official {
  slug: string
  name: string
  honorific: 'Sr.' | 'Sra.'
  role: Role
  party: Party
  portfolios: string[]
  email: string | null
  photoUrl: string
  partyLogoUrl: string
  cvUrl: string | null
}

export interface ParseOptions {
  baseUrl?: string
}

// Stop capture at the first period before "Áreas" / "Correo" or end-of-string.
// Male councillors use "Sr. D." and female ones "Sra. Dª." — the "a/ª" is optional.
const NAME_RE = /(Sr\.|Sra\.)\s*D[a\u00aa]?\.?\s+([^.]+?)\.\s*(?:\u00c1reas|Correo|$)/i

// Map party logo image IDs (from alt + src) to canonical party codes.
// Source: inspected live HTML on 2026-04-19.
function partyFromLogo($img: AnyNode, $: CheerioAPI): Party {
  const el = $($img as unknown as AnyNode)
  const alt = (el.attr('alt') || '').toLowerCase()
  const src = el.attr('src') || ''
  // The numeric image id used to live in the src query string
  // (`?id=11569`). Drupal's file migration moved it into the alt text as
  // `(id: 11569)` and left the src as a plain path, which silently killed
  // every id-based rule below — the EU-Podem logo carries NO other
  // distinguishing text (its alt is literally `(id: 11569)`), so its
  // councillor fell through to the `Otro` fallback. Read both forms.
  const idMatch = src.match(/id=(\d+)/) || alt.match(/\(id:\s*(\d+)\)/)
  const imgId = idMatch ? idMatch[1] : ''

  if (alt.includes('psoe') || imgId === '1967') return 'PSOE'
  if (alt.includes('logo pp') || alt.includes(' pp ') || imgId === '9886') return 'PP'
  if (alt.includes('vox') || imgId === '10576') return 'VOX'
  if (alt.includes('compromis') || alt.includes('compromís') || imgId === '1970') return 'Compromís'
  if (alt.includes('ciudadanos') || alt.includes('ciutadans')) return 'Ciudadanos'
  // Logo 11569 is the group the acta de organización of 07-07-2023 names
  // "Grupo Municipal Esquerra Unida-Podem". It used to fall through to the
  // 'Otro' fallback, which the site then printed as if it were a party name —
  // and since this group holds exactly one seat, "Otro" identified its single
  // councillor by elimination while the extractor believed it was publishing
  // bloc-level attribution only.
  if (
    imgId === '11569' ||
    /logo-eu-up/i.test(src) ||
    alt.includes('esquerra unida') ||
    alt.includes('eupv') ||
    alt.includes('podem') ||
    alt.includes('izquierda unida')
  )
    return 'EU-Podem'
  return 'Otro'
}

function absolutise(url: string | undefined, base: string): string {
  if (!url) return ''
  if (/^https?:\/\//.test(url)) return url
  if (url.startsWith('/')) return `${base}${url}`
  return `${base}/${url}`
}

/**
 * Canonicalise the biographical-data link the corporación page emits into the
 * live HTTPS Spanish path. The page still links the pre-redesign Valencian path
 * (http, …/continguts/<id>) which now 404s; the same content — one shared index
 * page for all councillors (content-id 864708/0835919) — is live under the
 * Spanish …/contenidos/<id> path. We anchor on the stable content-id so a future
 * id change still follows. Verified live 2026-06-18.
 */
export function canonicalCvUrl(href: string | undefined | null, base: string): string | null {
  if (!href) return null
  const abs = absolutise(href, base)
  const id = abs.match(/\/(?:continguts|contenidos)\/(\d+\/\d+)/)
  if (!id) return abs
  return (
    'https://www.ribarroja.es/es/portal_de_transparencia/' +
    'informacion_sobre_la_corporacion_municipal/' +
    'datos_biograficos_del_alcalde_sa_y_concejales/contenidos/' +
    id[1]
  )
}

function makeSlug(name: string): string {
  return slugify(name)
}

function extractPortfolios(text: string): string[] {
  // The "Áreas" block runs until the next "Correo electrónico" or end-of-cell.
  const cleaned = text
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const m = cleaned.match(/\u00c1reas[:\s]*(.*?)(?:Correo electr\u00f3nico|$)/i)
  if (!m) return []
  const raw = m[1].replace(/\s*\.?\s*$/, '').trim()
  // Split on comma or period (period is used for top-level portfolios in the
  // mayor's block, e.g. "Alcaldía. Innovación, …"). Keep multi-word " y "
  // phrases intact — they're almost always a single portfolio
  // ("Áreas Industriales y Cementerio").
  const parts = raw
    .split(/\s*[.,]\s*/)
    .map((p) => p.trim())
    .filter((p) => p.length > 1)
  return parts
}

/**
 * Domains that are one keystroke from a major provider. Publishing a `mailto:`
 * to one of these sends a citizen's message to a typosquat.
 */
const DOMAIN_TYPOS: Record<string, string> = {
  'gmai.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'yahooo.com': 'yahoo.com',
}

/**
 * Correct an obvious provider typo, but ONLY when the corrected address is
 * itself published on the same page.
 *
 * The corporación page carries `popularesribarroja@gmai.com` twice and
 * `popularesribarroja@gmail.com` twelve times — the same mailbox, spelled both
 * ways, and the scraper happened to pick the broken one for that councillor's
 * contact link. We are not inventing an address here: the evidence that the
 * real one exists is on the page we already fetched.
 *
 * When the corrected form is NOT present, the raw value is kept untouched.
 * Guessing at someone's contact details is worse than publishing what the
 * source says.
 */
export function preferCorrectlySpelledEmail(email: string | null, pageText: string): string | null {
  if (!email) return email
  const at = email.lastIndexOf('@')
  if (at < 0) return email
  const local = email.slice(0, at)
  const domain = email.slice(at + 1).toLowerCase()
  const fixed = DOMAIN_TYPOS[domain]
  if (!fixed) return email
  const corrected = `${local}@${fixed}`
  return pageText.toLowerCase().includes(corrected.toLowerCase()) ? corrected : email
}

function extractEmail($td: ReturnType<CheerioAPI>): string | null {
  // Prefer the mailto: link because the visible text sometimes shows the shared
  // alcaldia@ribarroja.es while the actual link points to the councillor's
  // personal alias.
  const mailto = $td.find('a[href^="mailto:"]').attr('href')
  if (mailto) return mailto.replace(/^mailto:/, '').trim()
  // Fallback: a bare email in the text
  const text = $td.text()
  const m = text.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)
  return m ? m[0] : null
}

function extractName(text: string): { honorific: 'Sr.' | 'Sra.'; name: string } | null {
  // Cells contain concatenated paragraphs (cheerio .text() drops tag
  // boundaries), so match anywhere in the flattened string and stop at the
  // first period before "Áreas", "Correo", or end-of-string.
  const cleaned = text
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const m = cleaned.match(NAME_RE)
  if (!m) return null
  const honorific = m[1] === 'Sra.' ? 'Sra.' : 'Sr.'
  return { honorific, name: m[2].trim() }
}

function findMainTable($: CheerioAPI) {
  // The legacy ribarroja.es theme nested the roster inside div.cuerpo > table.
  // The 2026-05 rebuild dropped that wrapper, so fall back to every <table>
  // on the page when the scoped lookup is empty. Either way, prefer the table
  // that contains both "Alcalde" and "Concejales" markers.
  let tables = $('div.cuerpo table')
  if (tables.length === 0) tables = $('table')
  let best: ReturnType<CheerioAPI> | null = null
  tables.each((_, el) => {
    const t = $(el)
    if (/alcalde/i.test(t.text()) && /concejales/i.test(t.text())) {
      best = t
    }
  })
  return best ?? tables.first()
}

export function parseCorporacion(html: string, opts: ParseOptions = {}): Official[] {
  const base = (opts.baseUrl || 'http://www.ribarroja.es').replace(/\/+$/, '')
  const $ = load(html)
  const table = findMainTable($)
  if (!table || table.length === 0) return []

  const officials: Official[] = []
  let currentRole: Role = 'alcalde' // first data row after the "Alcalde" marker

  table.find('tr').each((_, tr) => {
    const $tr = $(tr)
    const cells = $tr.find('> td')
    if (cells.length < 1) return

    const infoCell = $(cells[0])
    const cellText = infoCell
      .text()
      .replace(/\u00a0/g, ' ')
      .trim()

    // Section marker rows contain just "Alcalde" or "Concejales" — no person data
    if (/^\s*alcalde\s*$/i.test(cellText)) {
      currentRole = 'alcalde'
      return
    }
    if (
      /^\s*concejales\s*$/i.test(cellText) ||
      (/concejales/i.test(cellText) && cellText.length < 30)
    ) {
      currentRole = 'concejal'
      return
    }

    // Does this row actually contain a person?
    const parsed = extractName(infoCell.text())
    if (!parsed) return

    // Portfolios — from the Áreas block inside this same info cell
    const portfolios = extractPortfolios(infoCell.text().replace(/\u00a0/g, ' '))

    // Email
    // Same page, same mailbox, spelled both ways — prefer the spelling that
    // actually resolves. See preferCorrectlySpelledEmail.
    const email = preferCorrectlySpelledEmail(extractEmail(infoCell), $.html())

    // Photo + party — from the second data cell (images col). Fall back to any
    // <img> inside the row if the layout differs.
    const imgContext = cells.length >= 2 ? $(cells[cells.length - 1]) : $tr
    const imgs = imgContext.find('img')
    // The council photo is the larger portrait image (~88x88). The party logo
    // is the smaller rectangle. We identify the party logo via `partyFromLogo`
    // scanning all imgs in the row.
    let photoUrl = ''
    let partyLogoUrl = ''
    let party: Party = 'Otro'
    imgs.each((_, img) => {
      const $img = $(img)
      const alt = ($img.attr('alt') || '').toLowerCase()
      const src = $img.attr('src') || ''
      // Skip CV / Agenda iconography (alt contains "cv" or "agenda")
      if (/^cv\b/.test(alt) || /agenda/i.test(alt)) return
      const detected = partyFromLogo(img as unknown as AnyNode, $)
      if (detected !== 'Otro' || /id=11569/.test(src)) {
        partyLogoUrl = absolutise(src, base)
        party = detected
      } else if (!photoUrl) {
        photoUrl = absolutise(src, base)
      }
    })

    // If only one non-logo image was found, it's the photo
    if (!photoUrl) {
      imgs.each((_, img) => {
        const $img = $(img)
        const alt = ($img.attr('alt') || '').toLowerCase()
        if (/^cv\b/.test(alt) || /agenda/i.test(alt)) return
        const src = $img.attr('src') || ''
        const isLogo =
          /psoe|logo pp|vox|compromis/i.test(alt) || /id=(1967|9886|10576|1970|11569)\b/.test(src)
        if (!isLogo && !photoUrl) photoUrl = absolutise(src, base)
      })
    }

    // Special-case the "Otro" party row where logo id is 11569 and alt is empty
    if (party === 'Otro') {
      const anyLogo = imgs.filter((_, img) => /id=11569/.test($(img).attr('src') || '')).first()
      if (anyLogo.length > 0 && !partyLogoUrl) {
        partyLogoUrl = absolutise(anyLogo.attr('src'), base)
      }
    }

    // CV link — anchor wrapping the CV icon. The page still emits the
    // pre-redesign Valencian path (dades_biografiques, http) which now 404s;
    // canonicalCvUrl rewrites it to the live HTTPS Spanish bio index.
    const cvAnchor = infoCell
      .find('a')
      .filter((_, a) => {
        const href = $(a).attr('href') || ''
        return /portal_de_transparencia.*(dades_biografiques|datos_biograficos)/i.test(href)
      })
      .first()
    const cvUrl = canonicalCvUrl(cvAnchor.attr('href'), base)

    const name = parsed.name
    officials.push({
      slug: makeSlug(name),
      name,
      honorific: parsed.honorific,
      role: currentRole,
      party,
      portfolios,
      email,
      photoUrl,
      partyLogoUrl,
      cvUrl,
    })

    // After the mayor row we've emitted the first person, and the next section
    // marker ("Concejales") will flip the role. Guard: if we've already emitted
    // 1 mayor without hitting the Concejales marker, default the next person to
    // 'concejal' anyway.
    if (currentRole === 'alcalde' && officials.filter((o) => o.role === 'alcalde').length >= 1) {
      currentRole = 'concejal'
    }
  })

  return officials
}
