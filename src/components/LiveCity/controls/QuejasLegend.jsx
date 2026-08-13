// @ts-check
import { useT } from '../../../i18n'

const cardStyle = {
  background: 'rgba(255,255,255,.94)',
  border: '1px solid #DCD7C8',
  borderRadius: 'var(--r-input)',
  padding: '7px 9px',
  fontFamily: "'Outfit', system-ui, sans-serif",
  boxShadow: '0 4px 16px rgba(11,15,25,.16)',
  width: 200,
}

const titleStyle = {
  fontFamily: "'DM Mono', monospace",
  fontSize: 8.5,
  color: 'rgba(11,15,25,.62)',
  letterSpacing: '.1em',
  textTransform: 'uppercase',
  marginBottom: 5,
}

// The four health levels from lib/neighborhood-aggregate healthFromCounts, in
// severity order. Swatch colours match the Circle fills exactly.
const LEVELS = [
  { color: '#DC2626', labelKey: 'map.quejas.crit' },
  { color: '#D97706', labelKey: 'map.quejas.warn' },
  { color: '#16A34A', labelKey: 'map.quejas.ok' },
  { color: '#60A5FA', labelKey: 'map.quejas.civic' },
]

/** Legend for the quejas heat layer: the four health colours + a size note.
 *  Shown only while the layer is on. Unlike the POI legend it always renders the
 *  full fixed scale, so a citizen can decode any colour they see on the map. */
export function QuejasLegend() {
  const t = useT()
  return (
    <div style={cardStyle}>
      <div style={titleStyle}>{t('map.quejas.title')}</div>
      <div style={{ display: 'grid', gap: 3 }}>
        {LEVELS.map(({ color, labelKey }) => (
          <div
            key={labelKey}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}
          >
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: color,
                border: '1px solid #0B0F19',
                flexShrink: 0,
              }}
            />
            <span style={{ flex: 1, color: 'rgba(11,15,25,.75)' }}>{t(labelKey)}</span>
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 5,
          fontSize: 9,
          color: 'rgba(11,15,25,.62)',
          fontFamily: "'DM Mono', monospace",
        }}
      >
        {t('map.quejas.radius')}
      </div>
    </div>
  )
}
