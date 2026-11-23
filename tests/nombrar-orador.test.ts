import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { decidirOradorIndividual, leerEscuchado } from '../src/scraper/nombrar-orador'
import { validateFindingsSnapshot } from '../src/scraper/pleno-finding'

/**
 * Cuándo `promote-claim` pone el nombre de un concejal en un hallazgo.
 *
 * EL FALLO, visto el 2026-11-23: `--individual-speaker` valía `auto` por
 * defecto. Si las declaraciones citadas compartían un `speakerSlug` —que
 * escribía el extractor a partir de la identificación por voz—, el hallazgo
 * salía con el nombre sin que el curador lo pidiera ni dijera qué había
 * escuchado. Tampoco miraba la veda electoral ni los grupos de un escaño.
 */
const base = {
  pedido: 'robert-raga-gadea',
  escuchado: '1200-1260',
  veda: null,
  partido: 'PSOE',
  gruposDeUnEscano: ['VOX', 'EU-Podem', 'Compromís'],
  nivelC: false,
}

describe('decidirOradorIndividual', () => {
  it('sin pedirlo no nombra a nadie', () => {
    expect(decidirOradorIndividual({ ...base, pedido: 'none' })).toEqual({ nombrar: false })
  })

  it('«auto» ya no existe: el nombre lo pide el curador, no las declaraciones', () => {
    const r = decidirOradorIndividual({ ...base, pedido: 'auto' })
    expect(r.nombrar).toBe(false)
    expect('error' in r && r.error).toMatch(/auto/)
  })

  it('nombrar exige decir qué tramo se escuchó', () => {
    const r = decidirOradorIndividual({ ...base, escuchado: null })
    expect('error' in r && r.error).toMatch(/escuchado/)
  })

  it('en veda electoral no se nombra', () => {
    const r = decidirOradorIndividual({ ...base, veda: '2027-05-28' })
    expect('error' in r && r.error).toMatch(/veda/)
  })

  it('un concejal de un grupo de un escaño pide el reconocimiento expreso de nivel C', () => {
    const sin = decidirOradorIndividual({ ...base, partido: 'VOX' })
    expect('error' in sin && sin.error).toMatch(/escaño/)
    const con = decidirOradorIndividual({ ...base, partido: 'VOX', nivelC: true })
    expect(con).toEqual({ nombrar: true, escuchado: { desde: 1200, hasta: 1260 } })
  })

  it('con todo en regla, nombra y guarda el tramo escuchado', () => {
    expect(decidirOradorIndividual(base)).toEqual({
      nombrar: true,
      escuchado: { desde: 1200, hasta: 1260 },
    })
  })
})

describe('leerEscuchado', () => {
  it('lee segundos «desde-hasta»', () => {
    expect(leerEscuchado('1200.5-1260')).toEqual({ desde: 1200.5, hasta: 1260 })
  })
  it('rechaza un tramo vacío, al revés o ilegible', () => {
    expect(leerEscuchado('1260-1200')).toBeNull()
    expect(leerEscuchado('1200-1200')).toBeNull()
    expect(leerEscuchado('20 minutos')).toBeNull()
    expect(leerEscuchado('')).toBeNull()
  })
})

describe('promote-claim', () => {
  const codigo = readFileSync('scripts/promote-claim.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

  it('por defecto no nombra a nadie y decide con decidirOradorIndividual', () => {
    expect(codigo).toMatch(/individualSpeaker:\s*'none'/)
    expect(codigo).not.toMatch(/individualSpeaker:\s*'auto'/)
    expect(codigo).toMatch(/decidirOradorIndividual\(/)
  })
})

describe('pleno-findings · un nombre sin tramo escuchado no valida', () => {
  const snap = JSON.parse(readFileSync('public/data/pleno-findings.json', 'utf8'))
  const base = snap.items[0]

  it('hay un hallazgo de grupo sobre el que probar (si no, no se mira nada)', () => {
    expect(base).toBeTruthy()
    expect(() => validateFindingsSnapshot(JSON.stringify({ ...snap, items: [base] }))).not.toThrow()
  })

  it('individualSpeaker sin escuchado se rechaza; con él, valida', () => {
    const persona = { slug: 'robert-raga-gadea', name: 'Robert Raga Gadea', party: 'PSOE' }
    const sin = { ...base, individualSpeaker: persona }
    expect(() => validateFindingsSnapshot(JSON.stringify({ ...snap, items: [sin] }))).toThrow(
      /escuchado/,
    )
    const con = { ...base, individualSpeaker: { ...persona, escuchado: { desde: 10, hasta: 40 } } }
    expect(() => validateFindingsSnapshot(JSON.stringify({ ...snap, items: [con] }))).not.toThrow()
  })
})
