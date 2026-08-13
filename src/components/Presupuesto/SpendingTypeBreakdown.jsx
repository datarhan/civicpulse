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
// Esta barra SÍ es una composición apilada con leyenda, así que el color aquí
// distingue de verdad y no puede reducirse a uno. Lo que no puede es ser un
// arcoíris: llevaba el azul exacto del PP en «obra» y el morado --intel —que en
// este sistema significa «esto lo ha escrito una máquina»— en «gestión de
// servicios», dos significados prestados dentro de un gráfico de dinero.
//
// Una rampa de un solo tono resuelve las dos cosas: los seis pasos son
// petróleo (tono 185°, el de la marca), se distinguen entre sí por luminancia
// —1,39:1 el par más justo— y ninguno se parece a un partido ni a un tono
// semántico. Que sea ordenada es además lo correcto para repartir una sola
// magnitud: el dinero.
const TYPE_COLOR = {
  construction: '#0A4449',
  services: '#0E5B62',
  supplies: '#15757E',
  public_services_management: '#2D97A1',
  patrimonial: '#63BAC2',
  other: '#A8D9DE',
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
          borderRadius: 'var(--r-pill)',
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
            fontSize: 'var(--fs-meta)',
            padding: '3px 0',
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 'var(--r-input)',
              background: TYPE_COLOR[r.type] || '#94A3B8',
            }}
          />
          <span style={{ flex: 1 }}>{TYPE_LABEL[r.type] || r.type}</span>
          <span className="mono" style={{ fontWeight: 700 }}>
            {fmtEur(r.amount)}
          </span>
          <span
            className="mono"
            style={{
              width: 44,
              textAlign: 'right',
              color: 'var(--ink50)',
              fontSize: 'var(--fs-micro)',
            }}
          >
            {((r.amount / total) * 100).toFixed(0)}%
          </span>
        </div>
      ))}
      <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 8 }}>
        Recuperación DANA ≈ {danaPct.toFixed(0)}% del importe adjudicado.
      </div>
    </div>
  )
}
