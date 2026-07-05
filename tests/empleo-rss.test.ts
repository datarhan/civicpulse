import { describe, it, expect } from 'vitest'
import { buildEmpleoRss } from '../src/scraper/empleo-rss'

const mk = (o: any) => ({
  id: String(o.fo),
  fo: o.fo,
  codigo: o.codigo ?? '2026/00001',
  titulo: o.titulo ?? 'Puesto',
  publishedAt: o.publishedAt ?? '2026-05-01',
  deadline: o.deadline ?? null,
  location: o.location ?? '',
  status: 'Abierta',
  statusTone: 'ok',
  url: o.url ?? `https://ribaocupacio.portalemp.com/ofertas.html?fo=${o.fo}`,
  inRibaRoja: false,
  detail: o.detail ?? null,
})

const OFFERS = [
  mk({
    fo: 1,
    titulo: 'Limpiador/a',
    publishedAt: '2026-05-01',
    location: 'Riba-roja de Túria',
    detail: {
      tipoContrato: 'CONTRATO INDEFINIDO',
      jornada: 'Completa',
      municipio: 'Riba-roja de Túria',
      funciones: 'Limpieza de oficinas & baños <urgente>',
      fields: [],
      ocupaciones: [],
    },
  }),
  mk({ fo: 2, titulo: 'Peón', publishedAt: '2026-06-10', location: 'Paterna', detail: null }),
]

const OPTS = { siteUrl: 'https://civicpulse.example', generatedAt: '2026-07-05T10:00:00.000Z' }

describe('scraper/empleo-rss — buildEmpleoRss', () => {
  const xml = buildEmpleoRss(OFFERS, OPTS)

  it('emits a well-formed RSS 2.0 document', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('<rss version="2.0">')
    expect(xml).toContain('<channel>')
    expect(xml).toContain('</channel>')
    expect(xml.trimEnd().endsWith('</rss>')).toBe(true)
  })

  it('emits one <item> per offer, newest first', () => {
    expect((xml.match(/<item>/g) || []).length).toBe(2)
    // fo=2 (2026-06-10) is newer than fo=1 (2026-05-01) → appears first
    expect(xml.indexOf('empleo-2')).toBeLessThan(xml.indexOf('empleo-1'))
  })

  it('each item carries a stable guid, portal link, and RFC-822 pubDate', () => {
    expect(xml).toContain('<guid isPermaLink="false">empleo-1</guid>')
    expect(xml).toContain('<link>https://ribaocupacio.portalemp.com/ofertas.html?fo=1</link>')
    expect(xml).toMatch(/<pubDate>\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} GMT<\/pubDate>/)
  })

  it('escapes XML special characters in text', () => {
    expect(xml).toContain('&amp;') // the "&" in funciones
    expect(xml).toContain('&lt;urgente&gt;') // the "<urgente>" in funciones
    expect(xml).not.toContain('<urgente>')
  })

  it('honors a limit (most recent N)', () => {
    const one = buildEmpleoRss(OFFERS, { ...OPTS, limit: 1 })
    expect((one.match(/<item>/g) || []).length).toBe(1)
    expect(one).toContain('empleo-2') // the newest survives the cap
  })
})
