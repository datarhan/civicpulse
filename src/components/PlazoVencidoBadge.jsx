import { Pill } from './Primitives'
import { useT } from '../i18n'

/**
 * Soft flag — renders "plazo vencido · sin evidencia de ejecución" as a
 * warn-toned pill when a commitment has a past dueBy and no later
 * execution evidence. The underlying promise/vote status is NEVER
 * auto-flipped; the V1_STATUSES gate in src/scraper/promises.ts is the
 * only surface that can move records to cumplida/no-ejecutada.
 *
 * Hidden entirely during the LOREG electoral freeze window — pass
 * `frozen={isPromiseFrozen(snap)}` to suppress. This matches the same
 * editorial rule /promesas applies to promise statuses.
 */
export function PlazoVencidoBadge({ dueBy, frozen = false, note }) {
  const t = useT()
  if (frozen) return null
  if (!dueBy || typeof dueBy !== 'string') return null
  const today = new Date().toISOString().slice(0, 10)
  if (dueBy >= today) return null
  return (
    <span
      title={`${t('plazo.hint')}${note ? ` — ${note}` : ''}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
    >
      <Pill tone="warn" size="xs">
        ⚠ {t('plazo.vencido')}
      </Pill>
      <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
        {dueBy}
      </span>
    </span>
  )
}

export default PlazoVencidoBadge
