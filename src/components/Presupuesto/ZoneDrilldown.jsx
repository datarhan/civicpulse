import { ExtLink, Pill } from '../Primitives'
import { STATUS_LABEL, STATUS_TONE } from '../../hooks/useTenders'
import { fmtDateShort } from '../../lib/formatters'

const fmtEur = (n) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n)

export default function ZoneDrilldown({ snapshot, zoneSlug, contractsById, danaOnly, onClear }) {
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
      <div style={{ marginTop: 8, maxHeight: 320, overflowY: 'auto' }}>
        {works.map(({ a, c }) => (
          <div key={a.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border2)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <div style={{ flex: 1, fontSize: 12.5, fontWeight: 500, lineHeight: 1.3 }}>
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
              <span className="mono" style={{ fontSize: 12, fontWeight: 700 }}>
                {fmtEur(a.amount)}
              </span>
            </div>
            <div
              style={{
                fontSize: 10.5,
                color: 'var(--ink50)',
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
              <span>· situado por «{a.matchedAlias[zoneSlug]}»</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
