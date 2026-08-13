import { DIRECTION_TONE } from '../../hooks/usePlenoVotes'
import { partyColor } from '../../hooks/useOfficials'
import { blocLabel } from '../../lib/party-label'

export function VoteTuple({ v }) {
  const tone = DIRECTION_TONE[v.direction] || 'neutral'
  const toneVar =
    tone === 'ok'
      ? 'var(--ok-ink)'
      : tone === 'crit'
        ? 'var(--crit-ink)'
        : tone === 'warn'
          ? 'var(--warn-ink)'
          : 'var(--ink50)'
  const bg =
    tone === 'ok'
      ? 'var(--ok-soft)'
      : tone === 'crit'
        ? 'var(--crit-soft)'
        : tone === 'warn'
          ? 'var(--warn-soft)'
          : 'var(--soft)'
  return (
    <span
      className="mono"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 8px',
        borderRadius: 'var(--r-pill)',
        fontSize: 10.5,
        background: bg,
        color: toneVar,
        fontWeight: 600,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: partyColor(v.bloc) }} />
      {blocLabel(v.bloc)} ·{' '}
      {v.direction === 'a_favor'
        ? '✓'
        : v.direction === 'en_contra'
          ? '✗'
          : v.direction === 'abstencion'
            ? '○'
            : '—'}
    </span>
  )
}
