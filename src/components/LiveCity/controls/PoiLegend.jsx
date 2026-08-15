// @ts-check
import { useCivicPoi } from '../../../hooks/useCivicPoi'
import { groupPoiByCategory, POI_HALO, POI_INK, POI_VIEWBOX } from '../../../lib/civic-poi'
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
  fontSize: 'var(--fs-micro)',
  color: 'rgba(11,15,25,.62)',
  letterSpacing: '.1em',
  textTransform: 'uppercase',
  marginBottom: 5,
}

/** Legend for the civic-POI layer: one row per present category with its
 *  SILHOUETTE + count. Omits empty categories. Shown only while the layer is on.
 *
 *  The swatch renders the same `d` the map marker does (both read
 *  lib/civic-poi.js), so a legend row cannot come to describe a shape the map
 *  stopped drawing — the failure the old colour ramp shipped in a subtler form,
 *  where six legend swatches promised a distinction the 10px dots could not
 *  make. */
export function PoiLegend() {
  const t = useT()
  const { data } = useCivicPoi()
  const grouped = groupPoiByCategory(data?.pois)
  if (grouped.size === 0) return null
  return (
    <div className="cp-poi-legend" style={cardStyle}>
      <div style={titleStyle}>{t('map.poi.title')}</div>
      <div style={{ display: 'grid', gap: 3 }}>
        {[...grouped.entries()].map(([key, { label, path, items }]) => (
          <div
            key={key}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-micro)' }}
          >
            <svg
              width={POI_VIEWBOX}
              height={POI_VIEWBOX}
              viewBox={`0 0 ${POI_VIEWBOX} ${POI_VIEWBOX}`}
              aria-hidden="true"
              focusable="false"
              style={{ flexShrink: 0, display: 'block' }}
            >
              <path
                d={path}
                fill={POI_INK}
                stroke={POI_HALO}
                strokeWidth={1.5}
                strokeLinejoin="round"
              />
            </svg>
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
          fontSize: 'var(--fs-micro)',
          color: 'rgba(11,15,25,.62)',
          fontFamily: "'DM Mono', monospace",
        }}
      >
        {t('map.poi.source')}
      </div>
    </div>
  )
}
