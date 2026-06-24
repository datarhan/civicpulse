import { DIRECTION_LABEL } from '../../hooks/usePlenoVotes'

// Current corporación seat counts — fallback when a tally row omits `seats`.
const SEATS = { PSOE: 11, PP: 7, VOX: 1, Compromís: 1, Otro: 1 }
const DIR_COLOR = {
  a_favor: 'var(--ok)',
  en_contra: 'var(--crit)',
  abstencion: 'var(--warn)',
  ausente: 'var(--ink40)',
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
    <div style={{ display: 'flex', height: 20, borderRadius: 5, overflow: 'hidden', gap: 1 }}>
      {sorted.map((v) => {
        const seats = v.seats || SEATS[v.bloc] || 1
        return (
          <div
            key={v.bloc}
            title={`${v.bloc} · ${DIRECTION_LABEL[v.direction] || v.direction} · ${seats}`}
            style={{
              flex: seats,
              background: DIR_COLOR[v.direction] || 'var(--ink40)',
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
              {v.bloc}
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
          <span style={{ width: 9, height: 9, borderRadius: 2, background: c }} />
          <span style={{ color: 'var(--ink70)' }}>{DIRECTION_LABEL[k] || k}</span>
        </span>
      ))}
    </div>
  )
}
