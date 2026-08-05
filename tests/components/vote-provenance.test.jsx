import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { VoteProvenance } from '../../src/components/plenos/VoteProvenance'
import { VOTE_SOURCE_KINDS } from '../../src/scraper/pleno-votes'

/**
 * The defect was not a missing citation — it was ONE citation covering two
 * claims of different provenance, which a reader had no way to take apart. So
 * what has to be measured here is that the page distinguishes them: two claims,
 * two named sources, two links.
 *
 * `/departamentos` made it worse by rotulating that single link «Acta oficial»
 * while it pointed at regmeet, so the reader was told the name of a document
 * the link does not lead to.
 */
const OUTCOME = {
  kind: 'regmeet',
  url: 'https://regmeet.com/aytoribarroja/participaciones/abc?idioma=castellano',
  publisher: 'Ayuntamiento de Riba-roja de Túria',
  retrievedAt: '2026-06-24',
  verification: 'sin-verificar',
}
const BREAKDOWN = {
  kind: 'transcripcion',
  url: '/data/pleno-transcripts/qz6weg.txt',
  publisher: 'CivicPulse — transcripción automática (Whisper) de la sesión',
  retrievedAt: '2026-08-01',
  verification: 'sin-verificar',
}

const hrefs = (container) => [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))

describe('a reader can tell which half of a vote came from where', () => {
  it('names and links both sources separately', () => {
    const { container } = render(
      <VoteProvenance provenance={{ outcome: OUTCOME, breakdown: BREAKDOWN }} />,
    )
    expect(screen.getByText('Resultado')).toBeTruthy()
    expect(screen.getByText('Desglose')).toBeTruthy()
    // Labels come from the schema's capability table, not from copy in the JSX.
    expect(screen.getByText(`${VOTE_SOURCE_KINDS.regmeet.label} →`)).toBeTruthy()
    expect(screen.getByText(`${VOTE_SOURCE_KINDS.transcripcion.label} →`)).toBeTruthy()
    expect(hrefs(container)).toEqual([OUTCOME.url, BREAKDOWN.url])
  })

  it('links the transcript instead of silently dropping it', () => {
    // Regression guard. `safeHref` fed a bare path to `new URL()`, which throws,
    // so ExtLink rendered an unlinked <span>: the breakdown citation vanished
    // from the page with nothing failing anywhere.
    const { container } = render(
      <VoteProvenance provenance={{ outcome: OUTCOME, breakdown: BREAKDOWN }} />,
    )
    const anchor = [...container.querySelectorAll('a')].find(
      (a) => a.getAttribute('href') === '/data/pleno-transcripts/qz6weg.txt',
    )
    expect(anchor).toBeTruthy()
  })

  it('says the breakdown has not been cotejado against the acta', () => {
    render(<VoteProvenance provenance={{ outcome: OUTCOME, breakdown: BREAKDOWN }} />)
    expect(screen.getAllByText('sin cotejar con el acta').length).toBe(2)
  })

  it('drops the "sin cotejar" marker once a curator has verified the claim', () => {
    // ABLATION for the case above: proves the marker is driven by the field and
    // is not just static copy that always renders.
    render(
      <VoteProvenance
        provenance={{
          outcome: OUTCOME,
          breakdown: {
            ...BREAKDOWN,
            verification: 'verificado',
            quote: 'tretze vots en contra i huit a favor',
            verifiedBy: 'Curator',
          },
        }}
      />,
    )
    expect(screen.queryAllByText('sin cotejar con el acta').length).toBe(1)
  })

  it('shows only the outcome when the breakdown has been withdrawn', () => {
    // ABLATION: the two-row render above proves «Desglose» is reachable, so its
    // absence here is the withdrawal and not a broken component.
    const { container } = render(
      <VoteProvenance provenance={{ outcome: OUTCOME, breakdown: null }} />,
    )
    expect(screen.getByText('Resultado')).toBeTruthy()
    expect(screen.queryByText('Desglose')).toBeNull()
    expect(hrefs(container)).toEqual([OUTCOME.url])
  })

  it('renders nothing rather than an empty frame when provenance is absent', () => {
    const { container } = render(<VoteProvenance provenance={undefined} />)
    expect(container.innerHTML).toBe('')
  })
})
