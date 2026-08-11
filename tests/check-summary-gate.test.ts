import { describe, it, expect } from 'vitest'
import { findGateLeaks } from '../scripts/check-summary-gate'

const finding = (summary: string, quotes: Array<{ text: string }>) => ({
  id: 'f-1',
  summary,
  quotes,
})

/** gate lookup keyed by (findingId, quoteIndex), as the provenance snapshot is. */
const gates =
  (...g: Array<string | null>) =>
  (_id: string, i: number) =>
    g[i] ?? null

describe('findGateLeaks', () => {
  /**
   * The defect this exists for. `claim-public-gate.ts` promises a `hidden`
   * verbatim "never enters a deployed file"; the gate was applied to the quote
   * list and nothing checked the summary printed beside it. Measured on the
   * real corpus when written: 9 leaks across 7 findings.
   */
  it('catches a hidden quote reproduced verbatim in the summary', () => {
    const leaks = findGateLeaks(
      [
        finding('El PSOE afirmó que «No ha habido recortes ni ocultaciones».', [
          { text: 'No ha habido recortes ni ocultaciones' },
        ]),
      ],
      gates('hidden'),
    )
    expect(leaks).toHaveLength(1)
    expect(leaks[0].quoteIndex).toBe(0)
  })

  it('ignores the same text when the gate SHOWS it', () => {
    const leaks = findGateLeaks(
      [
        finding('Se dijo «una cita cualquiera de prueba».', [
          { text: 'una cita cualquiera de prueba' },
        ]),
      ],
      gates('shown'),
    )
    expect(leaks).toEqual([])
  })

  it('ignores a toggled quote too — the gate publishes those', () => {
    const leaks = findGateLeaks(
      [
        finding('Se dijo «una cita cualquiera de prueba».', [
          { text: 'una cita cualquiera de prueba' },
        ]),
      ],
      gates('toggle'),
    )
    expect(leaks).toEqual([])
  })

  it('leaves a hidden quote alone when the summary does not carry it', () => {
    const leaks = findGateLeaks(
      [
        finding('El pleno debatió el contrato de residuos.', [
          { text: 'ustedes no pagan y lo saben' },
        ]),
      ],
      gates('hidden'),
    )
    expect(leaks).toEqual([])
  })

  /**
   * Deliberately NOT caught. Judging whether prose conveys a withheld
   * accusation is editorial work; a matcher that guessed would produce the
   * false positives that get a check switched off.
   */
  it('does not attempt to catch a paraphrase', () => {
    const leaks = findGateLeaks(
      [
        finding('El PP sostiene que hubo recortes en el servicio.', [
          {
            text: 'No ha habido recortes ni ocultaciones que quieren decir, ni mujeres desprotegidas',
          },
        ]),
      ],
      gates('hidden'),
    )
    expect(leaks).toEqual([])
  })

  it('reports every leaked quote in a finding, not just the first', () => {
    const leaks = findGateLeaks(
      [
        finding(
          'Se dijo «El PP de la Generalitat no paga» y también «tienen que pagar intereses».',
          [{ text: 'El PP de la Generalitat no paga' }, { text: 'tienen que pagar intereses' }],
        ),
      ],
      gates('hidden', 'hidden'),
    )
    expect(leaks.map((l) => l.quoteIndex)).toEqual([0, 1])
  })

  it('is empty and safe with no quotes at all', () => {
    expect(findGateLeaks([finding('un sumario', [])], gates())).toEqual([])
  })
})
