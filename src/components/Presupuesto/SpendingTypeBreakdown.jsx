import { useMemo } from 'react'
import { contractTypeTotals } from '../../lib/tender-geo'

const fmtEur = (n) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
    notation: 'compact',
  }).format(n)

const TYPE_LABEL = {
  construction: 'Obras',
  services: 'Servicios',
  supplies: 'Suministros',
  public_services_management: 'Gestión de servicios',
  patrimonial: 'Patrimonial',
  other: 'Otros',
}
const TYPE_COLOR = {
  construction: '#2463EB',
  services: '#0EA5A4',
  supplies: '#D97706',
  public_services_management: '#7C3AED',
  patrimonial: '#64748B',
  other: '#94A3B8',
}

export default function SpendingTypeBreakdown({ contracts, snapshot }) {
  // Shared with the section's own summary line, which now states the obras
  // share out loud. Two copies of this loop would let the heading and the chart
  // that justifies it disagree one scroll apart.
  const { rows, total, danaPct } = useMemo(() => {
    const { rows: r, total: sum } = contractTypeTotals(contracts)
    const dpct = sum > 0 ? ((snapshot?.universe?.danaAwardedAmount || 0) / sum) * 100 : 0
    return { rows: r, total: sum, danaPct: dpct }
  }, [contracts, snapshot])
  if (total <= 0) return null
  return (
    <div>
      <div
        style={{
          display: 'flex',
          height: 16,
          borderRadius: 8,
          overflow: 'hidden',
          marginBottom: 10,
        }}
      >
        {rows.map((r) => (
          <div
            key={r.type}
            title={`${TYPE_LABEL[r.type] || r.type}: ${fmtEur(r.amount)}`}
            style={{
              width: (r.amount / total) * 100 + '%',
              background: TYPE_COLOR[r.type] || '#94A3B8',
            }}
          />
        ))}
      </div>
      {rows.map((r) => (
        <div
          key={r.type}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12.5,
            padding: '3px 0',
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: TYPE_COLOR[r.type] || '#94A3B8',
            }}
          />
          <span style={{ flex: 1 }}>{TYPE_LABEL[r.type] || r.type}</span>
          <span className="mono" style={{ fontWeight: 700 }}>
            {fmtEur(r.amount)}
          </span>
          <span
            className="mono"
            style={{ width: 44, textAlign: 'right', color: 'var(--ink50)', fontSize: 11 }}
          >
            {((r.amount / total) * 100).toFixed(0)}%
          </span>
        </div>
      ))}
      <div style={{ fontSize: 11, color: 'var(--ink50)', marginTop: 8 }}>
        Recuperación DANA ≈ {danaPct.toFixed(0)}% del importe adjudicado.
      </div>
    </div>
  )
}
