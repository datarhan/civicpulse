import { Card, Pill, ExtLink } from '../Primitives'
import { useParticipa, KIND_ICON, KIND_LABEL } from '../../hooks/useParticipa'
import { fmtDateLong, fmtDateShort } from '../../lib/formatters'

export function ParticipaBlock() {
  const { loading, error, data } = useParticipa()
  if (loading || error || !data) return null
  const items = data.items || []
  if (items.length === 0) return null
  const generated = fmtDateLong(data.generatedAt)
  const fmtDate = fmtDateShort

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
        <div
          className="mono"
          style={{
            fontSize: 10.5,
            color: 'var(--ink50)',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
          }}
        >
          Participación ciudadana
        </div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--ink50)' }}>
          · datos reales de participa.ribarroja.es · {data.stats.total} posts · actualizado{' '}
          {generated}
        </div>
      </div>
      {/* The platform was decommissioned; the scraper keeps the last good
          snapshot rather than blanking the section, which is right — but
          rendering 2026-05-14 posts with no marker implied a live feed for
          79 days. Say plainly that the source is gone and where it moved. */}
      {data.upstream?.status === 'retired' && (
        <div
          style={{
            padding: '9px 12px',
            marginBottom: 10,
            borderRadius: 8,
            background: 'var(--warn-soft)',
            border: '1px solid var(--border2)',
            fontSize: 11.5,
            color: 'var(--ink70)',
            lineHeight: 1.5,
          }}
        >
          <strong>Fuente retirada.</strong> El portal participa.ribarroja.es fue dado de baja; lo
          que se muestra es el último volcado ({fmtDateLong(data.upstream.lastGoodAt)}) y no se
          actualiza.{' '}
          {data.upstream.successorUrl && (
            <ExtLink href={data.upstream.successorUrl} style={{ color: 'var(--civic)' }}>
              Participación en el portal municipal ↗
            </ExtLink>
          )}
        </div>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 12,
        }}
      >
        {items.map((i) => (
          <Card key={i.id} hover>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: i.kind === 'survey' ? 'var(--civic-soft)' : 'var(--ok-soft)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 18,
                  flexShrink: 0,
                }}
              >
                {KIND_ICON[i.kind] || '📢'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <Pill tone={i.kind === 'survey' ? 'civic' : 'ok'} size="xs">
                    {KIND_LABEL[i.kind] || 'Aviso'}
                  </Pill>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--ink50)' }}>
                    {fmtDate(i.date)}
                  </span>
                </div>
                <ExtLink
                  href={i.link}
                  style={{
                    color: 'inherit',
                    textDecoration: 'none',
                    fontSize: 14,
                    fontWeight: 600,
                    lineHeight: 1.3,
                  }}
                >
                  {i.title.length > 90 ? i.title.slice(0, 90) + '…' : i.title}
                </ExtLink>
              </div>
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--ink60)',
                lineHeight: 1.45,
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {i.excerpt}
            </div>
            <div style={{ marginTop: 10, fontSize: 11 }}>
              <ExtLink
                href={i.link}
                style={{ color: 'var(--civic)', textDecoration: 'none', fontWeight: 500 }}
              >
                Ver convocatoria →
              </ExtLink>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
