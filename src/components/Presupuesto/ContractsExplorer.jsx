import { useMemo, useState } from 'react'
import { ExtLink, Pill } from '../Primitives'
import { STATUS_LABEL, STATUS_TONE } from '../../hooks/useTenders'
import { fmtDateShort } from '../../lib/formatters'
import { filterContracts, contractAmount } from '../../lib/tender-geo'

const fmtEur = (n) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n)

const INP = {
  fontSize: 'var(--fs-meta)',
  padding: '5px 8px',
  border: '1px solid var(--border2)',
  borderRadius: 'var(--r-input)',
  background: 'var(--paper)',
  color: 'var(--ink)',
}

export default function ContractsExplorer({ contracts, snapshot }) {
  const [text, setText] = useState('')
  const [zoneSlug, setZone] = useState('')
  const [type, setType] = useState('')
  const [dana, setDana] = useState(false)
  const assignmentsById = useMemo(
    () => new Map((snapshot?.assignments || []).map((a) => [a.id, a])),
    [snapshot],
  )
  const rows = useMemo(
    () => filterContracts(contracts, { text, zoneSlug, type, dana }, assignmentsById).slice(0, 60),
    [contracts, text, zoneSlug, type, dana, assignmentsById],
  )
  const zones = snapshot?.zones || []
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <input
          placeholder="Buscar contrato o empresa…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ ...INP, flex: 1, minWidth: 160 }}
        />
        <select
          value={zoneSlug}
          onChange={(e) => setZone(e.target.value)}
          style={INP}
          aria-label="Filtrar por zona"
        >
          <option value="">Todas las zonas</option>
          {zones.map((z) => (
            <option key={z.slug} value={z.slug}>
              {z.name}
            </option>
          ))}
        </select>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          style={INP}
          aria-label="Filtrar por tipo"
        >
          <option value="">Todo tipo</option>
          <option value="construction">Obras</option>
          <option value="services">Servicios</option>
          <option value="supplies">Suministros</option>
        </select>
        <label
          style={{ fontSize: 'var(--fs-meta)', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <input type="checkbox" checked={dana} onChange={(e) => setDana(e.target.checked)} /> DANA
        </label>
      </div>
      <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginBottom: 6 }}>
        {rows.length} resultado{rows.length === 1 ? '' : 's'} (máx. 60)
      </div>
      {rows.map((c) => (
        <div
          key={c.id}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 100px 90px',
            gap: 10,
            padding: '8px 0',
            borderBottom: '1px solid var(--border2)',
            alignItems: 'center',
            fontSize: 'var(--fs-meta)',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <ExtLink href={c.permalink} style={{ color: 'inherit', textDecoration: 'none' }}>
              {c.title.length > 100 ? c.title.slice(0, 100) + '…' : c.title}
            </ExtLink>
            <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
              {c.assignee || '—'} · {fmtDateShort(c.awardDate) || '—'}
            </div>
          </div>
          <span className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>
            {fmtEur(contractAmount(c))}
          </span>
          <span style={{ textAlign: 'right' }}>
            <Pill tone={STATUS_TONE[c.status] || 'ghost'} size="xs">
              {STATUS_LABEL[c.status] || c.status}
            </Pill>
          </span>
        </div>
      ))}
    </div>
  )
}
