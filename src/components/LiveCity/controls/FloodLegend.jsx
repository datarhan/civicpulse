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
  fontSize: 'var(--fs-micro)',
  color: 'rgba(11,15,25,.62)',
  letterSpacing: '.1em',
  textTransform: 'uppercase',
  marginBottom: 4,
}

/**
 * Source note for the PATRICOVA flood-risk overlay. Deliberately describes the
 * ramp rather than faking a single swatch — the WMS renders its own multi-level
 * risk colouring. Shown only while the flood layer is toggled on.
 *
 * Lleva además el acuse de recibo del encendido. Entre el clic y la primera
 * trama no pasaba nada visible, y el WMS del ICV va por HTTP/1.1 y **sin
 * ninguna cabecera de caché** —ni `Cache-Control`, ni `ETag`, ni `Expires`—, así
 * que cada encendido vuelve a pedirlo todo y lo que tarde la red del lector se
 * lee como que el botón no funciona.
 *
 * Es tonta a propósito: recibe `cargando`, no lo averigua. Quien monta la capa
 * es quien recibe los eventos de Leaflet, y por tanto quien lo sabe.
 */
export function FloodLegend({ cargando = false }) {
  const t = useT()
  return (
    <div style={cardStyle}>
      <div style={{ ...titleStyle, display: 'flex', justifyContent: 'space-between', gap: 6 }}>
        <span>{t('map.flood.title')}</span>
        {cargando && (
          <span style={{ letterSpacing: 0, textTransform: 'none', opacity: 0.75 }}>
            {t('map.flood.loading')}
          </span>
        )}
      </div>
      <div style={{ fontSize: 'var(--fs-aux)', color: 'rgba(11,15,25,.7)', lineHeight: 1.35 }}>
        Zonas oficiales de peligrosidad · <strong>PATRICOVA</strong> (Generalitat Valenciana / ICV).
        Tonos más intensos = mayor riesgo.
      </div>
    </div>
  )
}
