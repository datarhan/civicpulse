// @ts-check
import { prettyNeighborhood } from '../../../hooks/useQuejas'
import { useT } from '../../../i18n'
import { rellena } from '../../../lib/formatters'
import { NIVELES_QUEJAS } from '../controls/QuejasLegend'

const fmtEur = (n) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
    notation: 'compact',
  }).format(n)

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
 *
 * Los rótulos salen del catálogo: escritos aquí, la portada valenciana pintaba
 * «Población», «Inversión situada» y «Quejas ciudadanas» en castellano. El tono
 * de salud se nombra con los niveles de la leyenda de quejas (`NIVELES_QUEJAS`),
 * así que la tarjeta y la leyenda no pueden llamar de dos maneras al mismo color.
 */
export function NeighborhoodPopup({ agg }) {
  const t = useT()
  const { name, population, contractCount, amount, danaAmount, quejas, health } = agg
  const nivel = NIVELES_QUEJAS.find((l) => l.level === health.level)
  return (
    <div style={{ fontFamily: 'Outfit, system-ui, sans-serif', minWidth: 210, maxWidth: 280 }}>
      <div style={{ fontSize: 'var(--fs-body)', fontWeight: 700 }}>{prettyNeighborhood(name)}</div>
      <div style={{ marginTop: 7, display: 'grid', gap: 8 }}>
        <div>
          <div style={labelStyle}>{t('eficiencia.pares.poblacion')}</div>
          <div style={valueStyle}>
            {population
              ? rellena(t('map.barrio.habitantes'), { n: population.toLocaleString('es-ES') })
              : '—'}
          </div>
        </div>

        <div>
          <div style={labelStyle}>{t('map.barrio.inversion')}</div>
          {contractCount > 0 ? (
            <>
              <div style={valueStyle}>
                {fmtEur(amount)} · {contractCount}{' '}
                {t(contractCount === 1 ? 'map.obras.una' : 'map.obras.varias')}
              </div>
              {danaAmount > 0 && (
                <div style={subStyle}>
                  {rellena(t('map.barrio.danaIncluida'), { importe: fmtEur(danaAmount) })}
                </div>
              )}
            </>
          ) : (
            <div style={subStyle}>{t('map.barrio.sinObras')}</div>
          )}
        </div>

        <div>
          <div style={labelStyle}>{t('quejas.title')}</div>
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
              {quejas.medible && nivel && (
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
                  {t(nivel.labelKey)}
                </span>
              )}
            </div>
          ) : (
            // «sin quejas registradas» era inexacto: `total` cuenta las que
            // pusieron los vecinos, registradas o no. Registrar es el paso
            // siguiente, y es justo el que decide si se publican ✓ ⏳ ⚠.
            <div style={subStyle}>{t('map.barrio.sinQuejas')}</div>
          )}
        </div>
      </div>
    </div>
  )
}
