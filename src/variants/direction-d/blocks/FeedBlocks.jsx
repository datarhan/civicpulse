import { Link } from 'react-router-dom'
import { useTenders, formatDate as formatTenderDate } from '../../../hooks/useTenders'
import { contractAmount } from '../../../lib/tender-geo'
import { useParticipa, KIND_ICON } from '../../../hooks/useParticipa'
import { usePress, timeAgo as pressTimeAgo } from '../../../hooks/usePress'
import { useEvents, upcomingEvents, formatEventWhen } from '../../../hooks/useEvents'
import { useEmpleo } from '../../../hooks/useEmpleo'
import { PALETTE } from '../tokens'
import { SectionHeader } from '../SectionHeader'
import { ExtLink } from '../../../components/Primitives'
import { RetiredSourceNote } from '../../../components/RetiredSourceNote'
import { useT } from '../../../i18n'

export function EmpleoBlockD() {
  const t = useT()
  const { loading, error, data } = useEmpleo()
  if (loading || error || !data) return null
  const items = data.items || []
  if (items.length === 0) return null
  // Closing-soon first (offers with a deadline), else newest.
  const withDeadline = items.filter((o) => o.deadline)
  const picks = (withDeadline.length ? withDeadline : items)
    .slice()
    .sort((a, b) => (a.deadline && b.deadline ? a.deadline.localeCompare(b.deadline) : 0))
    .slice(0, 3)
  const fmt = (iso) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
  return (
    <div>
      <SectionHeader
        tone="empleo"
        title={t('landing.section.empleo')}
        meta={`${data.stats.openTotal} ${t('landing.ofertas')}`}
      />
      {picks.map((o, i) => {
        const muni = (o.detail && o.detail.municipio) || o.location || ''
        return (
          <div
            key={o.id}
            style={{ padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid ' + PALETTE.hair }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35, marginBottom: 2 }}>
              <Link to={`/empleo/${o.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                {o.titulo}
              </Link>
            </div>
            <div className="mono" style={{ fontSize: 10, color: PALETTE.ink60 }}>
              {muni.length > 30 ? muni.slice(0, 30) + '…' : muni}
              {o.deadline ? ` · cierra ${fmt(o.deadline)}` : ''}
            </div>
          </div>
        )
      })}
      <Link
        to="/empleo"
        style={{
          display: 'inline-block',
          marginTop: 6,
          fontSize: 11.5,
          color: PALETTE.civic,
          textDecoration: 'none',
          fontWeight: 600,
        }}
      >
        {t('landing.empleo.all')}
      </Link>
    </div>
  )
}

export function LiveContracts() {
  const t = useT()
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
    <div>
      <SectionHeader
        tone="contratos"
        title={t('landing.section.contratos')}
        // awardedContracts, not totalContracts. Under a heading that says
        // ADJUDICADOS this paired the count of ALL 804 contracts — void,
        // abandoned and revoked included — with the money of only the 698
        // committed ones, while the same screen showed 698 elsewhere. Found by
        // the reader-review agent, on a page a human had already audited.
        meta={`${data.stats.awardedContracts} · ${fmtEur(data.stats.awardedTotalEuros)}`}
      />
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
            <ExtLink href={c.permalink} style={{ color: 'inherit', textDecoration: 'none' }}>
              {c.title.length > 100 ? c.title.slice(0, 100) + '…' : c.title}
            </ExtLink>
          </div>
          <div style={{ display: 'flex', gap: 10, fontSize: 11.5, color: PALETTE.ink60 }}>
            <span>{c.contractor || 'Sin adjudicatario'}</span>
            <span
              style={{ marginLeft: 'auto', fontWeight: 700, color: PALETTE.ink }}
              className="mono"
            >
              {fmtEur(contractAmount(c))}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

export function ParticipaBlockD() {
  const t = useT()
  const { loading, error, data } = useParticipa()
  if (loading || error || !data) return null
  const items = (data.items || []).slice(0, 3)
  if (items.length === 0) return null
  const fmt = (iso) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
  return (
    <div>
      <SectionHeader
        tone="participa"
        title={t('landing.section.participa')}
        meta={data.stats.total}
      />
      <RetiredSourceNote upstream={data.upstream} />
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
              <ExtLink href={it.link} style={{ color: 'inherit', textDecoration: 'none' }}>
                {it.title.length > 80 ? it.title.slice(0, 80) + '…' : it.title}
              </ExtLink>
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
  const t = useT()
  const { loading, error, data } = usePress()
  if (loading || error || !data) return null
  const items = (data.items || []).slice(0, 5)
  if (items.length === 0) return null
  return (
    <div>
      <SectionHeader
        tone="prensa"
        title={`${t('landing.section.prensa')} · ${data.stats.total} ${t('landing.titulares')}`}
        meta={`${data.stats.sources} ${t('landing.medios')}`}
      />
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
            <ExtLink href={p.link} style={{ color: 'inherit', textDecoration: 'none' }}>
              {p.title.length > 110 ? p.title.slice(0, 110) + '…' : p.title}
            </ExtLink>
          </div>
        </div>
      ))}
    </div>
  )
}

export function EventsBlockD() {
  const t = useT()
  const { loading, error, data } = useEvents()
  if (loading || error || !data) return null
  const items = upcomingEvents(data).slice(0, 4)
  if (items.length === 0) return null
  return (
    <div>
      <SectionHeader
        tone="eventos"
        title={t('landing.section.eventos')}
        meta={data.stats?.upcoming ?? items.length}
      />
      {items.map((e, i) => (
        <div
          key={e.id}
          style={{
            display: 'flex',
            gap: 10,
            padding: '10px 0',
            borderTop: i === 0 ? 'none' : '1px solid ' + PALETTE.hair,
            alignItems: 'flex-start',
          }}
        >
          <div
            className="mono"
            style={{
              flexShrink: 0,
              width: 46,
              fontSize: 11,
              fontWeight: 700,
              color: PALETTE.civic,
              lineHeight: 1.2,
              textTransform: 'uppercase',
            }}
          >
            {formatEventWhen(e.eventDate, e.eventDateText)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3, marginBottom: 2 }}>
              <ExtLink href={e.link} style={{ color: 'inherit', textDecoration: 'none' }}>
                {e.title.length > 80 ? e.title.slice(0, 80) + '…' : e.title}
              </ExtLink>
            </div>
            {e.eventDateText && (
              <div className="mono" style={{ fontSize: 10, color: PALETTE.ink60 }}>
                {e.eventDateText}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
