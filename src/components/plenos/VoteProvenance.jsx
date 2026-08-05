import { ExtLink } from '../Primitives'
import { VOTE_SOURCE_KINDS } from '../../scraper/pleno-votes'

/**
 * Where each half of a vote record came from.
 *
 * A vote asserts two facts of different provenance — «el punto se aprobó» and
 * «PSOE a favor, PP en contra» — and until 2026-08-05 the site showed one
 * citation for both. On /departamentos it was even labelled «Acta oficial»
 * while pointing at regmeet, which publishes the orden del día and the outcome
 * and no per-bloc tally at all; the tallies came off a Whisper transcript the
 * page never mentioned. A reader had no way to tell that half the row rested on
 * a machine transcription, because the citation they could see resolved
 * perfectly.
 *
 * So the minimum this has to do is make the two distinguishable: one line per
 * claim, each naming its own source, each linking to it. The label comes from
 * `VOTE_SOURCE_KINDS` — imported, not restated, so a page cannot describe a
 * source as something the schema does not think it is.
 *
 * «sin cotejar con el acta» is shown wherever `verification !== 'verificado'`,
 * which today is every row. It is not a disclaimer bolted on: it is the field
 * a curator flips, with a verbatim quote and a signature, as rows get checked.
 */
export function VoteProvenance({ provenance }) {
  if (!provenance?.outcome) return null
  const rows = [
    { claim: 'Resultado', ref: provenance.outcome },
    ...(provenance.breakdown ? [{ claim: 'Desglose', ref: provenance.breakdown }] : []),
  ]
  return (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {rows.map(({ claim, ref }) => (
        <div
          key={claim}
          style={{
            display: 'flex',
            gap: 6,
            alignItems: 'baseline',
            flexWrap: 'wrap',
            fontSize: 11,
            lineHeight: 1.45,
          }}
        >
          <span
            className="mono"
            style={{
              fontSize: 9.5,
              letterSpacing: 0.3,
              color: 'var(--ink50)',
              textTransform: 'uppercase',
              minWidth: 62,
            }}
          >
            {claim}
          </span>
          <ExtLink href={ref.url} style={{ color: 'var(--civic)', textDecoration: 'none' }}>
            {VOTE_SOURCE_KINDS[ref.kind]?.label ?? ref.kind} →
          </ExtLink>
          {ref.locator && (
            <span className="mono" style={{ fontSize: 10, color: 'var(--ink50)' }}>
              {ref.locator}
            </span>
          )}
          {ref.verification !== 'verificado' && (
            <span style={{ fontSize: 10.5, color: 'var(--ink60)', fontStyle: 'italic' }}>
              sin cotejar con el acta
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
