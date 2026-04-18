import { Card, Pill } from '../components/Primitives'
import { Ic } from '../components/Icons'
import { DATASETS } from '../data/mockData'

export default function Datos() {
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
          Datos abiertos
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.015em', marginTop: 2 }}>
          Datasets y APIs
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--ink60)', marginTop: 4, maxWidth: 620 }}>
          Todo lo que alimenta CivicPulse, descargable y consultable vía API. Periodismo, investigación y
          transparencia.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
        {DATASETS.map((d, i) => (
          <Card key={i} hover>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: '-.005em' }}>{d.name}</div>
                <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink50)', marginTop: 3 }}>
                  {d.rows} registros · {d.updated}
                </div>
              </div>
              <Ic.chart width={16} height={16} style={{ color: 'var(--ink40)', flexShrink: 0 }} />
            </div>
            <div style={{ display: 'flex', gap: 4, marginTop: 14, flexWrap: 'wrap' }}>
              {d.fmt.map((f) => (
                <Pill key={f} tone="ghost" size="xs">
                  {f}
                </Pill>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
