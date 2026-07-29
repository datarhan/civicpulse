import { describe, it, expect } from 'vitest'
import { trustForUrl } from '../src/scraper/journalist-tools/domain-trust'

describe('trustForUrl', () => {
  it('rates official/institutional domains high', () => {
    expect(trustForUrl('https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-1')).toBe('high')
    expect(trustForUrl('https://dogv.gva.es/datos/2026/07/01/pdf/x.pdf')).toBe('high')
    expect(trustForUrl('https://www.ribarroja.es/es/noticias/algo')).toBe('high')
    expect(trustForUrl('https://www.transportes.gob.es/ministerio/nota')).toBe('high')
    expect(trustForUrl('https://ted.europa.eu/es/notice/123')).toBe('high')
    expect(trustForUrl('https://www.ine.es/jaxiT3/Tabla.htm?t=2903')).toBe('high')
  })

  it('rates established press medium', () => {
    expect(trustForUrl('https://www.lasprovincias.es/comunitat/robert-raga.html')).toBe('medium')
    expect(trustForUrl('https://www.levante-emv.com/horta/2026/07/01/x.html')).toBe('medium')
    expect(trustForUrl('https://www.eldiario.es/comunitat-valenciana/x')).toBe('medium')
    expect(trustForUrl('https://valenciaplaza.com/algo')).toBe('medium')
    expect(trustForUrl('https://www.infoturia.com/riba-roja-de-turia/x')).toBe('medium')
    expect(trustForUrl('https://www.elperiodic.com/riba-roja/x')).toBe('medium')
    expect(trustForUrl('https://es.wikipedia.org/wiki/Riba-roja_de_T%C3%BAria')).toBe('medium')
  })

  it('rates unknown domains low (honest default — curator sees it in the ledger)', () => {
    expect(trustForUrl('https://blog-random-seo.example.com/riba-roja')).toBe('low')
    expect(trustForUrl('https://noticias-turia-hoy.info/x')).toBe('low')
  })

  it('matches subdomains of trusted zones, never lookalike suffixes', () => {
    expect(trustForUrl('https://sede.ribarroja.es/tramites')).toBe('high')
    expect(trustForUrl('https://carto.icv.gva.es/wms')).toBe('high')
    // lookalike: notboe.es must NOT inherit boe.es's tier
    expect(trustForUrl('https://notboe.es/x')).toBe('low')
    expect(trustForUrl('https://fakegva.es/x')).toBe('low')
  })

  it('degrades to low on unparseable urls', () => {
    expect(trustForUrl('not a url')).toBe('low')
    expect(trustForUrl('')).toBe('low')
  })
})
