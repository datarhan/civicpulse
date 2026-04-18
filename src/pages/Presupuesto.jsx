import { Card, Delta, Pill, SectionHead } from '../components/Primitives'
import { BudgetBars } from '../components/Charts'
import {
  BUDGET_ACTUAL,
  BUDGET_KPI,
  BUDGET_MONTHS,
  BUDGET_PLAN,
  TAX_BREAKDOWN,
  TOP_CONTRACTS,
} from '../data/mockData'

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

function TaxFlow() {
  const rows = TAX_BREAKDOWN.map((s) => ({ ...s, eur: Math.round((487 * s.pct) / 100) }))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
      {rows.map((s, i) => (
        <div key={i}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 13 }}>
            <span style={{ width: 10, height: 10, background: s.color, borderRadius: 2, flexShrink: 0 }} />
            <span style={{ flex: 1, fontWeight: 500 }}>{s.cat}</span>
            <span className="mono" style={{ fontSize: 14, fontWeight: 700 }}>
              €{s.eur}
            </span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink50)', width: 40, textAlign: 'right' }}>
              {s.pct}%
            </span>
          </div>
          <div
            style={{
              height: 5,
              background: 'var(--soft)',
              borderRadius: 5,
              marginTop: 5,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: s.pct * 2.5 + '%',
                background: s.color,
                borderRadius: 5,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Presupuesto() {
  return (
    <div className="cp-page" style={{ padding: '24px 24px 48px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
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
            Transparencia fiscal · ejercicio 2026
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.015em', marginTop: 2 }}>
            Presupuesto municipal
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Pill tone="civic">2026</Pill>
          <Pill tone="ghost">2025</Pill>
          <Pill tone="ghost">2024</Pill>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <KStrip label="Presupuesto total" value={BUDGET_KPI.total} delta={BUDGET_KPI.totalDelta} />
        <KStrip label="Ejecutado" value={BUDGET_KPI.executed} delta={BUDGET_KPI.executedDelta} />
        <KStrip label="Deuda municipal" value={BUDGET_KPI.debt} delta={BUDGET_KPI.debtDelta} invert />
        <KStrip label="€ por habitante" value={BUDGET_KPI.perCapita} delta={BUDGET_KPI.perCapitaDelta} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16, marginBottom: 16 }}>
        <Card>
          <SectionHead eyebrow="Mi recibo del IBI" title="A dónde van tus €487" />
          <TaxFlow />
        </Card>
        <Card>
          <SectionHead eyebrow="Partidas grandes" title="Top contratos abiertos" />
          {TOP_CONTRACTS.map((c, i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 90px 100px',
                padding: '10px 0',
                borderBottom: i === TOP_CONTRACTS.length - 1 ? 'none' : '1px solid var(--border2)',
                alignItems: 'center',
                fontSize: 13,
                gap: 10,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 500 }}>{c.name}</div>
                <div style={{ fontSize: 11, color: 'var(--ink50)' }}>{c.vendor}</div>
              </div>
              <div className="mono" style={{ fontSize: 13, fontWeight: 700, textAlign: 'right' }}>
                {c.val}
              </div>
              <div style={{ textAlign: 'right' }}>
                <Pill
                  tone={c.status === 'en curso' ? 'civic' : c.status === 'adjudicado' ? 'ok' : 'intel'}
                  size="xs"
                >
                  {c.status}
                </Pill>
              </div>
            </div>
          ))}
        </Card>
      </div>

      <Card>
        <SectionHead eyebrow="Ejecución mensual" title="Gasto vs presupuesto 2026" />
        <BudgetBars months={BUDGET_MONTHS} plan={BUDGET_PLAN} actual={BUDGET_ACTUAL} />
      </Card>
    </div>
  )
}
