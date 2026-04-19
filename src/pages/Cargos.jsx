import { Card, Delta, LinkArrow } from '../components/Primitives'
import { Ic } from '../components/Icons'
import { DEPTS } from '../data/mockData'
import { useOfficials, partyColor } from '../hooks/useOfficials'

function KBox({ label, value, delta, colored }) {
  return (
    <div style={{ padding: '8px 10px', background: 'var(--soft)', borderRadius: 8 }}>
      <div
        className="mono"
        style={{
          fontSize: 9.5,
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.06em',
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
        <div
          className="mono"
          style={{
            fontSize: 15,
            fontWeight: 700,
            color:
              colored && value >= 80
                ? 'var(--ok)'
                : colored && value < 70
                ? 'var(--warn)'
                : 'var(--ink)',
          }}
        >
          {value}
        </div>
        {delta !== undefined && <Delta v={delta} size={10} />}
      </div>
    </div>
  )
}

function OfficialCard({ o, big = false }) {
  const color = partyColor(o.party)
  return (
    <Card hover>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {o.photoUrl ? (
          <img
            src={o.photoUrl}
            alt={o.name}
            width={big ? 72 : 52}
            height={big ? 72 : 52}
            style={{
              width: big ? 72 : 52,
              height: big ? 72 : 52,
              borderRadius: 10,
              objectFit: 'cover',
              flexShrink: 0,
              border: `2px solid ${color}22`,
            }}
          />
        ) : (
          <div
            style={{
              width: big ? 72 : 52,
              height: big ? 72 : 52,
              borderRadius: 10,
              flexShrink: 0,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--soft)',
              color: 'var(--ink60)',
              fontWeight: 700,
            }}
          >
            {o.name
              .split(' ')
              .slice(0, 2)
              .map((x) => x[0])
              .join('')}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 2,
            }}
          >
            <span
              className="mono"
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                background: color,
                color: 'white',
                padding: '2px 6px',
                borderRadius: 3,
              }}
            >
              {o.party}
            </span>
            {o.role === 'alcalde' && (
              <span
                className="mono"
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                  color: 'var(--accent)',
                }}
              >
                Alcalde
              </span>
            )}
          </div>
          <div style={{ fontSize: big ? 17 : 14, fontWeight: 600, lineHeight: 1.2 }}>
            {o.name}
          </div>
          {o.portfolios.length > 0 && (
            <div style={{ fontSize: 11.5, color: 'var(--ink60)', marginTop: 4, lineHeight: 1.35 }}>
              {o.portfolios.slice(0, 4).join(' · ')}
              {o.portfolios.length > 4 && ' · …'}
            </div>
          )}
        </div>
      </div>
      <div
        style={{
          marginTop: big ? 14 : 10,
          paddingTop: big ? 12 : 8,
          borderTop: '1px solid var(--border2)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 11.5,
          color: 'var(--ink50)',
        }}
      >
        <a
          href={`mailto:${o.email || 'alcaldia@ribarroja.es'}`}
          style={{ color: 'var(--ink)', textDecoration: 'none' }}
          className="mono"
        >
          {o.email || 'alcaldia@ribarroja.es'}
        </a>
        {o.cvUrl && (
          <a
            href={o.cvUrl}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--civic)', textDecoration: 'none', fontWeight: 500 }}
          >
            Biografía →
          </a>
        )}
      </div>
    </Card>
  )
}

