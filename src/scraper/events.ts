/**
 * Parse the Ayuntamiento's events/agenda feed
 * (ribarroja.es/es/eventos/rss.xml) into a list of EventItem.
 *
 * Standard Drupal RSS, but each item's <description> carries the real event
 * date in a `field-name-field-fecha-del-evento` block as
 *   <time datetime="2026-10-04T17:00:00Z">04 de octubre de 2026 19:00</time>
 * — we lift both the machine `datetime` (→ eventDate, ISO/UTC) and the human
 * string (→ eventDateText, which keeps the local wall-clock time). The RSS
 * <pubDate> is when the listing was published, NOT when the event happens, so
 * it is kept separately as publishedDate.
 *
 * Pure parser — the fetch lives in scripts/scrape-events.ts.
 */

import { fnv32 } from './hash'

export interface EventItem {
  id: string
  title: string
  link: string
  eventDate: string | null // ISO 8601 (UTC) of the event itself, from <time datetime>
  eventDateText: string | null // human string e.g. "04 de octubre de 2026 19:00" (local time)
  publishedDate: string // ISO 8601 of the RSS <pubDate>
  excerpt: string | null
  image: string | null
}

function decode(s: string): string {
  return s
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

function extractItems(xml: string): string[] {
  const items: string[] = []
  const re = /<item>([\s\S]*?)<\/item>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) items.push(m[1])
  return items
}

function safeDate(raw: string | null): string {
  if (!raw) return new Date(0).toISOString()
  const d = new Date(raw)
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date(0).toISOString()
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Lift {eventDate, eventDateText} from the field-fecha-del-evento block. */
function extractEventDate(description: string): {
  eventDate: string | null
  eventDateText: string | null
} {
  const block = description.match(/field-name-field-fecha-del-evento[\s\S]{0,600}?<time[^>]*>/i)
  // Constrain the <time> match to the fecha block so an unrelated <time> in
  // the body can't be mistaken for the event date.
  const scope = block ? description.slice(description.indexOf(block[0])) : description
  const t = scope.match(/<time[^>]*\bdatetime="([^"]+)"[^>]*>([\s\S]*?)<\/time>/i)
  if (!t) return { eventDate: null, eventDateText: null }
  const iso = new Date(t[1])
  return {
    eventDate: Number.isFinite(iso.getTime()) ? iso.toISOString() : null,
    eventDateText: stripTags(t[2]) || null,
  }
}

function extractExcerpt(description: string): string | null {
  const p = description.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
  const text = p ? stripTags(p[1]) : ''
  if (!text) return null
  return text.length > 220 ? text.slice(0, 220).trimEnd() + '…' : text
}

function extractImage(description: string): string | null {
  const m = description.match(/<img[^>]*\bsrc="([^"]+)"/i)
  return m ? m[1] : null
}

export function parseEventsRss(xml: string): EventItem[] {
  const items: EventItem[] = []
  const seen = new Set<string>()

  for (const raw of extractItems(xml)) {
    const title = pickTag(raw, 'title') || ''
    const link = pickTag(raw, 'link') || ''
    if (!title || !link) continue

    const id = fnv32(link || title)
    if (seen.has(id)) continue
    seen.add(id)

    const description = pickTag(raw, 'description') || ''
    const { eventDate, eventDateText } = extractEventDate(description)

    items.push({
      id,
      title,
      link,
      eventDate,
      eventDateText,
      publishedDate: safeDate(pickTag(raw, 'pubDate') || pickTag(raw, 'dc:date')),
      excerpt: extractExcerpt(description),
      image: extractImage(description),
    })
  }

  // Chronological by event date — soonest first; undated items last.
  items.sort((a, b) => {
    if (a.eventDate && b.eventDate)
      return new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime()
    if (a.eventDate) return -1
    if (b.eventDate) return 1
    return 0
  })
  return items
}
