// @ts-check
import { useT } from '../../../i18n'

const cardStyle = {
  background: 'rgba(255,255,255,.94)',
  border: '1px solid #DCD7C8',
  borderRadius: 'var(--r-input)',
  padding: '7px 9px',
  fontFamily: "'Outfit', system-ui, sans-serif",
  boxShadow: '0 4px 16px rgba(11,15,25,.16)',
  width: 232,
}

const titleStyle = {
  fontFamily: "'DM Mono', monospace",
  fontSize: 8.5,
  color: 'rgba(11,15,25,.62)',
  letterSpacing: '.1em',
  textTransform: 'uppercase',
  marginBottom: 4,
}

/**
 * Source note for the PATRICOVA flood-risk overlay. Deliberately describes the
 * ramp rather than faking a single swatch — the WMS renders its own multi-level
 * risk colouring. Shown only while the flood layer is toggled on.
 */
export function FloodLegend() {
  const t = useT()
  return (
    <div style={cardStyle}>
      <div style={titleStyle}>{t('map.flood.title')}</div>
      <div style={{ fontSize: 11, color: 'rgba(11,15,25,.7)', lineHeight: 1.35 }}>
        Zonas oficiales de peligrosidad · <strong>PATRICOVA</strong> (Generalitat Valenciana / ICV).
        Tonos más intensos = mayor riesgo.
      </div>
    </div>
  )
}
