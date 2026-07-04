// @ts-check
import { ExtLink, Pill } from '../../Primitives'
import { STATUS_LABEL, STATUS_TONE } from '../../../hooks/useTenders'
import { fmtDateShort } from '../../../lib/formatters'

const fmtEur = (n) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n)

/**
 * Money-zone map popup. Joins the zone's tender-geo assignments to the loaded
 * tenders snapshot (contractsById) and lists each located contract — a
 * click-to-drill version of ZoneDrilldown without the side-panel back button.
 * Honest by construction: only contracts whose title named a zone are located.
 */
export function ZonePopup({ zone, snapshot, contractsById, danaOnly }) {
  const works = (snapshot?.assignments || [])
    .filter((a) => a.zones.includes(zone.slug) && (!danaOnly || a.dana))
    .map((a) => ({ a, c: contractsById.get(a.id) }))
    .filter((w) => w.c)
    .sort((x, y) => (y.a.date || '').localeCompare(x.a.date || ''))
  const total = works.reduce((s, w) => s + w.a.amount, 0)
  return (
    <div style={{ fontFamily: 'Outfit, system-ui, sans-serif', minWidth: 250, maxWidth: 300 }}>
      <div style={{ fontSize: 15, fontWeight: 700 }}>{zone.name}</div>
      <div className="mono" style={{ fontSize: 12.5, fontWeight: 700, color: '#2463EB' }}>
        {fmtEur(total)} · {works.length} obra{works.length === 1 ? '' : 's'}
      </div>
      <div style={{ marginTop: 6, maxHeight: 220, overflowY: 'auto' }}>
        {works.map(({ a, c }) => (
          <div key={a.id} style={{ padding: '7px 0', borderBottom: '1px solid #E6E1D4' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <div style={{ flex: 1, fontSize: 12, fontWeight: 500, lineHeight: 1.3 }}>
                <ExtLink href={c.permalink} style={{ color: 'inherit', textDecoration: 'none' }}>
                  {c.title}
                </ExtLink>
                {a.dana && (
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: 9,
                      fontWeight: 700,
                      color: '#A85F00',
                      background: 'rgba(224,134,0,.16)',
                      padding: '1px 5px',
                      borderRadius: 3,
                    }}
                  >
                    DANA
                  </span>
                )}
              </div>
              <span className="mono" style={{ fontSize: 11.5, fontWeight: 700 }}>
                {fmtEur(a.amount)}
              </span>
            </div>
            <div
              style={{
                fontSize: 10,
                color: 'rgba(11,15,25,.5)',
                marginTop: 2,
                display: 'flex',
                gap: 6,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <span>{fmtDateShort(a.date) || 'sin fecha'}</span>
              <Pill tone={STATUS_TONE[c.status] || 'ghost'} size="xs">
                {STATUS_LABEL[c.status] || c.status}
              </Pill>
              {a.amountKind === 'initial' && <span>importe de licitación</span>}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 6,
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
