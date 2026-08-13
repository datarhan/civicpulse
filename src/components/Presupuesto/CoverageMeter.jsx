const fmtEur = (n) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
    notation: 'compact',
  }).format(n)

export default function CoverageMeter({ universe, zones, onSelectZone }) {
  const total = universe?.totalAmount || 0
  const located = universe?.locatedAmount || 0
  const pct = total > 0 ? (located / total) * 100 : 0
  const top = (zones || []).slice(0, 5)
  const maxAmt = top.length ? top[0].amount : 1
  // The span these contracts cover. Without it the figure sits on the same page
  // as "GASTOS TOTALES 41.578.252 €" — one municipal year — and the two invite a
  // comparison that is false: a reader concludes the town awards more in
  // contracts than it spends in a year, when this is nearly a decade of awards.
  const yearMin = (universe?.dateMin || '').slice(0, 4)
  const yearMax = (universe?.dateMax || '').slice(0, 4)
  const span = yearMin && yearMax ? `${yearMin}–${yearMax}` : null
  return (
    <div>
      <div style={{ fontSize: 'var(--fs-meta)', lineHeight: 1.4 }}>
        De <strong>{fmtEur(total)}</strong> adjudicados en contratos (sin IVA)
        {span ? (
          <>
            {' '}
            <strong>a lo largo de {span}</strong> —suma acumulada de {yearMax - yearMin + 1}{' '}
            ejercicios, no de un año—
          </>
        ) : null}
        , <strong>{fmtEur(located)}</strong> ({pct.toFixed(0)}%) se pueden situar en el mapa.
      </div>
      <div
        style={{
          height: 14,
          borderRadius: 'var(--r-pill)',
          overflow: 'hidden',
          display: 'flex',
          border: '1px solid var(--border2)',
          margin: '8px 0 6px',
        }}
      >
        <div style={{ width: pct + '%', background: 'var(--civic)' }} />
        <div style={{ flex: 1, background: 'var(--soft)' }} />
      </div>
      <div
        style={{
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          fontStyle: 'italic',
          lineHeight: 1.4,
        }}
      >
        El resto son contratos adjudicados cuyo título no nombra una zona (servicios, suministros y
        obras sin lugar citado): no se inventa una ubicación. Un contrato que cita dos zonas suma en
        ambas, pero cuenta una sola vez aquí.
      </div>
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {top.map((z) => (
          <button
            key={z.slug}
            onClick={() => onSelectZone(z.slug)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 'var(--fs-meta)',
            }}
          >
            <span style={{ flex: 1 }}>{z.name}</span>
            <span
              style={{
                height: 6,
                width: Math.max(6, (z.amount / maxAmt) * 80),
                background: 'var(--civic)',
                borderRadius: 'var(--r-input)',
              }}
            />
            <span className="mono" style={{ fontWeight: 700, fontSize: 'var(--fs-micro)' }}>
              {fmtEur(z.amount)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
