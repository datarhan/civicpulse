import { describe, it, expect } from 'vitest'
import { findGateLeaks, findHollowFindings, findNearMisses } from '../scripts/check-summary-gate'

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

/**
 * The class the leak rule only ever saw a corner of.
 *
 * A summary can convey a withheld accusation perfectly well without
 * reproducing its words, so on 2026-08-11 the leak rule found 3 hollow
 * findings and missed 8. All 11 were withdrawn; this is what stops the
 * auto-curator republishing the shape.
 */
describe('findHollowFindings', () => {
  it('reports a finding whose every quote the gate withholds', () => {
    const f = finding('El PSOE denuncia una conducta concreta del PP.', [
      { text: 'una cita' },
      { text: 'otra cita' },
    ])
    expect(findHollowFindings([f], gates('hidden', 'hidden'))).toEqual(['f-1'])
  })

  it.each([
    ['one quote survives as shown', gates('hidden', 'shown')],
    ['one quote survives as toggle', gates('hidden', 'toggle')],
  ])('leaves it alone when %s', (_label, g) => {
    const f = finding('un sumario cualquiera', [{ text: 'una cita' }, { text: 'otra cita' }])
    expect(findHollowFindings([f], g)).toEqual([])
  })

  /**
   * A finding with no quotes rests on documents, not on speech. Reporting it
   * would flag every documentary finding on the site.
   */
  it('does not report a finding that never had quotes', () => {
    expect(findHollowFindings([finding('un sumario documental', [])], gates())).toEqual([])
  })

  /** An unknown gate is not a publishable one — fail towards reporting. */
  it('treats a missing gate verdict as not publishable', () => {
    const f = finding('un sumario', [{ text: 'una cita' }])
    expect(findHollowFindings([f], gates(null))).toEqual(['f-1'])
  })
})

describe('findNearMisses', () => {
  it('reports a 6-word shared run that the 8-word blocking rule misses', () => {
    const quote = 'nosotros efectivamente contratamos de manera verbal y por emergencia'
    const summary =
      'El grupo señala que se realizaron contrataciones de manera verbal y por emergencia.'
    const g = gates('hidden')
    expect(findGateLeaks([finding(summary, [{ text: quote }])], g)).toEqual([])
    expect(
      findNearMisses([finding(summary, [{ text: quote }])], g).map((l) => l.quoteIndex),
    ).toEqual([0])
  })

  /** The two lists partition; a curator reading both must not see one row twice. */
  it('never repeats a row the blocking rule already reports', () => {
    const quote =
      'No ha habido recortes ni ocultaciones que quieren decir, ni mujeres desprotegidas'
    const f = finding(`El PSOE afirmó que «${quote}».`, [{ text: quote }])
    expect(findGateLeaks([f], gates('hidden'))).toHaveLength(1)
    expect(findNearMisses([f], gates('hidden'))).toEqual([])
  })

  it('ignores a quote the gate publishes', () => {
    const quote = 'nosotros efectivamente contratamos de manera verbal y por emergencia'
    const summary = 'Se realizaron contrataciones de manera verbal y por emergencia.'
    expect(findNearMisses([finding(summary, [{ text: quote }])], gates('toggle'))).toEqual([])
  })
})
