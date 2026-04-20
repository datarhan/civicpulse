import { Link } from 'react-router-dom'
import { Card, Pill, SectionHead } from '../components/Primitives'
import {
  useQuejas,
  STATE_LABEL,
  STATE_TONE,
  CATEGORY_LABEL,
  prettyNeighborhood,
} from '../hooks/useQuejas'
import { useOfficials, partyColor } from '../hooks/useOfficials'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useT } from '../i18n'

const TELEGRAM_BOT_URL = 'https://t.me/munigraph_bot'

function StatTile({ label, value, tone = 'neutral', sub }) {
  const color =
    tone === 'ok' ? 'var(--ok)' :
    tone === 'warn' ? 'var(--warn)' :
    tone === 'crit' ? 'var(--crit)' :
    tone === 'civic' ? 'var(--civic)' :
    'var(--ink)'
  return (
    <Card>
      <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink50)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
        {label}
      </div>
      <div className="mono" style={{ fontSize: 28, fontWeight: 800, color, marginTop: 4, letterSpacing: '-.02em' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--ink50)', marginTop: 3 }}>{sub}</div>}
    </Card>
  )
}

function Bar({ label, n, max, color, subline }) {
  const pct = max > 0 ? Math.round((n / max) * 100) : 0
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr min-content', alignItems: 'center', gap: 10, padding: '4px 0' }}>
      <span style={{ fontSize: 13 }}>{label}</span>
      <div style={{ position: 'relative', height: 8, background: 'var(--border2)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width .3s ease' }} />
      </div>
      <span className="mono" style={{ fontSize: 12, color: 'var(--ink60)', minWidth: 24, textAlign: 'right' }}>{n}</span>
      {subline && <div style={{ gridColumn: '1 / 4', fontSize: 10.5, color: 'var(--ink50)', marginTop: -2 }}>{subline}</div>}
    </div>
  )
}

function SlaPanel({ byConcejal, officials }) {
  const entries = Object.entries(byConcejal || {})
    .map(([slug, s]) => {
      const off = officials?.officials?.find((o) => o.slug === slug)
      return {
        slug,
        name: off?.name || slug,
        party: off?.party || '',
        total: s.total,
        resueltas: s.resueltas,
        pendientes: s.pendientes,
        silencios: s.silencios,
        pct: s.total > 0 ? Math.round((s.resueltas / s.total) * 100) : 0,
      }
    })
    .sort((a, b) => b.total - a.total)
  if (entries.length === 0) return null
  return (
    <Card style={{ marginTop: 14 }}>
      <SectionHead eyebrow="Rendición de cuentas · concejalía" title="Quejas por responsable político" />
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {entries.map((e) => (
          <div
            key={e.slug}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 80px 80px 80px',
              alignItems: 'center',
              gap: 10,
              padding: '8px 0',
              borderBottom: '1px dotted var(--border2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              {e.party && (
                <span
                  className="mono"
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '.1em',
                    textTransform: 'uppercase',
                    background: partyColor(e.party),
                    color: 'white',
                    padding: '2px 5px',
                    borderRadius: 3,
                    flexShrink: 0,
                  }}
                >
                  {e.party}
                </span>
              )}
              <div style={{ fontSize: 13.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e.name}
              </div>
            </div>
            <div className="mono" style={{ fontSize: 12, color: 'var(--ok)', textAlign: 'right' }}>✓ {e.resueltas}</div>
            <div className="mono" style={{ fontSize: 12, color: 'var(--civic)', textAlign: 'right' }}>⏳ {e.pendientes}</div>
            <div className="mono" style={{ fontSize: 12, color: e.silencios > 0 ? 'var(--crit)' : 'var(--ink40)', textAlign: 'right' }}>
              ⚠ {e.silencios}
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink50)', marginTop: 10, lineHeight: 1.5 }}>
        ✓ resueltas · ⏳ pendientes (capturadas + registradas + en trámite) · ⚠ silencios (&gt;plazo LPACAP sin respuesta). Las
        quejas se asignan al área municipal competente automáticamente; el responsable político figura como titular de esa área.
      </div>
    </Card>
  )
}

function StateBreakdown({ byState, total }) {
  if (total === 0) return null
  const order = [
    'capturada',
    'apoyada_verificada',
    'registrada',
    'notificada_10d',
    'en_tramite',
    'resuelta',
    'silencio_negativo',
    'escalada_sindic',
    'cerrada_no_registrada',
  ]
  const max = Math.max(...Object.values(byState || {}), 1)
  return (
    <Card>
      <SectionHead eyebrow="Estado legal" title="Ciclo de vida LPACAP" />
      <div style={{ marginTop: 12 }}>
        {order.map((s) => {
          const n = byState?.[s] ?? 0
          if (n === 0) return null
          const tone = STATE_TONE[s] || 'neutral'
          const color =
            tone === 'ok' ? 'var(--ok)' :
            tone === 'warn' ? 'var(--warn)' :
            tone === 'crit' ? 'var(--crit)' :
            tone === 'civic' ? 'var(--civic)' :
            tone === 'intel' ? 'var(--civic)' :
            'var(--ink40)'
          return <Bar key={s} label={STATE_LABEL[s] || s} n={n} max={max} color={color} />
        })}
      </div>
    </Card>
  )
}

