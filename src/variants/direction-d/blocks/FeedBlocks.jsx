import { useTenders, formatDate as formatTenderDate } from '../../../hooks/useTenders'
import { useParticipa, KIND_ICON } from '../../../hooks/useParticipa'
import { usePress, timeAgo as pressTimeAgo } from '../../../hooks/usePress'
import { PALETTE } from '../tokens'

export function LiveContracts() {
  const { loading, error, data } = useTenders()
  if (loading || error || !data) return null
  const recent = (data.top?.recentAwarded || []).slice(0, 4)
  if (recent.length === 0) return null

  const fmtEur = (n) =>
    new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
      notation: n >= 100_000 ? 'compact' : 'standard',
    }).format(n)

  return (
    <div style={{ marginBottom: 18, borderTop: '1px solid ' + PALETTE.hair, paddingTop: 14 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <div
          className="mono"
          style={{
            fontSize: 10,
            color: PALETTE.ink60,
            letterSpacing: '.12em',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          Contratos adjudicados
        </div>
        <div className="mono" style={{ fontSize: 10, color: PALETTE.ink60 }}>
          {data.stats.totalContracts} · {fmtEur(data.stats.awardedTotalEuros)}
        </div>
      </div>
      {recent.map((c, i) => (
        <div
          key={c.id}
          style={{
            padding: '10px 0',
            borderTop: i === 0 ? 'none' : '1px solid ' + PALETTE.hair,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
            <span
              className="mono"
              style={{
                fontSize: 10,
                color: PALETTE.accent,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              {c.categoryTitle || c.contractType || 'Contrato'}
            </span>
            <span className="mono" style={{ fontSize: 10, color: PALETTE.ink50 }}>
              {formatTenderDate(c.awardDate)}
            </span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35, marginBottom: 2 }}>
            {c.permalink ? (
              <a
                href={c.permalink}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                {c.title.length > 100 ? c.title.slice(0, 100) + '…' : c.title}
              </a>
            ) : (
              c.title
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, fontSize: 11.5, color: PALETTE.ink60 }}>
            <span>{c.contractor || 'Sin adjudicatario'}</span>
            <span
              style={{ marginLeft: 'auto', fontWeight: 700, color: PALETTE.ink }}
              className="mono"
            >
              {fmtEur(c.finalAmount)}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

export function ParticipaBlockD() {
  const { loading, error, data } = useParticipa()
  if (loading || error || !data) return null
  const items = (data.items || []).slice(0, 3)
  if (items.length === 0) return null
  const fmt = (iso) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
  return (
    <div
      style={{
        marginBottom: 18,
        borderTop: '1px solid ' + PALETTE.hair,
        paddingTop: 14,
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 10,
          color: PALETTE.ink60,
          letterSpacing: '.12em',
          textTransform: 'uppercase',
          fontWeight: 700,
          marginBottom: 8,
        }}
      >
        Participación ciudadana · {data.stats.total}
      </div>
      {items.map((it, i) => (
        <div
          key={it.id}
          style={{
            display: 'flex',
            gap: 10,
            padding: '10px 0',
            borderTop: i === 0 ? 'none' : '1px solid ' + PALETTE.hair,
            alignItems: 'flex-start',
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: it.kind === 'survey' ? 'rgba(36,99,235,.12)' : 'rgba(22,163,74,.12)',
              display: 'grid',
              placeItems: 'center',
              fontSize: 14,
              flexShrink: 0,
            }}
          >
            {KIND_ICON[it.kind] || '📢'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3, marginBottom: 2 }}>
              <a
                href={it.link}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                {it.title.length > 80 ? it.title.slice(0, 80) + '…' : it.title}
              </a>
            </div>
            <div className="mono" style={{ fontSize: 10, color: PALETTE.ink60 }}>
              {fmt(it.date)} · {it.categories[0] || 'aviso'}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function PressBlockD() {
  const { loading, error, data } = usePress()
  if (loading || error || !data) return null
  const items = (data.items || []).slice(0, 5)
  if (items.length === 0) return null
  return (
    <div
      style={{
        marginBottom: 18,
        borderTop: '1px solid ' + PALETTE.hair,
        paddingTop: 14,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <div
          className="mono"
          style={{
            fontSize: 10,
            color: PALETTE.ink60,
            letterSpacing: '.12em',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          Prensa · {data.stats.total} titulares
        </div>
        <div className="mono" style={{ fontSize: 10, color: PALETTE.ink50 }}>
          {data.stats.sources} medios
        </div>
      </div>
      {items.map((p, i) => (
        <div
          key={p.id}
          style={{
            padding: '10px 0',
            borderTop: i === 0 ? 'none' : '1px solid ' + PALETTE.hair,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
            <span
              className="mono"
              style={{
                fontSize: 10,
                color: p.official ? PALETTE.civic : PALETTE.accent,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              {p.source}
            </span>
            {p.official && (
              <span
                className="mono"
                title="Fuente primaria · Ayuntamiento"
                style={{
                  fontSize: 8.5,
                  fontWeight: 700,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                  color: 'white',
                  background: PALETTE.civic,
                  padding: '1px 5px',
                  borderRadius: 3,
                }}
              >
                Oficial
              </span>
            )}
            <span className="mono" style={{ fontSize: 10, color: PALETTE.ink50 }}>
              {pressTimeAgo(p.date)}
            </span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>
            <a
              href={p.link}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'inherit', textDecoration: 'none' }}
            >
              {p.title.length > 110 ? p.title.slice(0, 110) + '…' : p.title}
            </a>
          </div>
        </div>
      ))}
    </div>
  )
}
