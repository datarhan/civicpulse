import { describe, it, expect } from 'vitest'
import { normaliseForQuoteMatch, quoteAppearsIn } from '../scripts/check-finding-quotes'

describe('check-finding-quotes', () => {
  const line = '[12.3 → 15.6] (SPEAKER_00) Tres días después, el día 12, ya está otra empresa.'

  it('strips timestamps and speaker tags before comparing', () => {
    expect(normaliseForQuoteMatch(line)).toBe('tres dias despues el dia 12 ya esta otra empresa')
  })

  it('finds a quote regardless of punctuation and accents', () => {
    expect(quoteAppearsIn('tres dias despues el dia 12 ya esta otra empresa', line)).toBe(true)
  })

  it('finds a quote that the curator trimmed', () => {
    expect(quoteAppearsIn('Tres días después, el día 12, ya está otra', line)).toBe(true)
  })

  it('reports drift when the wording genuinely differs', () => {
    // whisper wrote "Riva Roja"; the corrected transcript says "Riba-roja".
    expect(quoteAppearsIn('En Riva Roja se aprueba el contrato', line)).toBe(false)
  })

  it('treats an empty quote as absent rather than trivially present', () => {
    expect(quoteAppearsIn('', line)).toBe(false)
  })
})
