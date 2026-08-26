import { describe, it, expect } from 'vitest'
import {
  isCommittedContract,
  contractAmountEur,
  committedAwardYearSpan,
} from '../src/lib/contract-status'

/**
 * One predicate for "did the town commit this money", because the definition
 * had already drifted: /departamentos reported €79M while /presupuesto
 * reported €14.7M from the same snapshot on the same day.
 */
describe('contract-status', () => {
  it('counts a formalized contract — it is signed, not a draft', () => {
    expect(isCommittedContract({ status: 'formalized', assignee: 'ACME SL' })).toBe(true)
  })

  it('counts an awarded contract', () => {
    expect(isCommittedContract({ status: 'awarded', assignee: 'ACME SL' })).toBe(true)
  })

  it('counts a blank-status row that names a winner', () => {
    // Gobierto leaves status empty on rows with assignee + date + amount.
    expect(isCommittedContract({ status: 'unknown', assignee: 'ACME SL' })).toBe(true)
  })

  it('never counts a cancelled award, even with a winner named', () => {
    for (const status of ['void', 'abandoned', 'revoked']) {
      expect(isCommittedContract({ status, assignee: 'ACME SL' })).toBe(false)
    }
  })

  it('does not count an unknown row with no winner', () => {
    expect(isCommittedContract({ status: 'unknown' })).toBe(false)
  })

  it('prefers the sin-IVA amount', () => {
    expect(contractAmountEur({ finalAmountNoTaxes: 100, finalAmount: 121 })).toBe(100)
  })

  it('treats missing or non-positive amounts as zero', () => {
    expect(contractAmountEur({})).toBe(0)
    expect(contractAmountEur({ finalAmountNoTaxes: -5 })).toBe(0)
  })
})

describe('isCommittedContract — in-flight statuses', () => {
  it('does not count an open tender that already names an assignee', () => {
    // Regression: the first version of this predicate treated "not cancelled +
    // has an assignee" as committed, which counted live tenders as spend.
    expect(isCommittedContract({ status: 'open', assignee: 'ACME' })).toBe(false)
  })

  it('does not count a provisional award', () => {
    // Provisional awards can still be withdrawn before formalisation; 23 of
    // the 449 licitaciones sit in that state.
    expect(isCommittedContract({ status: 'provisionally_awarded', assignee: 'ACME' })).toBe(false)
  })

  it('still counts a blank/unknown status when a winner is named', () => {
    expect(isCommittedContract({ status: 'unknown', assignee: 'GARBIALDI, S.A.' })).toBe(true)
    expect(isCommittedContract({ status: 'unknown', assignee: '' })).toBe(false)
  })
})

describe('isCommittedContract — unrecognised vocabulary', () => {
  it('refuses a status string it does not know, even with an assignee', () => {
    // If Gobierto introduces a new status, the honest answer is "not counted
    // as spend until someone looks", not "assume it is money out the door".
    expect(isCommittedContract({ status: 'en_tramite', assignee: 'ACME' })).toBe(false)
  })
})

/**
 * El periodo que cubre una cifra de contratación.
 *
 * `/datos` publicaba «699 adjudicados · 806 expedientes» SIN periodo, justo
 * debajo de «Presupuesto municipal · Ejercicio 2025», que sí lo dice, y entre
 * fichas que lo llevan («1148 personas (2026-07)»). Un lector razonable lo lee
 * como una magnitud anual cuando son adjudicaciones de nueve años. Lo cazó el
 * reader-review la primera vez que pudo leer esa página de verdad.
 *
 * El tramo se mide sobre EXACTAMENTE las filas que `isCommittedContract`
 * acepta, que son las que la cifra cuenta. Medirlo sobre todas las filas daría
 * un periodo que no es el de su propio número — la misma clase de desajuste
 * que ya costó «806 contratos» leídos como adjudicados.
 */
describe('committedAwardYearSpan', () => {
  const c = (status: string, awardDate: string | null) => ({
    status,
    assignee: 'ACME SL',
    awardDate,
  })

  it('devuelve el primer y el último año adjudicado', () => {
    expect(
      committedAwardYearSpan([c('awarded', '2017-03-01'), c('formalized', '2026-08-01')]),
    ).toEqual({ from: 2017, to: 2026 })
  })

  it('IGNORA las filas que la cifra no cuenta', () => {
    // Una anulada de 1999 no puede ensanchar el periodo de un número que no la
    // incluye. Si esto pasa a verde con `from: 1999`, la ficha estaría
    // anunciando un tramo que su propia cifra no cubre.
    const span = committedAwardYearSpan([
      { status: 'revoked', assignee: 'ACME SL', awardDate: '1999-01-01' },
      c('awarded', '2020-05-05'),
    ])
    expect(span).toEqual({ from: 2020, to: 2020 })
  })

  it('ignora fechas ausentes o absurdas sin descartar la fila entera', () => {
    expect(
      committedAwardYearSpan([
        c('awarded', null),
        c('awarded', 'no es fecha'),
        c('awarded', '2021-01-01'),
      ]),
    ).toEqual({ from: 2021, to: 2021 })
  })

  it('sin filas fechadas devuelve null, no un tramo inventado', () => {
    expect(committedAwardYearSpan([])).toBe(null)
    expect(committedAwardYearSpan([c('awarded', null)])).toBe(null)
    expect(committedAwardYearSpan(null)).toBe(null)
  })
})
