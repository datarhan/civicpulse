// @ts-check
import { ContractCard } from '../../tenders/ContractCard'

const fmtEur = (n) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n)

/**
 * Money-zone map popup. Joins the zone's tender-geo assignments to the loaded
 * tenders snapshot (contractsById) and lists each located contract via the
 * shared ContractCard (winner, baja, CPV, procedure, bidders). Honest by
 * construction: only contracts whose title named a zone are located.
 */
export function ZonePopup({ zone, snapshot, contractsById, danaOnly, cpvDict }) {
  const works = (snapshot?.assignments || [])
    .filter((a) => a.zones.includes(zone.slug) && (!danaOnly || a.dana))
    .map((a) => ({ a, c: contractsById.get(a.id) }))
    .filter((w) => w.c)
    .sort((x, y) => (y.a.date || '').localeCompare(x.a.date || ''))
  const total = works.reduce((s, w) => s + w.a.amount, 0)
  return (
    <div style={{ fontFamily: 'Outfit, system-ui, sans-serif', minWidth: 260, maxWidth: 320 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#0B0F19' }}>{zone.name}</div>
      <div className="mono" style={{ fontSize: 12.5, fontWeight: 700, color: '#2463EB' }}>
        {fmtEur(total)} · {works.length} obra{works.length === 1 ? '' : 's'}
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
            provenance={a.matchedAlias?.[zone.slug]}
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
        Solo obras cuyo título nombra una zona · PLACSP/TED
      </div>
    </div>
  )
}
