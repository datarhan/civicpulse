/**
 * Pure RSS 2.0 builder for the open job vacancies. Consumed by
 * scripts/scrape-empleo.ts, which writes the result to
 * public/data/empleo-rss.xml. No I/O here so it stays unit-testable.
 */
import type { OfertaItem } from './empleo'

function xmlEscape(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** ISO → RFC-822 date (RSS pubDate format); '' when unparseable. */
function rfc822(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toUTCString()
}

function itemDescription(o: OfertaItem): string {
  const d = o.detail
  const bits: string[] = []
  if (d?.tipoContrato) bits.push(d.tipoContrato)
  if (d?.jornada) bits.push(`Jornada: ${d.jornada}`)
  const lugar = (d && d.municipio) || o.location
  if (lugar) bits.push(`Lugar: ${lugar}`)
  if (o.deadline) bits.push(`Fin inscripción: ${o.deadline}`)
  let desc = bits.join(' · ')
  if (d?.funciones) {
    const f = d.funciones.length > 400 ? d.funciones.slice(0, 400) + '…' : d.funciones
    desc = desc ? `${desc}. ${f}` : f
  }
  return desc
}

/**
 * Build an RSS 2.0 feed of the open vacancies, newest-published first.
 * @param opts.siteUrl     canonical site origin (for the channel <link>)
 * @param opts.generatedAt ISO timestamp for <lastBuildDate>
 * @param opts.limit       cap to the N most recent (default: all)
 */
export function buildEmpleoRss(
  offers: OfertaItem[],
  opts: { siteUrl: string; generatedAt: string; limit?: number },
): string {
  const site = opts.siteUrl.replace(/\/+$/, '')
  const sorted = [...(offers || [])].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  const limited = opts.limit ? sorted.slice(0, opts.limit) : sorted
  const items = limited
    .map((o) => {
      const title = o.location
        ? `${o.titulo} — ${(o.detail && o.detail.municipio) || o.location}`
        : o.titulo
      const pub = rfc822(o.publishedAt)
      return [
        '    <item>',
        `      <title>${xmlEscape(title)}</title>`,
        `      <link>${xmlEscape(o.url)}</link>`,
        `      <guid isPermaLink="false">empleo-${o.fo}</guid>`,
        pub ? `      <pubDate>${pub}</pubDate>` : '',
        `      <description>${xmlEscape(itemDescription(o))}</description>`,
        '    </item>',
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '  <channel>',
    '    <title>Ofertas de empleo · Riba-roja de Túria</title>',
    `    <link>${xmlEscape(site + '/empleo')}</link>`,
    '    <description>Ofertas abiertas de la Agència de Col·locació (ADL) del Ajuntament de Riba-roja de Túria</description>',
    '    <language>es-ES</language>',
    `    <lastBuildDate>${rfc822(opts.generatedAt)}</lastBuildDate>`,
    items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n')
}
