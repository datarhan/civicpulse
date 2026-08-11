import { describe, it, expect } from 'vitest'
import { findPartiesInText, normalizeParty } from '../src/lib/party-alias'

describe('normalizeParty — spoken Valencian forms', () => {
  /**
   * The chair announces groups aloud in Valencian as often as in Castilian,
   * and those announcements are the evidence the speaker map rests on. All of
   * these were measured in real pleno audio on 2026-08-10.
   */
  it.each([
    ['Partit Socialista', 'PSOE'],
    ['Partido Socialista', 'PSOE'],
    ['Partit Popular', 'PP'],
    ['Partido Popular', 'PP'],
    ['Esquerra Unida Podem', 'EU-Podem'],
    ['Esquerra Unida', 'EU-Podem'],
    ['Compromís', 'Compromís'],
    ['Vox', 'VOX'],
  ])('reconciles %s → %s', (spoken, roster) => {
    expect(normalizeParty(spoken)).toBe(roster)
  })

  it('still returns null for a label it does not know', () => {
    expect(normalizeParty('Partido Pirata')).toBeNull()
  })
})

describe('findPartiesInText', () => {
  it('finds a party named inside a turn-grant', () => {
    expect(findPartiesInText('Gràcies per la puntualitat. Eh Vox, José Luis.')).toEqual(['VOX'])
    expect(findPartiesInText('Més paraules? Compromís, Rafa.')).toEqual(['Compromís'])
  })

  it('prefers the longest alias — EU-Podem is not two separate hits', () => {
    expect(findPartiesInText('Esquerra Unida Podem, o sea, José Manuel')).toEqual(['EU-Podem'])
  })

  it('returns every distinct party in order of appearance', () => {
    expect(findPartiesInText('el Partit Popular, Vox i Compromís varen votar')).toEqual([
      'PP',
      'VOX',
      'Compromís',
    ])
  })

  /**
   * An unbounded `pp` substring would fire on ordinary Valencian and Castilian
   * words and quietly certify the wrong group — the failure mode that makes a
   * cheap matcher worse than none.
   */
  it('requires a word boundary', () => {
    expect(findPartiesInText('supposadament aixo es un apparat')).toEqual([])
    expect(findPartiesInText('el bloque de la oposicion')).toEqual([])
  })

  it('treats punctuation and hyphens as boundaries', () => {
    expect(findPartiesInText('...del PP.')).toEqual(['PP'])
    expect(findPartiesInText('grup EU-Podem')).toEqual(['EU-Podem'])
  })

  /**
   * The defect in the 2026-08-10 fixture: the model claimed «Partido Popular»
   * for a speaker whose cited evidence names no party at all. This is the
   * check that catches it.
   */
  it('finds nothing in the fixture quote that was used to claim PP', () => {
    expect(findPartiesInText('Es paraules. Abert, Pep?')).toEqual([])
  })

  it('is empty and safe on empty or nullish input', () => {
    expect(findPartiesInText('')).toEqual([])
    expect(findPartiesInText(null)).toEqual([])
    expect(findPartiesInText(undefined)).toEqual([])
  })
})
