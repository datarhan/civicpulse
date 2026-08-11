import { describe, it, expect } from 'vitest'
import { buildSpeakerIndex, speakerForQuote, scoreAttribution } from '../scripts/eval-extractor'
import type { SpeakerMap } from '../src/scraper/speaker-map'

/**
 * Shaped like a real transcript: contiguous `[start → end] (SPEAKER_NN)` lines,
 * a chair granting the floor, and the granted speaker replying. Taken from the
 * measured `10yl550` window so the fixture is not invented.
 */
const TRANSCRIPT = [
  '[714.4 → 718.4] (SPEAKER_04) Per tant, recomane a la dreta que s’acoste a la família. Gràcies.',
  '[718.4 → 721.4] (SPEAKER_01) Més paraules? Compromís, Rafa.',
  '[721.4 → 727.4] (SPEAKER_05) Sí, gràcies, alcalde. Nosaltres des de Compromís anem a estar a favor.',
  '[727.4 → 733.4] (SPEAKER_05) Lo que sí que ens agradaria és que el Govern espanyol pose de la seua banda.',
].join('\n')

const MAP: SpeakerMap = {
  plenoId: 'test',
  generatedAt: '2026-08-10T00:00:00Z',
  model: 'test',
  chunkSeconds: 600,
  segments: [],
  rejected: [],
  stats: {
    chunksExpected: 1,
    chunksTranscribed: 1,
    failedChunks: [],
    labelsSeen: 3,
    rowsAccepted: 2,
    rowsRejected: 0,
    rejectedBy: {},
    coverage: 1,
  },
  rows: [
    {
      label: 'SPEAKER_05',
      bloc: 'Compromís',
      slug: 'rafael-folgado-navarro',
      heardAs: 'Rafa',
      namesIndividual: true,
      weak: false,
      evidence: [
        {
          spokenBy: 'SPEAKER_01',
          at: 718.4,
          quote: 'Compromís, Rafa.',
          relation: 'turn-grant',
        },
      ],
    },
    {
      // Deliberately weak: back-reference only. Must never score anything.
      label: 'SPEAKER_04',
      bloc: 'EU-Podem',
      slug: null,
      heardAs: 'Txema',
      namesIndividual: true,
      weak: true,
      evidence: [
        {
          spokenBy: 'SPEAKER_05',
          at: 745.4,
          quote: 'com ha dit Txema',
          relation: 'back-reference',
        },
      ],
    },
  ],
}

describe('speakerForQuote', () => {
  const idx = buildSpeakerIndex(TRANSCRIPT)

  it('finds the speaker of a quote lifted verbatim from one segment', () => {
    expect(speakerForQuote('Nosaltres des de Compromís anem a estar a favor', idx)).toBe(
      'SPEAKER_05',
    )
  })

  it('attributes a quote to whoever SAID it, not to whoever is named in it', () => {
    // The chair's line names Compromís; the chair is not Compromís. This is the
    // exact inversion that reached production, so it is asserted directly.
    expect(speakerForQuote('Més paraules? Compromís, Rafa', idx)).toBe('SPEAKER_01')
  })

  it('matches across a segment boundary', () => {
    expect(speakerForQuote('anem a estar a favor. Lo que sí que ens agradaria', idx)).toBe(
      'SPEAKER_05',
    )
  })

  it('returns null for a paraphrase rather than guessing', () => {
    expect(speakerForQuote('Compromís votará a favor de la propuesta', idx)).toBeNull()
  })

  it('never matches inside a timestamp or speaker tag', () => {
    expect(speakerForQuote('721.4 SPEAKER_05', idx)).toBeNull()
  })
})

describe('scoreAttribution', () => {
  const idx = buildSpeakerIndex(TRANSCRIPT)
  const q = 'Nosaltres des de Compromís anem a estar a favor'

  it('scores a matching bloc correct', () => {
    expect(scoreAttribution('Compromís', q, idx, MAP)).toBe('correct')
  })

  /** The production defect: filed under the bloc the speaker is arguing with. */
  it('scores a contradicted bloc wrong', () => {
    expect(scoreAttribution('PP', q, idx, MAP)).toBe('wrong')
  })

  it('scores null as abstained, never as wrong', () => {
    expect(scoreAttribution(null, q, idx, MAP)).toBe('abstained')
    expect(scoreAttribution(undefined, q, idx, MAP)).toBe('abstained')
  })

  it('cannot score a quote the map does not vouch for', () => {
    const notInMap = 'Per tant, recomane a la dreta'
    // SPEAKER_04's row is weak, so blocForLabel refuses it.
    expect(scoreAttribution('EU-Podem', notInMap, idx, MAP)).toBe('unscorable')
  })

  it('reports unscorable — never correct — when there is no map at all', () => {
    expect(scoreAttribution('Compromís', q, idx, null)).toBe('unscorable')
  })

  /**
   * The point of the whole exercise. `sentinel rate` ranked a confidently
   * wrong model ABOVE an abstaining one; precision must invert that.
   */
  it('ranks abstention above confident error', () => {
    const guessing = ['PP', 'PSOE', 'VOX'].map((b) => scoreAttribution(b, q, idx, MAP))
    const abstaining = [null, null, null].map((b) => scoreAttribution(b, q, idx, MAP))

    const prec = (rs: string[]) => {
      const judged = rs.filter((r) => r === 'correct' || r === 'wrong').length
      return judged ? rs.filter((r) => r === 'correct').length / judged : null
    }
    expect(prec(guessing)).toBe(0)
    // Abstention is not judged at all, so it cannot be dragged below zero.
    expect(prec(abstaining)).toBeNull()
    expect(guessing.filter((r) => r === 'wrong')).toHaveLength(3)
    expect(abstaining.filter((r) => r === 'wrong')).toHaveLength(0)
  })

  /**
   * Fault injection, as the plan requires: with every attribution corrupted the
   * metric must collapse. A gate nobody proved can fire is the pattern that bit
   * this repo twice.
   */
  it('collapses to zero precision when every attribution is inverted', () => {
    const truth = 'Compromís'
    const inverted = ['PSOE', 'PP', 'VOX', 'EU-Podem']
    const outcomes = inverted.map((b) => scoreAttribution(b, q, idx, MAP))
    expect(outcomes.every((o) => o === 'wrong')).toBe(true)
    expect(scoreAttribution(truth, q, idx, MAP)).toBe('correct')
  })
})
