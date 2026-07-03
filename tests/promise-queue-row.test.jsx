import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PromiseDraftRow } from '../src/pages/curator/promise-queue'

const newDraft = {
  draftId: 'dnp-psoe-x',
  kind: 'new-promise',
  confidence: 0.8,
  grounding: { grounded: true },
  decision: 'auto-publish',
  proposed: {
    party: 'PSOE',
    title: 'Carril bici',
    quote: 'Haremos un carril bici en la avenida',
    madeAt: '2026-06-20',
    source: { url: 'https://x/n', publisher: 'Levante' },
  },
}
const statusDraft = {
  draftId: 'dsc-psoe-obra-en-progreso-abc',
  kind: 'status-change',
  confidence: 0.85,
  grounding: { grounded: true },
  decision: 'auto-publish',
  promiseId: 'psoe-obra',
  currentStatus: 'documentada',
  proposedStatus: 'en-progreso',
  evidence: {
    date: '2026-05-01',
    url: 'https://placsp/t1',
    quote: 'obra adjudicada por 240.000 €',
    publisher: 'PLACSP',
    kind: 'tender',
  },
}
const row = (draft) =>
  renderToStaticMarkup(
    <PromiseDraftRow draft={draft} onApprove={() => {}} onReject={() => {}} busy={false} />,
  )

describe('PromiseDraftRow', () => {
  it('renders a new-promise draft (title)', () => {
    expect(row(newDraft)).toContain('Carril bici')
  })

  it('renders a status-change draft (promiseId + proposed status + evidence, no blanks)', () => {
    const html = row(statusDraft)
    expect(html).toContain('psoe-obra')
    expect(html).toContain('en-progreso')
    expect(html).toContain('PLACSP')
    expect(html).not.toContain('undefined')
  })
})
