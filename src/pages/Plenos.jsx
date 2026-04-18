import { Button, Card, Pill, SectionHead } from '../components/Primitives'
import { AGENDA_PLENO, HISTORIC_VOTES } from '../data/mockData'

export default function Plenos() {
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
          Órganos de gobierno
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.015em', marginTop: 2 }}>
          Plenos municipales
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16 }}>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
            <div>
              <Pill tone="civic" size="xs">
                HOY · 18:00
              </Pill>
              <div style={{ fontSize: 19, fontWeight: 700, marginTop: 6, letterSpacing: '-.01em' }}>
                Sesión plenaria ordinaria
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--ink60)', marginTop: 2 }}>
                Salón de plenos · streaming disponible
              </div>
            </div>
            <Button variant="solid">Ver directo →</Button>
          </div>
          <div style={{ marginTop: 16 }}>
            <div
              className="mono"
              style={{
                fontSize: 10,
                color: 'var(--ink50)',
                textTransform: 'uppercase',
                letterSpacing: '.06em',
                marginBottom: 10,
              }}
            >
              Orden del día · {AGENDA_PLENO.length} puntos · 2 h 10 min
            </div>
            {AGENDA_PLENO.map((a, i) => (
              <div
                key={a.n}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '28px 1fr 90px 60px',
                  padding: '12px 0',
                  borderBottom: i === AGENDA_PLENO.length - 1 ? 'none' : '1px solid var(--border2)',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <div className="mono" style={{ fontSize: 11, color: 'var(--ink40)', fontWeight: 700 }}>
                  {a.n}
                </div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {a.title}
                    {a.hot && (
                      <Pill tone="warn" size="xs">
                        caliente
                      </Pill>
                    )}
                  </div>
                </div>
                <Pill
                  tone={
                    a.type === 'votación'
                      ? 'civic'
                      : a.type === 'debate'
                      ? 'intel'
                      : a.type === 'moción'
                      ? 'warn'
                      : 'neutral'
                  }
                  size="xs"
                >
                  {a.type}
                </Pill>
                <span className="mono" style={{ fontSize: 11, color: 'var(--ink50)', textAlign: 'right' }}>
                  {a.time}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHead eyebrow="Histórico" title="Últimas votaciones" />
          {HISTORIC_VOTES.map((v, i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '50px 1fr 80px 70px',
                alignItems: 'center',
                padding: '11px 0',
                borderBottom: i === HISTORIC_VOTES.length - 1 ? 'none' : '1px solid var(--border2)',
                gap: 6,
              }}
            >
              <div className="mono" style={{ fontSize: 11, color: 'var(--ink50)' }}>
                {v.date}
              </div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{v.title}</div>
              <Pill tone={v.tone} size="xs">
                {v.result}
              </Pill>
              <div className="mono" style={{ fontSize: 12, color: 'var(--ink60)', textAlign: 'right' }}>
                {v.counts}
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}