function CategoryBreakdown({ byCategory }) {
  const entries = Object.entries(byCategory || {}).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) return null
  const max = Math.max(...entries.map((e) => e[1]))
  return (
    <Card>
      <SectionHead eyebrow="Qué se reporta" title="Categorías" />
      <div style={{ marginTop: 12 }}>
        {entries.map(([cat, n]) => (
          <Bar key={cat} label={CATEGORY_LABEL[cat] || cat} n={n} max={max} color="var(--civic)" />
        ))}
      </div>
    </Card>
  )
}

function NeighborhoodBreakdown({ byNeighborhood }) {
  const entries = Object.entries(byNeighborhood || {}).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) return null
  const max = Math.max(...entries.map((e) => e[1]))
  return (
    <Card>
      <SectionHead eyebrow="Dónde pasa" title="Barrios" />
      <div style={{ marginTop: 12 }}>
        {entries.map(([slug, n]) => (
          <Bar key={slug} label={prettyNeighborhood(slug)} n={n} max={max} color="var(--ok)" />
        ))}
      </div>
    </Card>
  )
}

function plazoForCategory(cat) {
  if (cat === 'transparencia') return 30
  return 90
}

function ReadyToEscalate({ items }) {
  const now = Date.now()
  const urgent = (items || [])
    .filter((q) => q.registered_at && (q.status === 'registrada' || q.status === 'notificada_10d' || q.status === 'en_tramite' || q.status === 'silencio_negativo'))
    .map((q) => {
      const plazo = plazoForCategory(q.service_code)
      const regMs = new Date(q.registered_at).getTime()
      const ageDays = (now - regMs) / (1000 * 60 * 60 * 24)
      const pct = plazo > 0 ? ageDays / plazo : 0
      return { q, plazo, ageDays, pct }
    })
    .filter(({ pct }) => pct >= 0.8) // ≥80% of legal plazo consumed
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 10)

  if (urgent.length === 0) return null

  return (
    <Card style={{ marginTop: 14, borderLeft: '3px solid var(--warn)' }}>
      <SectionHead
        eyebrow="Acción urgente · moderador"
        title="Quejas cerca de o en silencio administrativo"
      />
      <div style={{ fontSize: 12, color: 'var(--ink60)', marginTop: 4, lineHeight: 1.5 }}>
        Quejas registradas en sede cuyo plazo LPACAP lleva ≥80% consumido. Candidatas
        para <code>/escalar Q-XXXX</code> si no llega respuesta antes del vencimiento —
        se generará el template para el Síndic de Greuges CV.
      </div>
      <div style={{ marginTop: 10 }}>
        {urgent.map(({ q, plazo, ageDays, pct }) => {
          const remaining = Math.max(0, plazo - Math.floor(ageDays))
          const overBy = Math.max(0, Math.floor(ageDays) - plazo)
          const tone = overBy > 0 ? 'crit' : 'warn'
          return (
            <Link
              key={q.service_request_id}
              to={`/quejas/${q.service_request_id.toLowerCase()}`}
              style={{
                display: 'grid',
                gridTemplateColumns: 'min-content 1fr min-content min-content',
                alignItems: 'center',
                gap: 12,
                padding: '10px 0',
                borderBottom: '1px dotted var(--border2)',
                color: 'inherit',
                textDecoration: 'none',
              }}
            >
              <span className="mono" style={{ fontSize: 11, color: 'var(--ink60)' }}>
                {q.service_request_id}
              </span>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13.5,
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {q.description}
                </div>
                <div
                  className="mono"
                  style={{ fontSize: 10.5, color: 'var(--ink50)', marginTop: 2 }}
                >
                  {CATEGORY_LABEL[q.service_code] || q.service_code}
                  {q.concejalia_area ? ' · ' + q.concejalia_area : ''}
                  {' · plazo ' + plazo + ' días'}
                </div>
              </div>
              <span
                className="mono"
                style={{
                  fontSize: 12,
                  color: overBy > 0 ? 'var(--crit)' : 'var(--warn)',
                  fontWeight: 700,
                  textAlign: 'right',
                }}
              >
                {overBy > 0 ? `+${overBy}d` : `${remaining}d`}
              </span>
              <Pill tone={tone} size="xs">
                {overBy > 0 ? 'Silencio' : `${Math.round(pct * 100)}%`}
              </Pill>
            </Link>
          )
        })}
      </div>
    </Card>
  )
}

