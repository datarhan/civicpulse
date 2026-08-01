import { describe, it, expect } from 'vitest'
import { _BOE_TRIGGER_RE } from '../src/scraper/press-verifier'

/**
 * This council publishes in Valencian and so does its main local paper, so a
 * Spanish-only trigger list silently disables the whole BOE cross-reference.
 */
describe('press verifier — BOE trigger words', () => {
  const valencian = [
    "L'Ajuntament aprova l'ordenança fiscal per a 2026",
    'El ple ratifica el conveni amb la Generalitat',
    'Resolució de la subvenció per a entitats esportives',
    "Decret d'alcaldia sobre l'expropiació de la parcel·la",
    'Sanció per incompliment del contracte',
  ]
  const spanish = [
    'El Ayuntamiento aprueba la ordenanza fiscal para 2026',
    'Resolución de la subvención para entidades deportivas',
    'Convenio con la Generalitat',
  ]

  it.each(valencian)('matches the Valencian form: %s', (t) => {
    expect(_BOE_TRIGGER_RE.test(t)).toBe(true)
  })

  it.each(spanish)('still matches the Spanish form: %s', (t) => {
    expect(_BOE_TRIGGER_RE.test(t)).toBe(true)
  })

  it('does not fire on an unrelated sentence', () => {
    expect(_BOE_TRIGGER_RE.test('Riba-roja reconeix 31 esportistes i 18 clubs')).toBe(false)
  })
})
