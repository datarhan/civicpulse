import { describe, it, expect } from 'vitest'
import { mentionsRibaRojaDeTuria, parseFactcheckRss } from '../src/scraper/factcheck'

/**
 * A misattributed fact-check publishes a red "Bulo" pill under a named
 * outlet's byline, on a page headed with this town's name. Getting it wrong is
 * worse than showing nothing.
 */
describe('factcheck — municipality disambiguation', () => {
  it('rejects the Ebro/Forata dam chain letter that shipped as our only fact-check', () => {
    // Real published row: maldita.es debunk of a DANA WhatsApp chain about the
    // embalse de Forata. It mentions "Ribaroja" (the Ebro dam) 3 times and
    // "Túria" zero times.
    expect(
      mentionsRibaRojaDeTuria(
        'La presa de Ribaroja está a punto de reventar y se va a desbordar el embalse de Forata',
      ),
    ).toBe(false)
  })

  it('accepts a fact-check that names the town in full', () => {
    expect(mentionsRibaRojaDeTuria('Bulo sobre el ayuntamiento de Riba-roja de Túria')).toBe(true)
    expect(mentionsRibaRojaDeTuria('Ribarroja del Turia: no es cierto que…')).toBe(true)
  })

  it('filters the RSS path with the same rule', () => {
    const xml = `<rss><channel>
      <item><title>La presa de Ribaroja y el embalse de Forata</title>
        <link>https://maldita.es/a</link><description>DANA</description>
        <category>Bulo</category></item>
      <item><title>Riba-roja de Túria: bulo sobre el presupuesto</title>
        <link>https://maldita.es/b</link><description>x</description>
        <category>Bulo</category></item>
    </channel></rss>`
    const rows = parseFactcheckRss(xml, {
      reviewerName: 'Maldita.es',
      reviewerSite: 'maldita.es',
    })
    expect(rows.map((r) => r.reviewUrl)).toEqual(['https://maldita.es/b'])
  })
})