function TopPending({ items }) {
  const pending = (items || [])
    .filter((q) =>
      ['capturada', 'apoyada_verificada', 'registrada', 'notificada_10d', 'en_tramite'].includes(q.status)
    )
    .sort((a, b) => b.apoyos - a.apoyos)
    .slice(0, 10)
  if (pending.length === 0) return null
  return (
    <Card style={{ marginTop: 14 }}>
      <SectionHead eyebrow="Presión vecinal · top 10" title="Quejas pendientes con más apoyos" />
      <div style={{ marginTop: 10 }}>
        {pending.map((q) => (
          <Link
            key={q.service_request_id}
            to={`/quejas/${q.service_request_id.toLowerCase()}`}
            style={{
              display: 'grid',
              gridTemplateColumns: 'min-content 1fr min-content min-content',
              alignItems: 'center',
              gap: 12,
              padding: '10px 0',
              borderBottom: '1px dotted var(--border2)',
              color: 'inherit',
              textDecoration: 'none',
            }}
          >
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink60)' }}>
              {q.service_request_id}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {q.description}
              </div>
              <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink50)', marginTop: 2 }}>
                {CATEGORY_LABEL[q.service_code] || q.service_code}
                {q.address_string ? ` · ${prettyNeighborhood(q.address_string)}` : ''}
              </div>
            </div>
            <span className="mono" style={{ fontSize: 12, color: 'var(--civic)', fontWeight: 700, textAlign: 'right' }}>
              👍 {q.apoyos}
            </span>
            <Pill tone={STATE_TONE[q.status] || 'ghost'} size="xs">
              {STATE_LABEL[q.status] || q.status}
            </Pill>
          </Link>
        ))}
      </div>
    </Card>
  )
}

export default function QuejasDashboard() {
  const t = useT()
  useDocumentTitle(t('dashboard.title'))
  const { loading, error, data } = useQuejas()
  const { data: officials } = useOfficials()

  if (loading) {
    return (
      <div className="cp-page" style={{ padding: '24px 24px 48px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ color: 'var(--ink50)', fontSize: 13 }}>Cargando feed…</div>
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="cp-page" style={{ padding: '24px 24px 48px', maxWidth: 1100, margin: '0 auto' }}>
        <Card>
          <div style={{ color: 'var(--warn)', fontSize: 13 }}>No se pudo cargar /data/quejas.json.</div>
        </Card>
      </div>
    )
  }

  const items = data.items || []
  const stats = data.stats || { total: 0, byState: {}, byNeighborhood: {}, byCategory: {}, byConcejal: {} }
  const resueltas = stats.byState.resuelta || 0
  const silencios = (stats.byState.silencio_negativo || 0) + (stats.byState.escalada_sindic || 0)
  const pendientes =
    (stats.byState.capturada || 0) +
    (stats.byState.apoyada_verificada || 0) +
    (stats.byState.registrada || 0) +
    (stats.byState.notificada_10d || 0) +
    (stats.byState.en_tramite || 0)
  const resolucionPct = stats.total > 0 ? Math.round((resueltas / stats.total) * 100) : 0

  return (
    <div className="cp-page" style={{ padding: '24px 24px 48px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink50)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
          {t('dashboard.eyebrow')}
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.015em', marginTop: 2 }}>
          {t('dashboard.title')}
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--ink60)', marginTop: 4, maxWidth: 720 }}>
          Vista agregada de todas las quejas capturadas vía{' '}
          <a href={TELEGRAM_BOT_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--civic)' }}>
            Telegram
          </a>
          . Métricas LPACAP, concejalía responsable y presión vecinal.{' '}
          <Link to="/quejas" style={{ color: 'var(--civic)', textDecoration: 'underline', textUnderlineOffset: 2 }}>← Feed público</Link>
        </div>
      </div>

      {stats.total === 0 ? (
        <Card>
          <SectionHead eyebrow="Sin datos" title="El canal está abierto, aún no hay quejas" />
          <div style={{ fontSize: 14, color: 'var(--ink70)', marginTop: 8, lineHeight: 1.55 }}>
            Este dashboard muestra métricas cuando haya quejas registradas. Presenta la primera vía{' '}
            <a href={TELEGRAM_BOT_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--civic)' }}>@munigraph_bot</a>
            {' '}con el comando <code>/queja</code>.
          </div>
        </Card>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 14 }}>
            <StatTile label="Total quejas" value={stats.total} sub="desde el inicio del canal" />
            <StatTile label="Resueltas" value={resueltas} tone="ok" sub={`${resolucionPct}% del total`} />
            <StatTile label="Pendientes" value={pendientes} tone="civic" sub="en trámite o capturadas" />
            <StatTile label="Silencios + escaladas" value={silencios} tone={silencios > 0 ? 'crit' : 'ok'} sub=">plazo LPACAP" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
            <StateBreakdown byState={stats.byState} total={stats.total} />
            <CategoryBreakdown byCategory={stats.byCategory} />
            <NeighborhoodBreakdown byNeighborhood={stats.byNeighborhood} />
          </div>

          <ReadyToEscalate items={items} />
          <SlaPanel byConcejal={stats.byConcejal} officials={officials} />
          <TopPending items={items} />
        </>
      )}
    </div>
  )
}
