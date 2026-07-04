// @ts-check
import { prettyNeighborhood } from '../../../hooks/useQuejas'

const fmtEur = (n) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
    notation: 'compact',
  }).format(n)

const HEALTH_LABEL = {
  crit: 'silencio alto',
  warn: 'silencio moderado',
  ok: 'mayoría resueltas',
  civic: 'en curso',
  neutral: '',
}

const labelStyle = {
  fontFamily: "'DM Mono', monospace",
  fontSize: 8.5,
  color: 'rgba(11,15,25,.5)',
  letterSpacing: '.08em',
  textTransform: 'uppercase',
}
const valueStyle = { fontSize: 12.5, color: '#0B0F19', marginTop: 1 }
const subStyle = { fontSize: 10.5, color: 'rgba(11,15,25,.55)' }

/**
 * Aggregated civic card for one neighborhood: population (always), located
 * contract spend (or an honest "sin obras" note), and quejas with a health chip
 * — but only when quejas exist. Never colours a barrio from an absence of data.
 */
export function NeighborhoodPopup({ agg }) {
  const { name, population, contractCount, amount, danaAmount, quejas, health } = agg
  return (
    <div style={{ fontFamily: 'Outfit, system-ui, sans-serif', minWidth: 210, maxWidth: 280 }}>
      <div style={{ fontSize: 15, fontWeight: 700 }}>{prettyNeighborhood(name)}</div>
      <div style={{ marginTop: 7, display: 'grid', gap: 8 }}>
        <div>
          <div style={labelStyle}>Población</div>
          <div style={valueStyle}>
            {population ? `${population.toLocaleString('es-ES')} hab.` : '—'}
          </div>
        </div>

        <div>
          <div style={labelStyle}>Inversión situada</div>
          {contractCount > 0 ? (
            <>
              <div style={valueStyle}>
                {fmtEur(amount)} · {contractCount} obra{contractCount === 1 ? '' : 's'}
              </div>
              {danaAmount > 0 && (
                <div style={subStyle}>incluye {fmtEur(danaAmount)} recuperación DANA</div>
              )}
            </>
          ) : (
            <div style={subStyle}>sin obras cuyo título nombre el barrio</div>
          )}
        </div>

        <div>
          <div style={labelStyle}>Quejas ciudadanas</div>
          {quejas.total > 0 ? (
            <div
              style={{
                ...valueStyle,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexWrap: 'wrap',
              }}
            >
              <span>
                {quejas.total} · <span style={{ color: '#16A34A' }}>✓{quejas.resueltas}</span>{' '}
                <span style={{ color: '#2463EB' }}>⏳{quejas.pendientes}</span>
                {quejas.silencios > 0 && (
                  <span style={{ color: '#DC2626' }}> ⚠{quejas.silencios}</span>
                )}
              </span>
              {HEALTH_LABEL[health.level] && (
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    color: health.color,
                    border: `1px solid ${health.color}`,
                    borderRadius: 999,
                    padding: '1px 6px',
                  }}
                >
                  {HEALTH_LABEL[health.level]}
                </span>
              )}
            </div>
          ) : (
            <div style={subStyle}>sin quejas registradas</div>
          )}
        </div>
      </div>
    </div>
  )
}
