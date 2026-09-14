// @ts-check
import { prettyNeighborhood } from '../../../hooks/useQuejas'
import { useT } from '../../../i18n'

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
  fontSize: 'var(--fs-micro)',
  color: 'rgba(11,15,25,.5)',
  letterSpacing: '.08em',
  textTransform: 'uppercase',
}
const valueStyle = { fontSize: 'var(--fs-meta)', color: '#0B0F19', marginTop: 1 }
const subStyle = { fontSize: 'var(--fs-micro)', color: 'rgba(11,15,25,.55)' }

/**
 * Aggregated civic card for one neighborhood: population (always), located
 * contract spend (or an honest "sin obras" note), and quejas with a health chip
 * — but only when quejas exist. Never colours a barrio from an absence of data.
 */
export function NeighborhoodPopup({ agg }) {
  const t = useT()
  const { name, population, contractCount, amount, danaAmount, quejas, health } = agg
  return (
    <div style={{ fontFamily: 'Outfit, system-ui, sans-serif', minWidth: 210, maxWidth: 280 }}>
      <div style={{ fontSize: 'var(--fs-body)', fontWeight: 700 }}>{prettyNeighborhood(name)}</div>
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
              {/* ✓ ⏳ ⚠ son respuestas del ayuntamiento y el plazo de la LPACAP
                  corre desde el REGISTRO: sin ninguna queja del barrio registrada
                  se publica el total y se dice por qué faltan las tres. */}
              <span>
                {quejas.total}
                {quejas.medible ? (
                  <>
                    {' '}
                    · <span style={{ color: '#16A34A' }}>✓{quejas.resueltas}</span>{' '}
                    <span style={{ color: 'var(--civic)' }}>⏳{quejas.pendientes}</span>
                    {quejas.silencios > 0 && (
                      <span style={{ color: '#DC2626' }}> ⚠{quejas.silencios}</span>
                    )}
                  </>
                ) : (
                  <span style={{ color: 'rgba(11,15,25,.55)' }}>
                    {' '}
                    · {t(`quejas.reloj.${quejas.motivo}.corto`)}
                  </span>
                )}
              </span>
              {quejas.medible && HEALTH_LABEL[health.level] && (
                <span
                  style={{
                    fontSize: 'var(--fs-micro)',
                    fontWeight: 700,
                    color: health.color,
                    border: `1px solid ${health.color}`,
                    borderRadius: 'var(--r-pill)',
                    padding: '1px 6px',
                  }}
                >
                  {HEALTH_LABEL[health.level]}
                </span>
              )}
            </div>
          ) : (
            // «sin quejas registradas» era inexacto: `total` cuenta las que
            // pusieron los vecinos, registradas o no. Registrar es el paso
            // siguiente, y es justo el que decide si se publican ✓ ⏳ ⚠.
            <div style={subStyle}>sin quejas de vecinos</div>
          )}
        </div>
      </div>
    </div>
  )
}
