import { Card, Delta, LinkArrow } from '../components/Primitives'
import { Ic } from '../components/Icons'
import { DEPTS } from '../data/mockData'

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
