import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, Pill } from '../components/Primitives'
import DataAsOf from '../components/DataAsOf'
import { useEmpleo, deadlineInfo, OFERTA_STATUS_TONE } from '../hooks/useEmpleo'
import { fmtDateShort } from '../lib/formatters'
import { useT } from '../i18n'

/** Deadline chip: "cierra en N días" / "cerrada" / the date, tone by urgency. */
function DeadlinePill({ deadline, t }) {
  const info = deadlineInfo(deadline)
  if (!info) return null
  const label = info.closed
    ? t('empleo.closed')
    : info.days === 0
      ? t('empleo.closesToday')
      : `${t('empleo.closesIn')} ${info.days} ${t('empleo.days')}`
  return (
    <Pill tone={info.tone} size="xs">
      {label}
    </Pill>
  )
}

function OfferRow({ o, t }) {
  return (
    <Link
      to={`/empleo/${o.id}`}
      style={{
        display: 'block',
        padding: '12px 6px',
        borderBottom: '1px solid var(--border2)',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-.01em' }}>{o.titulo}</span>
        <Pill tone={OFERTA_STATUS_TONE[o.status] || o.statusTone || 'neutral'} size="xs">
          {o.status}
        </Pill>
        <DeadlinePill deadline={o.deadline} t={t} />
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          marginTop: 4,
          fontSize: 12,
          color: 'var(--ink60)',
        }}
      >
        <span className="mono" style={{ color: 'var(--ink50)' }}>
          {o.codigo}
        </span>
        {o.location && (
          <>
            <span style={{ color: 'var(--ink30)' }}>·</span>
            <span>{o.location}</span>
          </>
        )}
        {o.inRibaRoja && (
          <Pill tone="civic" size="xs">
            Riba-roja
          </Pill>
        )}
        <span style={{ color: 'var(--ink30)' }}>·</span>
        <span className="mono" style={{ color: 'var(--ink50)' }}>
          {fmtDateShort(o.publishedAt)}
        </span>
      </div>
    </Link>
  )
}

export default function Empleo() {
  const t = useT()
  const { loading, error, data } = useEmpleo()
  const [q, setQ] = useState('')
  const [ribaOnly, setRibaOnly] = useState(false)
  const [sortBy, setSortBy] = useState('deadline') // 'deadline' | 'published'

  const items = useMemo(() => data?.items ?? [], [data])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let out = items.filter((o) => {
      if (ribaOnly && !o.inRibaRoja) return false
      if (!needle) return true
      return (
        o.titulo.toLowerCase().includes(needle) ||
        o.codigo.toLowerCase().includes(needle) ||
        (o.location || '').toLowerCase().includes(needle)
      )
    })
    out = [...out].sort((a, b) => {
      if (sortBy === 'published') return b.publishedAt.localeCompare(a.publishedAt)
      // deadline ascending — soonest-closing first, offers with no deadline last
      if (!a.deadline && !b.deadline) return b.publishedAt.localeCompare(a.publishedAt)
      if (!a.deadline) return 1
      if (!b.deadline) return -1
      return a.deadline.localeCompare(b.deadline)
    })
    return out
  }, [items, q, ribaOnly, sortBy])

  const stats = data?.stats

  return (
    <div
      className="cp-page"
      style={{ padding: '24px 24px 48px', maxWidth: 1100, margin: '0 auto' }}
    >
      <div style={{ marginBottom: 8 }}>
        <div
          className="mono"
          style={{
            fontSize: 10.5,
            color: 'var(--ink50)',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
          }}
        >
          {t('empleo.eyebrow')}
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.015em', marginTop: 2 }}>
          {t('empleo.title')}
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink60)', marginTop: 6, lineHeight: 1.5 }}>
          {t('empleo.intro')}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <div
          className="mono"
          style={{
            fontSize: 10.5,
            color: 'var(--ink50)',
            textTransform: 'uppercase',
            letterSpacing: '.08em',
          }}
        >
          {`${stats?.openTotal ?? items.length} ${t('empleo.openOffers')}`}
          {stats?.closingSoon ? ` · ${stats.closingSoon} ${t('empleo.closingSoon')}` : ''}
        </div>
        {data?.generatedAt && <DataAsOf iso={data.generatedAt} label="Empleo" />}
      </div>

      {/* filter bar */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('empleo.searchPlaceholder')}
          aria-label={t('empleo.searchPlaceholder')}
          style={{
            flex: '1 1 220px',
            minWidth: 0,
            padding: '8px 11px',
            fontSize: 13,
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'var(--paper)',
            color: 'var(--ink)',
          }}
        />
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            color: 'var(--ink70)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          <input
            type="checkbox"
            checked={ribaOnly}
            onChange={(e) => setRibaOnly(e.target.checked)}
          />
          {t('empleo.ribaOnly')}
          {stats?.inRibaRoja != null && (
            <span className="mono" style={{ color: 'var(--ink40)' }}>
              ({stats.inRibaRoja})
            </span>
          )}
        </label>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          aria-label={t('empleo.sortBy')}
          style={{
            padding: '8px 11px',
            fontSize: 13,
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'var(--paper)',
            color: 'var(--ink)',
          }}
        >
          <option value="deadline">{t('empleo.sortDeadline')}</option>
          <option value="published">{t('empleo.sortPublished')}</option>
        </select>
      </div>

      <Card pad={false} style={{ padding: '4px 14px' }}>
        {loading && <div style={{ padding: 12, fontSize: 12, color: 'var(--ink50)' }}>…</div>}
        {error && (
          <div style={{ padding: 12, fontSize: 13, color: 'var(--warn-ink)' }}>
            {t('empleo.error')} <code>npm run scrape:empleo</code>
          </div>
        )}
        {!loading && !error && rows.length === 0 && (
          <div style={{ padding: 14, fontSize: 13, color: 'var(--ink60)' }}>
            {t('empleo.empty')}
          </div>
        )}
        {rows.map((o) => (
          <OfferRow key={o.id} o={o} t={t} />
        ))}
      </Card>

      <div style={{ marginTop: 12, fontSize: 11.5, color: 'var(--ink50)', lineHeight: 1.5 }}>
        {t('empleo.sourceNote')}
      </div>
    </div>
  )
}
