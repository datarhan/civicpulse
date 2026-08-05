import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { VoteBreakdownRetracted } from '../../src/components/plenos/VoteBreakdownRetracted'
import { VoteTallyBar } from '../../src/components/plenos/VoteTallyBar'
import { validateSnapshot, retractVoteBreakdown } from '../../src/scraper/pleno-votes'

/**
 * The point of a retraction is what a READER stops seeing. Asserting the JSON
 * changed is not that assertion — the surface has to be measured too, and it
 * has to be measured against the components /plenos/:id and /departamentos/:slug
 * actually mount.
 *
 * Each "it is gone" check is paired with an ablation on the same input proving
 * it was rendered before the retraction. Without that pairing these pass on an
 * empty tally, which is precisely how the mobile-clipping and axe-contrast
 * gates in this repo were green while measuring nothing.
 */

const VOTE = {
  id: 'qz6weg-14',
  plenoId: 'qz6weg',
  plenoDate: '2025-12-01',
  itemNumber: 14,
  title: 'Moció del Grup Municipal Popular en defensa dels treballadors autònoms',
  outcome: 'rechazado',
  votes: [
    { bloc: 'PSOE', direction: 'en_contra', seats: 11 },
    { bloc: 'PP', direction: 'a_favor', seats: 7 },
    { bloc: 'VOX', direction: 'a_favor', seats: 1 },
    { bloc: 'Compromís', direction: 'ausente', seats: 1 },
    { bloc: null, direction: 'a_favor', seats: 1 },
  ],
  sourceUrl: 'https://regmeet.com/aytoribarroja/participaciones/abc?idioma=castellano',
  sourcePublisher: 'Ayuntamiento de Riba-roja de Túria',
  retrievedAt: '2026-06-24',
  // The real shape of this row: regmeet carries the outcome, the session
  // transcript carries the tally, and nobody has cotejado the tally.
  provenance: {
    outcome: {
      kind: 'regmeet',
      url: 'https://regmeet.com/aytoribarroja/participaciones/abc?idioma=castellano',
      publisher: 'Ayuntamiento de Riba-roja de Túria',
      retrievedAt: '2026-06-24',
      verification: 'sin-verificar',
    },
    breakdown: {
      kind: 'transcripcion',
      url: '/data/pleno-transcripts/qz6weg.txt',
      publisher: 'CivicPulse — transcripción automática (Whisper) de la sesión',
      retrievedAt: '2026-08-01',
      verification: 'sin-verificar',
    },
  },
}

const SNAP = {
  generatedAt: '2026-08-05T00:00:00.000Z',
  source: { description: 'test', contract: 'test' },
  items: [VOTE],
}

const REASON = 'la fuente citada no publica desglose por grupos de esta votación'

describe('a withdrawn breakdown leaves no vote directions on screen', () => {
  it('renders every bloc before the retraction', () => {
    // ABLATION. If this fails, the assertion below proves nothing.
    const { container } = render(<VoteTallyBar tally={VOTE.votes} />)
    expect(screen.getByText('PSOE')).toBeTruthy()
    expect(screen.getByText('PP')).toBeTruthy()
    expect(container.querySelectorAll('[title]').length).toBe(VOTE.votes.length)
  })

  it('renders no bloc, no direction and no bar once withdrawn', () => {
    const after = validateSnapshot(
      retractVoteBreakdown(validateSnapshot(SNAP), VOTE.id, {
        reason: REASON,
        editor: 'Curator',
        at: '2026-08-05T10:00:00.000Z',
      }),
    )
    const row = after.items.find((v) => v.id === VOTE.id)

    const { container } = render(<VoteTallyBar tally={row.votes} />)
    expect(container.innerHTML).toBe('')
    for (const label of ['PSOE', 'PP', 'VOX', 'Compromís', 'A favor', 'En contra', 'Ausente']) {
      expect(screen.queryByText(label)).toBeNull()
    }
  })

  it('says the breakdown was withdrawn, and why, instead of leaving a silent hole', () => {
    render(<VoteBreakdownRetracted retraction={{ reason: REASON, retractedAt: '2026-08-05T10:00:00.000Z' }} />)
    expect(screen.getByText(/DESGLOSE POR GRUPOS RETIRADO/)).toBeTruthy()
    expect(screen.getByText(/2026-08-05/)).toBeTruthy()
    expect(screen.getByText(REASON)).toBeTruthy()
  })

  it('renders nothing at all when there is no retraction (no false notice)', () => {
    const { container } = render(<VoteBreakdownRetracted retraction={null} />)
    expect(container.innerHTML).toBe('')
  })
})
