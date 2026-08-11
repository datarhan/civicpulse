import { describe, it, expect } from 'vitest'
import { retract } from '../scripts/retract-guessed-attributions'

const tally = () => ({}) as Record<string, number>

describe('retract — scope', () => {
  it('nulls a speakerGroup wherever it appears', () => {
    const t = tally()
    expect(retract({ speakerGroup: 'PSOE' }, t)).toEqual({ speakerGroup: null })
    expect(t).toEqual({ PSOE: 1 })
  })

  it('reaches nested objects and arrays', () => {
    const t = tally()
    const out = retract({ items: [{ quotes: [{ speakerGroup: 'VOX' }] }] }, t)
    expect(out).toEqual({ items: [{ quotes: [{ speakerGroup: null }] }] })
    expect(t).toEqual({ VOX: 1 })
  })

  /**
   * The load-bearing guarantee. A migration that touches one field must be
   * demonstrably unable to touch another — this repo has been bitten by passes
   * that quietly rewrote more than they advertised.
   */
  it('moves nothing else, including fields whose VALUE looks like a bloc', () => {
    const t = tally()
    const input = {
      id: 'c-1',
      verbatim: 'El PSOE votó a favor',
      party: 'PSOE',
      bloc: 'PP',
      reasoning: 'PSOE aparece en el texto',
      entities: { referencedEntity: 'PSOE' },
      confidence: 0.9,
      speakerGroup: 'PSOE',
    }
    expect(retract(input, t)).toEqual({ ...input, speakerGroup: null })
    // Exactly one rewrite, not six.
    expect(t).toEqual({ PSOE: 1 })
  })

  it('leaves an already-null attribution alone and does not count it', () => {
    const t = tally()
    expect(retract({ speakerGroup: null }, t)).toEqual({ speakerGroup: null })
    expect(t).toEqual({})
  })

  it('never produces a non-null bloc, whatever it is fed', () => {
    const t = tally()
    for (const v of ['PSOE', 'PP', 'VOX', 'Compromís', 'EU-Podem', 'Otro', 'inventado']) {
      const out = retract({ speakerGroup: v }, t) as { speakerGroup: unknown }
      expect(out.speakerGroup).toBeNull()
    }
  })

  it('is pure — the input tree is not mutated', () => {
    const input = { speakerGroup: 'PSOE' as string | null }
    retract(input, tally())
    expect(input.speakerGroup).toBe('PSOE')
  })

  it('passes primitives and nullish through untouched', () => {
    const t = tally()
    expect(retract(null, t)).toBeNull()
    expect(retract(42, t)).toBe(42)
    expect(retract('PSOE', t)).toBe('PSOE')
    expect(t).toEqual({})
  })
})
