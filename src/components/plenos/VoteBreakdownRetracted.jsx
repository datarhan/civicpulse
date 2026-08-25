/**
 * Rendered where a vote's per-bloc tally used to be, once a curator withdrew it.
 *
 * A withdrawn breakdown leaves the row published — item, title, outcome and
 * source are what the cited source actually carries — so the slot the bar
 * occupied would otherwise be a silent hole. Silence is acceptable where a
 * whole vote was retracted (the row is simply gone, and nothing implies it
 * should be there). It is not acceptable here: the reader can see the outcome
 * and would reasonably assume the site never knew who voted how, when in fact
 * it published a tally and took it back.
 *
 * This states the withdrawal and its reason, and nothing else. It never
 * paraphrases or partially restores the tally — a retraction only ever removes.
 */
export function VoteBreakdownRetracted({ retraction }) {
  if (!retraction) return null
  const { reason, retractedAt } = retraction
  const day = typeof retractedAt === 'string' ? retractedAt.slice(0, 10) : null
  return (
    <div
      style={{
        marginTop: 8,
        padding: '8px 10px',
        borderRadius: 'var(--r-input)',
        border: '1px dashed var(--border2)',
        background: 'var(--soft)',
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          letterSpacing: 0.3,
          color: 'var(--ink50)',
          marginBottom: 3,
        }}
      >
        DESGLOSE POR GRUPOS RETIRADO{day ? ` · ${day}` : ''}
      </div>
      <div style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink70)', lineHeight: 1.45 }}>
        {reason}
      </div>
    </div>
  )
}
