import { useState } from 'react'
import { Button, Card, Delta, LegendDot, Pill, SectionHead } from '../components/Primitives'
import { Heatmap, MiniMap } from '../components/Charts'
import { Ic } from '../components/Icons'
import { COMPLAINT_CATS, COMPLAINT_ROWS } from '../data/mockData'

function KStrip({ label, value, delta, invert }) {
  const d = invert ? -delta : delta
  return (
    <Card>
      <div
        className="mono"
        style={{
          fontSize: 10,
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.06em',
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
        <div className="mono" style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.01em' }}>
          {value}
        </div>
        <Delta v={d} />
      </div>
    </Card>
  )
}

export default function Quejas() {
  const [cat, setCat] = useState('all')

  return (
    <div className="cp-page" style={{ padding: '24px 24px 48px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div
            className="mono"
            style={{
              fontSize: 10.5,
              color: 'var(--ink50)',
              textTransform: 'uppercase',
              letterSpacing: '.08em',
            }}
          >
            Incidencias ciudadanas · últimos 30 días
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.015em', marginTop: 2 }}>
            Quejas{' '}
            <span className="mono" style={{ color: 'var(--ink50)', fontWeight: 500 }}>
              312 activas
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost">
            <Ic.filter width={14} height={14} /> Filtros
          </Button>
          <Button variant="solid">
            <Ic.plus width={14} height={14} /> Reportar
          </Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
        <KStrip label="Entradas / día" value="57.8" delta={+3.1} />
        <KStrip label="Resolución media" value="41 h" delta={-8.1} invert />
        <KStrip label="Backlog" value="312" delta={-3.2} invert />
        <KStrip label="NPS ciudadano" value="4.2 / 5" delta={+0.1} />
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border2)', marginBottom: 16, overflowX: 'auto' }}>
        {COMPLAINT_CATS.map((c) => (
          <button
            key={c.id}
            onClick={() => setCat(c.id)}
            style={{
              padding: '10px 14px',
              fontSize: 13,
              fontWeight: cat === c.id ? 600 : 500,
              color: cat === c.id ? 'var(--ink)' : 'var(--ink50)',
              borderBottom: cat === c.id ? '2px solid var(--civic)' : '2px solid transparent',
              marginBottom: -1,
              whiteSpace: 'nowrap',
            }}
          >
            {c.name}{' '}
            <span className="mono" style={{ fontSize: 10.5, marginLeft: 4, color: 'var(--ink40)' }}>
              {c.n}
            </span>
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 16 }}>
        <Card pad={false}>
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border2)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600 }}>Incidencias</div>
            <div style={{ display: 'flex', gap: 6, fontSize: 11.5, color: 'var(--ink50)' }}>
              <span>Ordenar:</span>
              <span style={{ color: 'var(--ink)', fontWeight: 500 }}>Más recientes</span>
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '78px 1fr 100px 70px 90px 24px',
              padding: '8px 16px',
              borderBottom: '1px solid var(--border2)',
              fontSize: 10,
              color: 'var(--ink50)',
              textTransform: 'uppercase',
              letterSpacing: '.06em',
            }}
          >
            <div>ID</div>
            <div>Incidencia</div>
            <div>Dpto</div>
            <div>Edad</div>
            <div>Estado</div>
            <div />
          </div>
          {COMPLAINT_ROWS.map((r, i) => (
            <div
              key={r.id}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--soft)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              style={{
                display: 'grid',
                gridTemplateColumns: '78px 1fr 100px 70px 90px 24px',
                alignItems: 'center',
                padding: '12px 16px',
                borderBottom: i === COMPLAINT_ROWS.length - 1 ? 'none' : '1px solid var(--border2)',
                fontSize: 13,
                transition: 'background .15s',
              }}
            >
              <div className="mono" style={{ fontSize: 11, color: 'var(--ink60)' }}>
                {r.id}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    flexShrink: 0,
                    background:
                      r.sev === 'crit'
                        ? 'var(--crit)'
                        : r.sev === 'warn'
                        ? 'var(--warn)'
                        : r.sev === 'ok'
                        ? 'var(--ok)'
                        : 'var(--civic)',
                  }}
                />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontWeight: 500,
                    }}
                  >
                    {r.text}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink50)' }}>{r.addr}</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink60)' }}>{r.dept}</div>
              <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink50)' }}>
                {r.age}
              </div>
              <div>
                <Pill
                  tone={
                    r.status === 'resuelta'
                      ? 'ok'
                      : r.status === 'asignada'
                      ? 'civic'
                      : r.status === 'en curso'
                      ? 'intel'
                      : 'warn'
                  }
                  size="xs"
                >
                  {r.status}
                </Pill>
              </div>
              <Ic.more width={14} height={14} style={{ color: 'var(--ink40)' }} />
            </div>
          ))}
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <SectionHead
              eyebrow="Geografía"
              title="Mapa de incidencias"
              right={
                <Pill tone="ghost" size="xs">
                  24 h
                </Pill>
              }
            />
            <MiniMap />
            <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 11, color: 'var(--ink60)' }}>
              <LegendDot color="var(--crit)" label="Crítica" />
              <LegendDot color="var(--warn)" label="Media" />
              <LegendDot color="var(--civic)" label="Info" />
              <LegendDot color="var(--ok)" label="Resuelta" />
            </div>
          </Card>

          <Card>
            <SectionHead eyebrow="Distribución" title="Horario de entrada" />
            <Heatmap />
          </Card>
        </div>
      </div>
    </div>
  )
}
