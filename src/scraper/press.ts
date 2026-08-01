/**
 * Parse Google News RSS ("https://news.google.com/rss/search?q=...") into a
 * deduplicated list of NewsItem.
 *
 * Google News items come shaped like:
 *   <title>Headline text - Publisher Name</title>
 *   <link>… opaque Google redirect …</link>
 *   <pubDate>Sat, 19 Apr 2026 10:30:00 GMT</pubDate>
 *   <source url="https://publisher.example">Publisher Name</source>
 *
 * We:
 *  - extract publisher from <source> (fall back to trailing " - X" segment
 *    in the title),
 *  - strip that publisher suffix from the title,
 *  - derive a deterministic stable id + a title fingerprint used to
 *    collapse the same story covered by multiple outlets,
 *  - sort newest-first.
 */

import { fnv32 } from './hash'

export interface NewsItem {
  id: string
  title: string
  link: string
  source: string
  sourceHost: string | null
  date: string // ISO 8601
  fingerprint: string
  official?: boolean // true only for the Ayuntamiento's OWN feed (primary source)
  section?: string | null // Drupal "Sección" taxonomy term (official feed only)
}

function decode(html: string): string {
  return html
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/\s+/g, ' ')
    .trim()
}

function pickTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const m = xml.match(re)
  return m ? decode(m[1]) : null
}

function pickAttr(xml: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<${tag}[^>]*\\b${attr}="([^"]*)"`, 'i')
  const m = xml.match(re)
  return m ? m[1] : null
}

function extractItems(xml: string): string[] {
  const items: string[] = []
  const re = /<item>([\s\S]*?)<\/item>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) items.push(m[1])
  return items
}

// Shared impl — these hashes are the stable NewsItem ids + fingerprints.
const fnvHash = fnv32

export function fingerprintFor(title: string): string {
  const canonical = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w.length > 2)
    .slice(0, 6)
    .join(' ')
  return fnvHash(canonical)
}

function extractHost(url: string): string | null {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return null
  }
}

function safeDate(raw: string | null): string {
  if (!raw) return new Date(0).toISOString()
  const d = new Date(raw)
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date(0).toISOString()
}

/**
 * Parse a standard WordPress / Atom-style RSS feed (one fixed publisher, no
 * Google-News " - Pub" title suffix). Used for direct publisher feeds like
 * infoturia.com/feed/, where the entire feed belongs to one outlet.
 *
 *   opts.defaultSource — publisher name to stamp on every item (e.g. the
 *     channel <title>: "Periòdic del Camp de Túria").
 *   opts.defaultHost   — host string for the `sourceHost` field
 *     (e.g. "infoturia.com"). Falls back to the item link's host.
 */
export function parseStandardRss(
  xml: string,
  opts: { defaultSource: string; defaultHost?: string | null },
): NewsItem[] {
  const items: NewsItem[] = []
  const seen = new Set<string>()

  for (const raw of extractItems(xml)) {
    const title = pickTag(raw, 'title') || ''
    const link = pickTag(raw, 'link') || ''
    const pubDate = pickTag(raw, 'pubDate') || pickTag(raw, 'dc:date')

    if (!title || !link) continue

    const fingerprint = fingerprintFor(title)
    if (seen.has(fingerprint)) continue
    seen.add(fingerprint)

    const sourceHost = opts.defaultHost ?? extractHost(link)
    items.push({
      id: fnvHash(link || title),
      title,
      link,
      source: opts.defaultSource,
      sourceHost,
      date: safeDate(pubDate),
      fingerprint,
    })
  }

  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  return items
}

const OFFICIAL_SOURCE = 'Ayuntamiento de Riba-roja de Túria'
const OFFICIAL_HOST = 'ribarroja.es'

/**
 * Lift the Drupal "Sección" taxonomy term out of an item's description HTML.
 * The municipal feed renders it as a field block:
 *   <div class="…field-name-field-seccion…"><h3 class="field__label">Sección</h3>
 *     <div class="field__items"><div class="field__item">Educacion</div></div></div>
 * Returns null when an item carries no section.
 */
function extractSection(description: string | null): string | null {
  if (!description) return null
  const m = description.match(
    /field-name-field-seccion[\s\S]*?<div class="field__item[^"]*">([\s\S]*?)<\/div>/i,
  )
  if (!m) return null
  const term = m[1]
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return term || null
}

/**
 * Parse the official municipal news feed (ribarroja.es/es/noticias/rss.xml).
 * Unlike the third-party press feeds (Google News, infoturia), this is the
 * Ayuntamiento's OWN voice, so every row is stamped `official: true` — the
 * /laboratorio surface uses that flag to triangulate official claims against
 * independent coverage. The Drupal feed embeds a `Sección` taxonomy term per
 * item, lifted into `section` for topic routing. Standard RSS otherwise, so it
 * shares the same extract/decode/fingerprint helpers as the other feeds.
 */
