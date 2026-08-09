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

  it('marks the transcript-sourced breakdown as uncotejado', () => {
    render(<VoteProvenance provenance={{ outcome: OUTCOME, breakdown: BREAKDOWN }} />)
    expect(screen.getByText(VOTE_SOURCE_KINDS.transcripcion.unverifiedNote)).toBeTruthy()
  })

  it('does NOT put the acta caveat under a regmeet-sourced outcome', () => {
    // The defect: ONE hard-coded «sin cotejar con el acta» was applied to both
    // rows, so every vote carried the acta caveat twice and one of the two was
    // false. regmeet is the council's own session portal and it publishes the
    // result as its record; there is nothing above it to cotejar the outcome
    // against. Both rows here are `sin-verificar`, so a component that still
    // keyed off that field alone would print two caveats.
    const { container } = render(
      <VoteProvenance provenance={{ outcome: OUTCOME, breakdown: BREAKDOWN }} />,
    )
    expect(container.textContent).not.toMatch(/sin cotejar con el acta/)
    const notes = [...container.querySelectorAll('span')]
      .map((s) => s.textContent)
      .filter((t) => /sin cotejar/.test(t))
    // Exactly one row is caveated, and it is the transcript one.
    expect(notes).toEqual([VOTE_SOURCE_KINDS.transcripcion.unverifiedNote])
  })

  it('caveats an outcome read off the VIDEO, which is a different source kind', () => {
    // ABLATION for the case above: the outcome row is perfectly capable of
    // rendering a caveat, so its silence under regmeet is the source kind
    // talking and not a row that lost the ability to say anything.
    const { container } = render(
      <VoteProvenance
        provenance={{
          outcome: { ...OUTCOME, kind: 'video', url: 'https://youtu.be/abcdefghijk' },
          breakdown: BREAKDOWN,
        }}
      />,
    )
    expect(screen.getByText(VOTE_SOURCE_KINDS.video.unverifiedNote)).toBeTruthy()
    expect(container.textContent).toContain(VOTE_SOURCE_KINDS.transcripcion.unverifiedNote)
  })

  it('says WHICH document a verified claim was cotejado against, never «el acta» by default', () => {
    // A curator may legitimately cotejar a transcript-derived tally against the
    // session video (see isIndependentVerificationSource). Printing «cotejado
    // con el acta» there would be the same misdescription in the other
    // direction, so the row names the document it actually cites.
    render(
      <VoteProvenance
        provenance={{
          outcome: OUTCOME,
          breakdown: {
            ...BREAKDOWN,
            verification: 'verificado',
            quote: 'tretze vots en contra i huit a favor',
            verifiedBy: 'Curator',
            verifiedAgainst: { kind: 'video', url: 'https://youtu.be/abcdefghijk' },
          },
        }}
      />,
    )
    expect(screen.getByText(`cotejado contra ${VOTE_SOURCE_KINDS.video.label}`)).toBeTruthy()
    expect(screen.queryByText(VOTE_SOURCE_KINDS.transcripcion.unverifiedNote)).toBeNull()
  })

  it('keeps the caveat on a claim that calls itself verified without an independent source', () => {
    // The reader must not be told a self-verified tally was cotejado. The page
    // reads `isIndependentlyVerified`, not the raw flag, so the marker survives
    // exactly the edit the validator refuses to write.
    render(
      <VoteProvenance
        provenance={{
          outcome: OUTCOME,
          breakdown: {
            ...BREAKDOWN,
            verification: 'verificado',
            quote: 'tretze vots en contra i huit a favor',
            verifiedBy: 'Curator',
            verifiedAgainst: { kind: 'transcripcion', url: BREAKDOWN.url },
          },
        }}
      />,
    )
    expect(screen.getByText(VOTE_SOURCE_KINDS.transcripcion.unverifiedNote)).toBeTruthy()
    expect(screen.queryByText(/^cotejado contra/)).toBeNull()
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
