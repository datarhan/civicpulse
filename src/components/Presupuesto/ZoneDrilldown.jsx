import { ContractCard } from '../tenders/ContractCard'
import {
  useQuejaContractRelations,
  useQuejaRelationApprovals,
  relatedQuejasForContract,
} from '../../hooks/useQuejaContractRelations'
import { useQuejas } from '../../hooks/useQuejas'
import { rellena } from '../../lib/formatters'
import { useT } from '../../i18n'

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
  const t = useT()
  const { data: relations } = useQuejaContractRelations()
  const { data: approvals } = useQuejaRelationApprovals()
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
        style={{
          all: 'unset',
          cursor: 'pointer',
          fontSize: 'var(--fs-micro)',
          color: 'var(--civic)',
        }}
      >
        {t('presupuesto.gasto.zona.todas')}
      </button>
      <div style={{ fontSize: 'var(--fs-head)', fontWeight: 700, marginTop: 4 }}>{zone.name}</div>
      {/* Contratos, no «obras»: la zona suma todo contrato cuyo título la nombra, y
          medido el 17-09-2026, 22 de los 47 contratos situados eran servicios o
          suministros, en 8 de las 12 zonas. Una zona con cinco servicios y una obra
          decía «6 obras». */}
      <div className="mono" style={{ fontSize: 'var(--fs-aux)', fontWeight: 700 }}>
        {fmtEur(total)} ·{' '}
        {rellena(
          t(
            works.length === 1
              ? 'presupuesto.gasto.contratos.uno'
              : 'presupuesto.gasto.contratos.varios',
          ),
          { n: works.length },
        )}
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
            relatedQuejas={relatedQuejasForContract(
              relations,
              quejas?.items,
              c.permalink,
              approvals?.approvals,
            )}
          />
        ))}
      </div>
    </div>
  )
}
