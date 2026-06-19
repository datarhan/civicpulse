/**
 * Parse a transparency-portal index page (ribarroja.es Drupal "contenidos"
 * page) into a list of linked official PDF documents.
 *
 * This is deliberately a *link index*, not a data extractor: it surfaces the
 * official documents (RPT/plantilla = staffing + salary structure, councillor
 * CVs, …) as citable links, WITHOUT extracting salaries, asset figures, or any
 * other libel-sensitive content from inside the PDFs. Deep per-PDF extraction
 * (e.g. salary tables) would route through the journalist subsystem's pdf-parse
 * pipeline under its legal-sensitivity gate — out of scope here.
 *
 * Each document anchor on these pages carries `type="application/pdf"`, a clean
 * human anchor text (the title), and an `/sites/.../files/...pdf` href.
 *
 * Pure parser — the fetch lives in scripts/scrape-transparency.ts.
 */

import { load } from 'cheerio'
import { sha256Short } from './hash'

export interface TransparencyDoc {
  id: string // stable: sha256Short(url)
  title: string
  url: string // absolute PDF url
  category: string // machine key, e.g. 'rpt' | 'cv'
  categoryLabel: string
  year: number | null // lifted from the title/filename when present
}

export interface ParseTransparencyOptions {
  category: string
  categoryLabel: string
  base?: string
}

function absolutise(href: string, base: string): string {
  if (/^https?:\/\//i.test(href)) return href
  if (href.startsWith('/')) return `${base}${href}`
  return `${base}/${href}`
}

export function parseTransparencyDocs(
  html: string,
  opts: ParseTransparencyOptions,
): TransparencyDoc[] {
  const base = (opts.base || 'https://www.ribarroja.es').replace(/\/+$/, '')
  const $ = load(html)
  const docs: TransparencyDoc[] = []
  const seen = new Set<string>()

  $('a[type="application/pdf"], a[href$=".pdf"]').each((_, a) => {
    const $a = $(a)
    const href = $a.attr('href')
    if (!href) return
    const url = absolutise(href, base)
    if (seen.has(url)) return
    seen.add(url)

    const text = $a.text().replace(/\s+/g, ' ').trim()
    const titleAttr = ($a.attr('title') || '').replace(/\.pdf$/i, '').trim()
    const fileName = decodeURIComponent(url.split('/').pop() || '').replace(/\.pdf$/i, '')
    const title = text || titleAttr || fileName || 'Documento'
    const ym = `${text} ${titleAttr} ${fileName}`.match(/\b(20\d\d)\b/)

    docs.push({
      id: sha256Short(url),
      title,
      url,
      category: opts.category,
      categoryLabel: opts.categoryLabel,
      year: ym ? Number(ym[1]) : null,
    })
  })

  return docs
}
