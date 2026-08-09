import { describe, it, expect } from 'vitest'
import {
  normaliseForQuoteMatch,
  quoteAppearsIn,
  quoteCoverage,
} from '../scripts/check-finding-quotes'

// A real fragment, with the timestamp/speaker furniture a transcript carries.
const T = [
  '[120.4 → 128.9] (SPEAKER_03) Y lo que estamos poniendo para retirar, pasar esos 50-60%',
  'que sí que se retiran de contenedores al día, pasar al 100%. Y no solo pasar al 100%,',
  '[128.9 → 140.1] (SPEAKER_03) sino cumplir otros aspectos que tiene un contrato como reprimir.',
].join('\n')

describe('normaliseForQuoteMatch', () => {
  it('strips timestamps, speaker tags, punctuation and accents', () => {
    expect(normaliseForQuoteMatch('[1.0 → 2.0] (SPEAKER_01) ¿Dónde está?')).toBe('donde esta')
  })
})

describe('quoteAppearsIn', () => {
  it('matches a quote trimmed at a different opening word', () => {
    // The regression this exists for. Four published quotes were reported as
    // traceable to no transcript because the matcher anchored on their first
    // eight words; every word after the second was verbatim. Reporting a sound
    // citation as possibly-invented spends curator attention and teaches
    // everyone to discount the alarms that are real.
    expect(quoteAppearsIn('los 50-60% que sí que se retiran de contenedores al día', T)).toBe(true)
  })

  it('still matches a quote lifted from the start', () => {
    expect(quoteAppearsIn('pasar esos 50-60% que sí que se retiran de contenedores', T)).toBe(true)
  })

  it('does NOT match invented text, even on-topic', () => {
    // The whole point of the script. Widening the window must not make it
    // vacuous — a check that cannot fail is worse than no check.
    expect(
      quoteAppearsIn('el contrato fue adjudicado sin fiscalización previa del interventor', T),
    ).toBe(false)
    expect(
      quoteAppearsIn('el alcalde reconoció que había cobrado una comisión de la empresa', T),
    ).toBe(false)
  })

  it('does NOT match the same words in a different order', () => {
    expect(quoteAppearsIn('contenedores de retiran se que sí que 50-60% los al día', T)).toBe(false)
  })

  it('rejects an empty quote rather than matching everything', () => {
    expect(quoteAppearsIn('', T)).toBe(false)
    expect(quoteAppearsIn('   ', T)).toBe(false)
  })
})

describe('quoteCoverage', () => {
  it('separates a near-verbatim quote from an invented one', () => {
    // The gap that makes the number worth printing: it tells a curator whether
    // they are looking at a trimmed citation or a fabricated sentence.
    const real = quoteCoverage('los 50-60% que sí que se retiran de contenedores al día', T)
    const fake = quoteCoverage(
      'el alcalde reconoció que había cobrado una comisión de la empresa',
      T,
    )
    expect(real).toBeGreaterThan(0.85)
    expect(fake).toBeLessThan(0.35)
  })

  it('is 0 for an empty quote', () => {
    expect(quoteCoverage('', T)).toBe(0)
  })
})
