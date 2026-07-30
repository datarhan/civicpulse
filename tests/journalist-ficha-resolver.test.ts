import { describe, it, expect } from 'vitest'
import { extractAnchors, matchBioAnchor } from '../src/scraper/journalist-tools/web'

// Real anchor structure from the transparencia «datos biográficos» listing
// (2026-07-30 probe of contenidos/864708/0835919).
const LISTING_HTML = `
<div><a href="/es/ayuntamiento/saluda_del_alcalde">Alcaldía</a>
<a href="/sites/www.ribarroja.es/files/migrate/864708/filesGroup/PSOE-Robert-Raga-Gadea.pdf">Dades biogràfiques Robert Raga</a>
<a href="/sites/www.ribarroja.es/files/migrate/864708/filesGroup/20250817-CV-TERESA-POZUELO.pdf">Dades biogràfiques Teresa Pozuelo</a>
<a href="/sites/www.ribarroja.es/files/migrate/864708/filesGroup/PSOE-Jose-Luis-Ramos.pdf">Dades biogràfiques José Luis Ramos</a>
<a href="/sites/www.ribarroja.es/files/migrate/864708/filesGroup/Compromis-Rafael-Folgado-Navarro.pdf">Dades biogràfiques Rafa Folgado Navarro</a></div>
`

describe('ficha bio-document resolver', () => {
  it('extracts anchors with hrefs and text', () => {
    const anchors = extractAnchors(LISTING_HTML)
    expect(anchors.length).toBeGreaterThanOrEqual(5)
    expect(anchors.some((a) => a.href.includes('Robert-Raga-Gadea.pdf'))).toBe(true)
  })

  it('matches the subject to their own PDF, not a colleague', () => {
    const anchors = extractAnchors(LISTING_HTML)
    expect(matchBioAnchor(anchors, 'Robert Raga Gadea')).toContain('PSOE-Robert-Raga-Gadea.pdf')
    expect(matchBioAnchor(anchors, 'Teresa Pozuelo Cámara')).toContain('CV-TERESA-POZUELO.pdf')
    // accent + nickname tolerance (listing says "Rafa", subject "Rafael")
    expect(matchBioAnchor(anchors, 'Rafael Folgado Navarro')).toContain('Folgado-Navarro.pdf')
  })

  it('returns null when nobody matches', () => {
    const anchors = extractAnchors(LISTING_HTML)
    expect(matchBioAnchor(anchors, 'Persona Inexistente Total')).toBeNull()
  })
})
