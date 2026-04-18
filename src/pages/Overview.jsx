import { useNavigate } from 'react-router-dom'
import { Card, Delta, LinkArrow, Pill, SectionHead } from '../components/Primitives'
import { Donut, DualLine, Sparkline } from '../components/Charts'
import { Ic } from '../components/Icons'
import {
  AGENDA_CIVICA,
  CITIES,
  COMPLAINTS_30D,
  DEPTS,
  FEED,
  MHS_15D,
  PROMISES,
  RESOLVED_30D,
  TAX_BREAKDOWN,
} from '../data/mockData'

const iconFor = {
  scale: Ic.scale,
  chart: Ic.chart,
  people: Ic.people,
  coin: Ic.coin,
}

function StatBlock({ label, value, delta, invert }) {
  const d = invert ? -delta : delta
  return (
    <div>
      <div
        className="mono"
        style={{
          fontSize: 10,
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.05em',
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 3 }}>
        <div className="mono" style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-.01em' }}>
          {value}
        </div>
        <Delta v={d} />
      </div>
    </div>
  )
}

export default function Overview({ cityId }) {
  const city = CITIES.find((c) => c.id === cityId) || CITIES[0]
  const navigate = useNavigate()

  return (
    <div className="cp-page" style={{ padding: '24px 24px 48px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 16, marginBottom: 16 }}>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
            <div style={{ minWidth: 0 }}>
              <div
                className="mono"
                style={{
                  fontSize: 11,
                  color: 'var(--ink50)',
                  textTransform: 'uppercase',
                  letterSpacing: '.08em',
                }}
              >
                Índice de salud municipal
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 6 }}>
                <div
                  className="mono"
                  style={{
                    fontSize: 56,
                    fontWeight: 700,
                    color: 'var(--ok)',
                    lineHeight: 1,
                    letterSpacing: '-.02em',
                  }}
                >
                  {city.mhs.toFixed(1)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Delta v={city.delta} size={13} />
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink50)' }}>
                    vs ayer
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 14, marginTop: 12, fontSize: 11.5, color: 'var(--ink60)' }}>
                <div>
                  <b style={{ color: 'var(--ink)', fontWeight: 500 }}>p50:</b> 74.2
                </div>
                <div>
                  <b style={{ color: 'var(--ink)', fontWeight: 500 }}>p90:</b> 88.1
                </div>
                <div>
                  <b style={{ color: 'var(--ink)', fontWeight: 500 }}>min 90d:</b> 69.4
                </div>
              </div>
            </div>
            <div style={{ width: 180, flexShrink: 0 }}>
              <Sparkline data={MHS_15D} color="var(--ok)" h={70} />
              <div
                className="mono"
                style={{ fontSize: 9.5, color: 'var(--ink50)', textAlign: 'right', marginTop: 2 }}
              >
                últimos 15 días
              </div>
            </div>
          </div>
          <div
            style={{
              marginTop: 14,
              paddingTop: 14,
              borderTop: '1px solid var(--border2)',
              display: 'grid',
              gridTemplateColumns: 'repeat(4,1fr)',
              gap: 14,
            }}
          >
            <StatBlock label="Quejas activas" value="312" delta={-3.2} />
            <StatBlock label="Promesas cumplidas" value="71%" delta={+1.8} />
            <StatBlock label="Gasto del día" value="€47.3k" delta={+0.4} />
            <StatBlock label="Resolución media" value="41 h" delta={-8.1} invert />
          </div>
        </Card>

        <Card>
          <SectionHead
            eyebrow="Hoy y mañana"
            title="Agenda cívica"
            right={<LinkArrow>Ver todo →</LinkArrow>}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {AGENDA_CIVICA.map((e, i) => {
              const I = iconFor[e.icon] || Ic.chart
              return (
                <div key={i} style={{ display: 'flex', gap: 12, padding: '4px 0' }}>
                  <div
                    className="mono"
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'var(--ink50)',
                      width: 58,
                      flexShrink: 0,
                      paddingTop: 2,
                      letterSpacing: '.05em',
                    }}
                  >
                    {e.day}
                  </div>
                  <I width={16} height={16} style={{ color: 'var(--ink40)', flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, letterSpacing: '-.005em' }}>{e.title}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink50)', marginTop: 1 }}>{e.tag}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 16, marginBottom: 16 }}>
        <Card>
          <SectionHead
            eyebrow="Operaciones"
            title="Departamentos · leaderboard"
            right={
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <Pill tone="ghost" size="xs">30 días</Pill>
                <LinkArrow style={{ marginLeft: 6 }} onClick={() => navigate('/cargos')}>
                  Cargos →
                </LinkArrow>
              </div>
            }
          />
          <div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.6fr 60px 70px 100px 80px',
                fontSize: 10,
                color: 'var(--ink50)',
                textTransform: 'uppercase',
                letterSpacing: '.06em',
                padding: '6px 0',
                borderBottom: '1px solid var(--border2)',
                fontWeight: 500,
              }}
            >
              <div>Dpto · Titular</div>
              <div style={{ textAlign: 'right' }}>Score</div>
              <div style={{ textAlign: 'right' }}>Δ30d</div>
              <div>Tendencia</div>
              <div style={{ textAlign: 'right' }}>Quejas</div>
            </div>
            {DEPTS.map((d, i) => {
              const trend = Array.from({ length: 12 }, (_, k) =>
                d.score + (Math.sin(k * 0.7 + i) * 5 + (d.delta * k) / 12)
              )
              return (
                <div
                  key={d.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.6fr 60px 70px 100px 80px',
                    padding: '10px 0',
                    borderBottom: i === DEPTS.length - 1 ? 'none' : '1px solid var(--border2)',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{d.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink50)' }}>{d.lead}</div>
                  </div>
                  <div
                    className="mono"
                    style={{
                      textAlign: 'right',
                      fontSize: 15,
                      fontWeight: 700,
                      color:
                        d.score >= 80 ? 'var(--ok)' : d.score >= 70 ? 'var(--ink)' : 'var(--warn)',
                    }}
                  >
                    {d.score}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <Delta v={d.delta} />
                  </div>
                  <div>
                    <Sparkline
                      data={trend}
                      color={d.delta >= 0 ? 'var(--ok)' : 'var(--crit)'}
                      h={22}
                      fill={false}
                    />
                  </div>
                  <div className="mono" style={{ textAlign: 'right', fontSize: 12, color: 'var(--ink60)' }}>
                    {d.complaints}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        <Card>
          <SectionHead
            eyebrow="Rendición de cuentas"
            title="Promesas en curso"
            right={<LinkArrow>{PROMISES.length} activas →</LinkArrow>}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {PROMISES.map((p, i) => (
              <div key={i}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 5 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.3, letterSpacing: '-.005em' }}>
                    {p.text}
                  </div>
                  <div
                    className="mono"
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color:
                        p.status === 'ok'
                          ? 'var(--ok)'
                          : p.status === 'risk'
                          ? 'var(--warn)'
                          : 'var(--crit)',
                      flexShrink: 0,
                    }}
                  >
                    {p.pct}%
                  </div>
                </div>
                <div style={{ height: 4, background: 'var(--soft)', borderRadius: 4, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: p.pct + '%',
                      background:
                        p.status === 'ok'
                          ? 'var(--ok)'
                          : p.status === 'risk'
                          ? 'var(--warn)'
                          : 'var(--crit)',
                      borderRadius: 4,
                    }}
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: 5,
                    fontSize: 11,
                    color: 'var(--ink50)',
                  }}
                >
                  <span>{p.owner}</span>
                  <span className="mono">vence {p.due}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 16 }}>
        <Card>
          <SectionHead
            eyebrow="Quejas 30 días"
            title="Entradas vs resueltas"
            right={<LinkArrow onClick={() => navigate('/quejas')}>Quejas →</LinkArrow>}
          />
          <DualLine a={COMPLAINTS_30D} b={RESOLVED_30D} />
          <div style={{ display: 'flex', gap: 14, marginTop: 12, fontSize: 11.5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 2, background: 'var(--civic)', borderRadius: 2 }} /> entradas
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 2, background: 'var(--ok)', borderRadius: 2 }} /> resueltas
            </div>
            <div style={{ marginLeft: 'auto', color: 'var(--ink50)' }}>
              gap medio <b className="mono" style={{ color: 'var(--ink)' }}>14.2</b>
            </div>
          </div>
        </Card>

        <Card>
          <SectionHead
            eyebrow="Mi recibo"
            title="€100 de tu IBI van a…"
            right={<LinkArrow onClick={() => navigate('/presupuesto')}>Presupuesto →</LinkArrow>}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <Donut segments={TAX_BREAKDOWN} size={116} stroke={14} />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'grid',
                  placeItems: 'center',
                  textAlign: 'center',
                }}
              >
                <div>
                  <div className="mono" style={{ fontSize: 18, fontWeight: 700 }}>
                    €487
                  </div>
                  <div style={{ fontSize: 9.5, color: 'var(--ink50)' }}>tu IBI / año</div>
                </div>
              </div>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {TAX_BREAKDOWN.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
                  <span style={{ flex: 1, color: 'var(--ink80)' }}>{s.cat}</span>
                  <span className="mono" style={{ color: 'var(--ink60)' }}>
                    {s.pct}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <SectionHead
            eyebrow="Tiempo real"
            title="Actividad cívica"
            right={
              <Pill tone="ok" size="xs">
                <Ic.dot width={6} height={6} /> live
              </Pill>
            }
          />
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              maxHeight: 360,
              overflowY: 'auto',
              marginRight: -8,
              paddingRight: 8,
            }}
          >
            {FEED.map((f, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: 10,
                  paddingBottom: 10,
                  borderBottom: i === FEED.length - 1 ? 'none' : '1px dashed var(--border2)',
                }}
              >
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    marginTop: 7,
                    flexShrink: 0,
                    background:
                      f.sev === 'crit'
                        ? 'var(--crit)'
                        : f.sev === 'warn'
                        ? 'var(--warn)'
                        : f.sev === 'ok'
                        ? 'var(--ok)'
                        : 'var(--civic)',
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.35 }}>{f.text}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 3, fontSize: 10.5, color: 'var(--ink50)' }}>
                    <span className="mono" style={{ textTransform: 'uppercase', letterSpacing: '.05em' }}>
                      {f.type}
                    </span>
                    <span>·</span>
                    <span>{f.dept}</span>
                    <span>·</span>
                    <span className="mono">{f.t}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
