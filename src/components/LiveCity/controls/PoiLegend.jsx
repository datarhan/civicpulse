// @ts-check
import { useCivicPoi } from '../../../hooks/useCivicPoi'
import { groupPoiByCategory } from '../../../lib/civic-poi'
import { useT } from '../../../i18n'

const cardStyle = {
  background: 'rgba(255,255,255,.94)',
  border: '1px solid #DCD7C8',
  borderRadius: 9,
  padding: '7px 9px',
  fontFamily: "'Outfit', system-ui, sans-serif",
  boxShadow: '0 4px 16px rgba(11,15,25,.16)',
  width: 200,
}

const titleStyle = {
  fontFamily: "'DM Mono', monospace",
  fontSize: 8.5,
  color: 'rgba(11,15,25,.55)',
  letterSpacing: '.1em',
  textTransform: 'uppercase',
  marginBottom: 5,
}

/** Legend for the civic-POI layer: one row per present category with a colour
 *  swatch + count. Omits empty categories. Shown only while the layer is on. */
export function PoiLegend() {
  const t = useT()
  const { data } = useCivicPoi()
  const grouped = groupPoiByCategory(data?.pois)
  if (grouped.size === 0) return null
  return (
    <div style={cardStyle}>
      <div style={titleStyle}>{t('map.poi.title')}</div>
      <div style={{ display: 'grid', gap: 3 }}>
        {[...grouped.entries()].map(([key, { label, color, items }]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
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
            <span style={{ flex: 1, color: 'rgba(11,15,25,.75)' }}>{label}</span>
            <span className="mono" style={{ fontWeight: 700, color: '#0B0F19' }}>
              {items.length}
            </span>
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 5,
          fontSize: 9,
          color: 'rgba(11,15,25,.5)',
          fontFamily: "'DM Mono', monospace",
        }}
      >
        {t('map.poi.source')}
      </div>
    </div>
  )
}
