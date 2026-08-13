import { useMemo, useState } from 'react'
import { topContractors, contractAmount } from '../../lib/tender-geo'
import { useEntities } from '../../hooks/useEntities'
import { isCommittedContract } from '../../lib/contract-status.js'

const fmtEur = (n) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n)

export default function ContractorLeaderboard({ contracts }) {
  const [open, setOpen] = useState(null)
  const entities = useEntities()
  // Raw razón social → canonical entity, from the nightly registry.
  // Registry missing (fresh clone) → null resolver → raw-name grouping.
  const resolver = useMemo(() => {
    const companies = entities.data?.companies
    if (!companies?.length) return null
    const byVariant = new Map()
    for (const co of companies) {
      for (const v of co.variants || []) {
        byVariant.set(v, { key: co.nameKey, canonicalName: co.canonicalName })
      }
    }
    return (raw) => byVariant.get(raw) ?? null
  }, [entities.data])
  const top = useMemo(() => topContractors(contracts, 15, resolver), [contracts, resolver])
  const byAssignee = useMemo(() => {
    const m = new Map()
    for (const c of contracts || []) {
      if (!c.assignee) continue
      if (!(isCommittedContract(c) && contractAmount(c) > 0)) continue
      // Key the drill-down by the same display name the row uses, so a
      // merged company lists the contracts of every razón social variant.
      const display = resolver?.(c.assignee)?.canonicalName ?? c.assignee
      const arr = m.get(display) || []
      arr.push(c)
      m.set(display, arr)
    }
    return m
  }, [contracts, resolver])
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
            aria-expanded={open === t.assignee}
            style={{
              all: 'unset',
              cursor: 'pointer',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              width: '100%',
            }}
          >
            <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500 }}>
              {t.assignee}
              {t.variantCount > 1 && (
                <span style={{ fontSize: 10, color: 'var(--ink50)', marginLeft: 6 }}>
                  · {t.variantCount} razones sociales
                </span>
              )}
            </span>
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
                <div key={c.id} style={{ fontSize: 11.5, color: 'var(--ink50)', padding: '3px 0' }}>
                  {c.title.length > 90 ? c.title.slice(0, 90) + '…' : c.title} —{' '}
                  <span className="mono">{fmtEur(contractAmount(c))}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
