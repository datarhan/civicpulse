import { lazy, Suspense, useState } from 'react'
import { Card } from '../Primitives'
import { Sparkline } from '../Charts'
import { offersByMunicipioGeo } from '../../lib/empleo'
import { COMARCA_COORDS } from '../../lib/comarca-coords'

// Lazy so Leaflet only loads when the reader opens the map — keeps it out of
// the base /empleo chunk.
const EmpleoMap = lazy(() => import('./EmpleoMap'))

const eyebrow = {
  fontSize: 9.5,
  color: 'var(--ink50)',
  textTransform: 'uppercase',
  letterSpacing: '.06em',
}

function Kpi({ label, value, sub, tone }) {
  const color =
    tone === 'crit' ? 'var(--crit-ink)' : tone === 'civic' ? 'var(--civic)' : 'var(--ink)'
  return (
    <div
      style={{
        padding: '10px 12px',
        border: '1px solid var(--border2)',
        borderRadius: 'var(--r-card)',
      }}
    >
      <div className="mono" style={eyebrow}>
        {label}
      </div>
      <div className="mono" style={{ fontSize: 22, fontWeight: 700, color, marginTop: 3 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10.5, color: 'var(--ink50)', marginTop: 1 }}>{sub}</div>}
    </div>
  )
}

/** Horizontal bar list — one row per {label,count}, width ∝ count/max. */
function BarList({ rows, empty }) {
  if (!rows.length) return <div style={{ fontSize: 11.5, color: 'var(--ink50)' }}>{empty}</div>
  const max = Math.max(...rows.map((r) => r.count)) || 1
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map((r) => (
        <div
          key={r.label}
          style={{ display: 'grid', gridTemplateColumns: '1fr 22px', gap: 8, alignItems: 'center' }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 11,
                color: 'var(--ink70)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                marginBottom: 2,
              }}
              title={r.label}
            >
              {r.label}
            </div>
            <div
              style={{
                height: 6,
                background: 'var(--soft)',
                borderRadius: 'var(--r-pill)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.max(4, (r.count / max) * 100)}%`,
                  background: 'var(--civic)',
                  borderRadius: 'var(--r-input)',
                }}
              />
            </div>
          </div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--ink50)', textAlign: 'right' }}>
            {r.count}
          </div>
        </div>
      ))}
    </div>
  )
}

function Panel({ title, children }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="mono" style={{ ...eyebrow, marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

/**
 * Stats + infographics for /empleo. Reacts to the active filter set — the caller
 * passes `stats` computed from the *filtered* offers so the numbers and charts
 * track what the user is looking at. `t` is the i18n function.
 */
export default function EmpleoStats({ stats, t, totalAll, offers }) {
  const [showMap, setShowMap] = useState(false)
  if (!stats || stats.total === 0) return null
  const mapPoints = showMap ? offersByMunicipioGeo(offers || [], COMARCA_COORDS) : []

  const byContract = stats.byContract.slice(0, 5).map((c) => ({ label: c.label, count: c.count }))
  const byMunicipio = stats.byMunicipio.slice(0, 5).map((m) => ({ label: m.name, count: m.count }))
  const months = stats.byMonth
  const spark = months.map((m) => m.count)

  return (
    <Card style={{ marginBottom: 14 }}>
      {/* KPI row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))',
          gap: 10,
        }}
      >
        <Kpi
          label={t('empleo.kpi.offers')}
          value={stats.total}
          sub={totalAll && totalAll !== stats.total ? `${t('empleo.kpi.of')} ${totalAll}` : null}
        />
        <Kpi label={t('empleo.kpi.positions')} value={stats.positions} tone="civic" />
        <Kpi
          label={t('empleo.kpi.inRiba')}
          value={stats.inRibaRoja}
          sub={`${stats.inRibaRojaPct}%`}
        />
        <Kpi
          label={t('empleo.kpi.closing')}
          value={stats.closingSoon}
          tone={stats.closingSoon ? 'crit' : undefined}
        />
      </div>

      {stats.vehiclePct > 0 && (
        <div
          style={{
            marginTop: 10,
            fontSize: 12,
            color: 'var(--ink70)',
            display: 'flex',
            alignItems: 'baseline',
            gap: 6,
          }}
        >
          <span className="mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--civic)' }}>
            {stats.vehiclePct}%
          </span>
          {t('empleo.kpi.vehicle')}
        </div>
      )}

      {/* charts row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          gap: 20,
          marginTop: 16,
          paddingTop: 16,
          borderTop: '1px solid var(--border2)',
        }}
      >
        <Panel title={t('empleo.chart.byMonth')}>
          {spark.length >= 2 ? (
            <>
              <Sparkline data={spark} h={42} />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: 4,
                  fontSize: 9.5,
                  color: 'var(--ink50)',
                }}
                className="mono"
              >
                <span>{months[0].month}</span>
                <span>{months[months.length - 1].month}</span>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11.5, color: 'var(--ink50)' }}>{t('empleo.stats.thin')}</div>
          )}
        </Panel>
        <Panel title={t('empleo.chart.byContract')}>
          <BarList rows={byContract} empty={t('empleo.stats.thin')} />
        </Panel>
        <Panel title={t('empleo.chart.byMunicipio')}>
          <BarList rows={byMunicipio} empty={t('empleo.stats.thin')} />
        </Panel>
      </div>

      {/* opt-in map — Leaflet lazy-loads only when opened */}
      <div style={{ marginTop: 14 }}>
        <button
          type="button"
          onClick={() => setShowMap((v) => !v)}
          style={{
            fontSize: 12,
            color: 'var(--civic)',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          {showMap ? t('empleo.hideMap') : t('empleo.showMap')}
        </button>
        {showMap && (
          <div style={{ marginTop: 10 }}>
            <Suspense fallback={<div style={{ fontSize: 11.5, color: 'var(--ink50)' }}>…</div>}>
              <EmpleoMap points={mapPoints} t={t} />
            </Suspense>
          </div>
        )}
      </div>
    </Card>
  )
}