export function parseOfficialNewsRss(xml: string): NewsItem[] {
  const items: NewsItem[] = []
  const seen = new Set<string>()

  for (const raw of extractItems(xml)) {
    const title = pickTag(raw, 'title') || ''
    const link = pickTag(raw, 'link') || ''
    const pubDate = pickTag(raw, 'pubDate') || pickTag(raw, 'dc:date')
    if (!title || !link) continue

    const fingerprint = fingerprintFor(title)
    if (seen.has(fingerprint)) continue
    seen.add(fingerprint)

    items.push({
      id: fnvHash(link || title),
      title,
      link,
      source: OFFICIAL_SOURCE,
      sourceHost: OFFICIAL_HOST,
      date: safeDate(pubDate),
      fingerprint,
      official: true,
      section: extractSection(pickTag(raw, 'description')),
    })
  }

  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  return items
}

/**
 * Merge multiple NewsItem lists, deduping by fingerprint (so the same story
 * picked up by both Google News and a direct publisher feed collapses to
 * one row). The first occurrence wins — pass the higher-trust list first.
 */
export function mergeNewsItems(...lists: NewsItem[][]): NewsItem[] {
  const seen = new Set<string>()
  const out: NewsItem[] = []
  for (const list of lists) {
    for (const it of list) {
      if (seen.has(it.fingerprint)) continue
      seen.add(it.fingerprint)
      out.push(it)
    }
  }
  out.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  return out
}

/** One feed's result for a single scrape run. */
export interface FeedOutcome {
  /** Items parsed this run (empty when the fetch failed). */
  items: NewsItem[]
  /** Did the fetch succeed? `false` means "unknown", NOT "nothing published". */
  ok: boolean
  /** Identifies this feed's rows inside a previous snapshot. */
  owns: (item: NewsItem) => boolean
}

/**
 * Merge this run's feeds, substituting the previous snapshot's rows for any
 * feed that FAILED to fetch.
 *
 * Why: a failed fetch is missing information, not evidence that a source
 * published nothing — but the old code treated the two identically and wrote
 * the snapshot regardless. On 2026-07-30 the ribarroja.es WAF blocked the
 * runner, the official feed recorded `ok:false, items:0`, and all 50
 * town-hall articles were erased from the live site; the town hall's stream
 * stayed blank for two days even though it never stopped publishing.
 *
 * A source going legitimately quiet (`ok:true`, zero items) is still
 * published as zero — only unknowns are carried forward. Feed order is
 * preserved, so the higher-trust attribution keeps winning the fingerprint
 * dedup in `mergeNewsItems`.
 */
export function mergeWithCarryForward(
  outcomes: FeedOutcome[],
  previousItems: NewsItem[],
): { items: NewsItem[]; carriedForward: number } {
  let carriedForward = 0
  const lists = outcomes.map((o) => {
    if (o.ok) return o.items
    const recovered = previousItems.filter(o.owns)
    carriedForward += recovered.length
    return recovered
  })
  return { items: mergeNewsItems(...lists), carriedForward }
}

export function parseGoogleNewsRss(xml: string): NewsItem[] {
  const items: NewsItem[] = []
  const seen = new Set<string>()

  for (const raw of extractItems(xml)) {
    const rawTitle = pickTag(raw, 'title') || ''
    const link = pickTag(raw, 'link') || ''
    const pubDate = pickTag(raw, 'pubDate')
    const sourceName = pickTag(raw, 'source') || ''
    const sourceUrl = pickAttr(raw, 'source', 'url')

    // Google News wraps the publisher at the end of the headline as " - Pub".
    let title = rawTitle
    let source = sourceName
    const dashIdx = rawTitle.lastIndexOf(' - ')
    if (dashIdx > 0) {
      const trailing = rawTitle.slice(dashIdx + 3)
      title = rawTitle.slice(0, dashIdx).trim()
      if (!source) source = trailing.trim()
    }

    if (!title || !link) continue

    const fingerprint = fingerprintFor(title)
    if (seen.has(fingerprint)) continue
    seen.add(fingerprint)

    const date = safeDate(pubDate)
    const sourceHost = sourceUrl ? extractHost(sourceUrl) : extractHost(link)
    items.push({
      id: fnvHash(link || title),
      title,
      link,
      source: source || sourceHost || 'Desconocido',
      sourceHost,
      date,
      fingerprint,
    })
  }

  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  return items
}
