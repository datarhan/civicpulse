/**
 * <DataAsOf> — small "Datos al …" chip surfaced on data-heavy pages
 * so readers can gauge how fresh the snapshot they're looking at is.
 *
 * Renders inside the existing <Pill> primitive with tone derived from
 * `freshnessTone()`. The visible label is the relative-time string from
 * `timeAgo()` (reused — single source of truth across the SPA). Tooltip
 * carries the absolute ISO so a curator can audit precisely.
 *
 * Props:
 *   iso    — generatedAt from the snapshot envelope; missing/invalid
 *            renders an honest "—" with `crit` tone.
 *   label  — optional short context (e.g. "Presupuesto"). When omitted,
 *            the chip shows just the relative time.
 *   size   — 'xs' | 'sm' (default 'xs' — these chips live in card
 *            headers, where space is tight).
 */
import { Pill } from './Primitives'
import { timeAgo } from '../hooks/usePress'
import { freshnessTone } from '../lib/data-freshness'

export default function DataAsOf({ iso, label, size = 'xs' }) {
  const tone = freshnessTone(iso)
  const rel = iso ? timeAgo(iso) : ''
  const text = rel || '—'
  const display = label ? `${label} · ${text}` : `Datos · ${text}`
  return (
    <span title={iso || 'sin fecha de generación'} style={{ display: 'inline-flex' }}>
      <Pill tone={tone} size={size}>
        {display}
      </Pill>
    </span>
  )
}