function CompositionBar({ composition, total }) {
  const order = ['PSOE', 'PP', 'VOX', 'Compromís', 'Ciudadanos', 'Otro']
  const items = order.filter((p) => composition[p]).map((p) => ({ p, n: composition[p] }))
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', width: '100%', height: 14, borderRadius: 7, overflow: 'hidden' }}>
        {items.map(({ p, n }) => (
          <div
            key={p}
            title={`${p}: ${n}`}
            style={{
              flex: n,
              background: partyColor(p),
              display: 'grid',
              placeItems: 'center',
              color: 'white',
              fontFamily: "'DM Mono', monospace",
              fontSize: 9,
              fontWeight: 700,
            }}
          >
            {n}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap', fontSize: 11 }}>
        {items.map(({ p, n }) => (
          <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: partyColor(p) }} />
            <span style={{ fontWeight: 600 }}>{p}</span>
            <span className="mono" style={{ color: 'var(--ink60)' }}>
              {n}
            </span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', color: 'var(--ink50)' }} className="mono">
          Total {total} escaños
        </div>
      </div>
    </div>
  )
}

function CorporacionMunicipal() {
  const { loading, error, data } = useOfficials()

  if (loading) {
    return (
      <div style={{ marginBottom: 28, color: 'var(--ink50)', fontSize: 13 }}>
        Cargando Corporación Municipal…
      </div>
    )
  }
  if (error || !data) {
    return (
      <div
        style={{
          marginBottom: 28,
          padding: 12,
          border: '1px solid var(--warn-soft)',
          borderRadius: 8,
          color: 'var(--warn)',
          fontSize: 13,
        }}
      >
        No se pudo cargar la Corporación Municipal. Ejecuta{' '}
        <code>npm run scrape:officials</code> para regenerar los datos.
      </div>
    )
  }

  const mayor = data.officials.find((o) => o.role === 'alcalde')
  const rest = data.officials.filter((o) => o.role !== 'alcalde')
  const generatedDate = new Date(data.generatedAt).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
        <div
          className="mono"
          style={{
            fontSize: 10.5,
            color: 'var(--ink50)',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
          }}
        >
          Corporación Municipal
        </div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--ink50)' }}>
          · datos reales de ribarroja.es · actualizado {generatedDate}
        </div>
      </div>

      {mayor && (
        <div style={{ marginBottom: 14 }}>
          <OfficialCard o={mayor} big />
        </div>
      )}

      <CompositionBar composition={data.composition} total={data.count} />

      <div
        className="mono"
        style={{
          fontSize: 10.5,
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
          marginTop: 22,
          marginBottom: 8,
        }}
      >
        Concejalas y concejales
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 12,
        }}
      >
        {rest.map((o) => (
          <OfficialCard key={o.slug} o={o} />
        ))}
      </div>
    </div>
  )
}

export default function Cargos() {
  return (
    <div className="cp-page" style={{ padding: '24px 24px 48px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <div
          className="mono"
          style={{
            fontSize: 10.5,
            color: 'var(--ink50)',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
          }}
        >
          Rendición de cuentas
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.015em', marginTop: 2 }}>
          Cargos y departamentos
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--ink60)', marginTop: 4, maxWidth: 620 }}>
          Titulares del Ayuntamiento, sus departamentos, presupuesto asignado, promesas adquiridas y rendimiento
          operacional.
        </div>
      </div>

      <CorporacionMunicipal />

      <div
        className="mono"
        style={{
          fontSize: 10.5,
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
          marginBottom: 8,
          marginTop: 40,
        }}
      >
        Departamentos
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {DEPTS.map((d) => (
          <Card key={d.id} hover>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                  flexShrink: 0,
                  background:
                    d.score >= 80
                      ? 'var(--ok-soft)'
                      : d.score >= 70
                      ? 'var(--civic-soft)'
                      : 'var(--warn-soft)',
                  color:
                    d.score >= 80
                      ? 'var(--ok)'
                      : d.score >= 70
                      ? 'var(--civic)'
                      : 'var(--warn)',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                {d.lead
                  .split(' ')
                  .map((x) => x[0])
                  .join('')}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{d.lead}</div>
                <div style={{ fontSize: 12, color: 'var(--ink60)' }}>{d.name}</div>
              </div>
              <Ic.more width={16} height={16} style={{ color: 'var(--ink40)' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <KBox label="Score" value={d.score} delta={d.delta} colored />
              <KBox label="Presup." value={'€' + d.budget + 'M'} />
              <KBox label="Quejas" value={d.complaints} />
              <KBox label="Resueltas" value={d.resolved + ' / ' + d.complaints} />
            </div>
            <div
              style={{
                marginTop: 14,
                paddingTop: 12,
                borderTop: '1px solid var(--border2)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ fontSize: 11.5, color: 'var(--ink50)' }}>
                <span className="mono" style={{ color: 'var(--ink)' }}>
                  {Math.floor((d.resolved / d.complaints) * 100)}%
                </span>{' '}
                resolución
              </div>
              <LinkArrow>Ver perfil →</LinkArrow>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
