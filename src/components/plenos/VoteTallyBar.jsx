import { DIRECTION_LABEL } from '../../hooks/usePlenoVotes'
import { blocLabel } from '../../lib/party-label'

// Current corporación seat counts — fallback when a tally row omits `seats`.
const SEATS = { PSOE: 11, PP: 7, VOX: 1, Compromís: 1, 'EU-Podem': 1 }
const DIR_COLOR = {
  a_favor: 'var(--ok)',
  en_contra: 'var(--crit)',
  abstencion: 'var(--warn)',
  ausente: 'var(--ink50)',
}
const DIR_ORDER = { a_favor: 0, abstencion: 1, ausente: 2, en_contra: 3 }

/**
 * A pleno vote's per-bloc tally folded into one compact bar: each bloc is a
 * segment sized by its seats and coloured by its vote direction
 * (a_favor / en_contra / abstención / ausente). Shared across the pleno detail
 * (/plenos/:id) and the department detail (/departamentos/:slug) so the vote
 * visualisation stays consistent. Pair with <DirectionLegend/> once per list.
 */
export function VoteTallyBar({ tally }) {
  if (!tally || tally.length === 0) return null
  const sorted = [...tally].sort(
    (a, b) => (DIR_ORDER[a.direction] ?? 9) - (DIR_ORDER[b.direction] ?? 9),
  )
  return (
    <div
      style={{
        display: 'flex',
        height: 20,
        borderRadius: 'var(--r-pill)',
        overflow: 'hidden',
        gap: 1,
      }}
    >
      {sorted.map((v) => {
        const seats = v.seats || SEATS[v.bloc] || 1
        // `bloc: null` = the source records the vote but names no group. The
        // segment is ~1/21 of the bar, too narrow for «Grupo no identificado»,
        // so the glyph carries it and the tooltip spells it out.
        const named = Boolean(v.bloc)
        return (
          <div
            key={v.bloc ?? 'sin-identificar'}
            title={`${blocLabel(v.bloc)} · ${DIRECTION_LABEL[v.direction] || v.direction} · ${seats}`}
            style={{
              flex: seats,
              background: DIR_COLOR[v.direction] || 'var(--ink50)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 16,
            }}
          >
            <span
              className="mono"
              style={{ fontSize: 9, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}
            >
              {named ? v.bloc : '?'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** Colour key for the four vote directions. Render once above a list of bars. */
export function DirectionLegend() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginBottom: 12 }}>
      {Object.entries(DIR_COLOR).map(([k, c]) => (
        <span
          key={k}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11 }}
        >
          <span style={{ width: 9, height: 9, borderRadius: 'var(--r-input)', background: c }} />
          <span style={{ color: 'var(--ink70)' }}>{DIRECTION_LABEL[k] || k}</span>
        </span>
      ))}
    </div>
  )
}
