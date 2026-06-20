import { useMemo, useState } from 'react'
import { topContractors } from '../../lib/tender-geo'

const fmtEur = (n) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n)

export default function ContractorLeaderboard({ contracts }) {
  const [open, setOpen] = useState(null)
  const top = useMemo(() => topContractors(contracts, 15), [contracts])
  const byAssignee = useMemo(() => {
    const m = new Map()
    for (const c of contracts || []) {
      if (!c.assignee) continue
      const arr = m.get(c.assignee) || []
      arr.push(c)
      m.set(c.assignee, arr)
    }
    return m
  }, [contracts])
  const max = top.length ? top[0].amount : 1
  return (
    <div>
      {top.map((t) => (
        <div
          key={t.assignee}
          style={{ borderBottom: '1px solid var(--border2)', padding: '8px 0' }}
        >
          <button
            onClick={() => setOpen(open === t.assignee ? null : t.assignee)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              width: '100%',
            }}
          >
            <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500 }}>{t.assignee}</span>
            <span
              style={{
                height: 6,
                width: Math.max(6, (t.amount / max) * 120),
                background: 'var(--civic)',
                borderRadius: 3,
              }}
            />
            <span className="mono" style={{ fontWeight: 700, fontSize: 12 }}>
              {fmtEur(t.amount)}
            </span>
            <span style={{ fontSize: 10.5, color: 'var(--ink50)', width: 70, textAlign: 'right' }}>
              {t.count} contrato{t.count === 1 ? '' : 's'}
            </span>
          </button>
          {open === t.assignee && (
            <div style={{ paddingLeft: 8, marginTop: 4 }}>
              {(byAssignee.get(t.assignee) || []).slice(0, 20).map((c) => (
                <div key={c.id} style={{ fontSize: 11.5, color: 'var(--ink60)', padding: '3px 0' }}>
                  {c.title.length > 90 ? c.title.slice(0, 90) + '…' : c.title} —{' '}
                  <span className="mono">
                    {fmtEur(c.finalAmount > 0 ? c.finalAmount : c.initialAmount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
