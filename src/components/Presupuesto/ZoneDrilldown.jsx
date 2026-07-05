import { ContractCard } from '../tenders/ContractCard'
import {
  useQuejaContractRelations,
  relatedQuejasForContract,
} from '../../hooks/useQuejaContractRelations'
import { useQuejas } from '../../hooks/useQuejas'

const fmtEur = (n) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n)

export default function ZoneDrilldown({
  snapshot,
  zoneSlug,
  contractsById,
  danaOnly,
  onClear,
  cpvDict,
}) {
  const { data: relations } = useQuejaContractRelations()
  const { data: quejas } = useQuejas()
  const zone = (snapshot?.zones || []).find((z) => z.slug === zoneSlug)
  if (!zone) return null
  const works = (snapshot?.assignments || [])
    .filter((a) => a.zones.includes(zoneSlug) && (!danaOnly || a.dana))
    .map((a) => ({ a, c: contractsById.get(a.id) }))
    .filter((w) => w.c)
    .sort((x, y) => (y.a.date || '').localeCompare(x.a.date || ''))
  const total = works.reduce((s, w) => s + w.a.amount, 0)
  return (
    <div>
      <button
        onClick={onClear}
        style={{ all: 'unset', cursor: 'pointer', fontSize: 11, color: 'var(--civic)' }}
      >
        ← todas las zonas
      </button>
      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>{zone.name}</div>
      <div className="mono" style={{ fontSize: 13, fontWeight: 700 }}>
        {fmtEur(total)} · {works.length} obra{works.length === 1 ? '' : 's'}
      </div>
      <div style={{ marginTop: 8, maxHeight: 360, overflowY: 'auto' }}>
        {works.map(({ a, c }) => (
          <ContractCard
            key={a.id}
            contract={c}
            amount={a.amount}
            amountKind={a.amountKind}
            date={a.date}
            dana={a.dana}
            provenance={a.matchedAlias?.[zoneSlug]}
            cpvDict={cpvDict}
            relatedQuejas={relatedQuejasForContract(relations, quejas?.items, c.permalink)}
          />
        ))}
      </div>
    </div>
  )
}
