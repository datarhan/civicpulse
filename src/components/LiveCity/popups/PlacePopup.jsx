// @ts-check
import { ContractCard } from '../../tenders/ContractCard'

const fmtEur = (n) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n)

const KIND_LABEL = {
  street: 'Calle / camino',
  poi: 'Equipamiento',
  urbanizacion: 'Urbanización',
  barrio: 'Barrio',
}

/**
 * Map popup for a precise "obra situada" pin. Lists every located contract that
 * resolved to this place (via the multi-source resolver) using the shared
 * ContractCard. Honest by construction: a contract only appears here because its
 * title named this street / equipment / zone.
 */
export function PlacePopup({ place, assignments, contractsById, danaOnly, obrasOnly, cpvDict }) {
  const works = (assignments || [])
    .filter(
      (a) =>
        a.place?.sourceId === place.sourceId &&
        a.point &&
        (!danaOnly || a.dana) &&
        (!obrasOnly || a.contractType === 'construction'),
    )
    .map((a) => ({ a, c: contractsById.get(a.id) }))
    .filter((w) => w.c)
    .sort((x, y) => (y.a.date || '').localeCompare(x.a.date || ''))
  const total = works.reduce((s, w) => s + w.a.amount, 0)
  return (
    <div style={{ fontFamily: 'Outfit, system-ui, sans-serif', minWidth: 260, maxWidth: 320 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#0B0F19' }}>{place.name}</div>
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'baseline',
          flexWrap: 'wrap',
          marginTop: 1,
        }}
      >
        <span className="mono" style={{ fontSize: 12.5, fontWeight: 700, color: '#2463EB' }}>
          {fmtEur(total)} · {works.length} obra{works.length === 1 ? '' : 's'}
        </span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '.05em',
            color: 'rgba(11,15,25,.5)',
            border: '1px solid #DCD7C8',
            borderRadius: 3,
            padding: '1px 5px',
          }}
        >
          {KIND_LABEL[place.kind] || place.kind}
        </span>
      </div>
      <div style={{ marginTop: 6, maxHeight: 260, overflowY: 'auto' }}>
        {works.map(({ a, c }) => (
          <ContractCard
            key={a.id}
            contract={c}
            amount={a.amount}
            amountKind={a.amountKind}
            date={a.date}
            dana={a.dana}
            cpvDict={cpvDict}
          />
        ))}
      </div>
      <div
        style={{
          marginTop: 2,
          fontSize: 9.5,
          color: 'rgba(11,15,25,.5)',
          fontFamily: 'DM Mono, monospace',
          letterSpacing: '.03em',
        }}
      >
        Solo obras cuyo título nombra una calle, zona o equipamiento · PLACSP/TED
      </div>
    </div>
  )
}
