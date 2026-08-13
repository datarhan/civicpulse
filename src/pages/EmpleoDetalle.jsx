import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Card, Pill, SectionHead, ExtLink } from '../components/Primitives'
import DataAsOf from '../components/DataAsOf'
import { useEmpleo, deadlineInfo, OFERTA_STATUS_TONE } from '../hooks/useEmpleo'
import { fmtDateLong } from '../lib/formatters'
import { useT } from '../i18n'

/** At-a-glance fact tile. */
function Tile({ label, value, tone }) {
  if (!value) return null
  const color =
    tone === 'crit' ? 'var(--crit-ink)' : tone === 'warn' ? 'var(--warn-ink)' : 'var(--ink)'
  return (
    <div
      style={{
        padding: '10px 12px',
        border: '1px solid var(--border2)',
        borderRadius: 'var(--r-card)',
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 9.5,
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.06em',
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color, marginTop: 3, lineHeight: 1.35 }}>
        {value}
      </div>
    </div>
  )
}

/** A label/value row from the offer "ficha". */
function FieldRow({ label, value }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '190px 1fr',
        gap: 12,
        padding: '9px 0',
        borderBottom: '1px solid var(--border2)',
        fontSize: 13,
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 11,
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.04em',
        }}
      >
        {label}
      </div>
      <div style={{ color: 'var(--ink70)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{value}</div>
    </div>
  )
}

export default function EmpleoDetalle() {
  const t = useT()
  const { id } = useParams()
  const { loading, error, data } = useEmpleo()
  const offer = useMemo(() => (data?.items ?? []).find((o) => o.id === id) || null, [data, id])

  if (loading) {
    return (
      <div className="cp-page" style={{ padding: '24px', color: 'var(--ink50)', fontSize: 13 }}>
        …
      </div>
    )
  }

  if (error || !offer) {
    return (
      <div
        className="cp-page"
        style={{ padding: '24px 24px 48px', maxWidth: 800, margin: '0 auto' }}
      >
        <Link to="/empleo" style={{ fontSize: 13, color: 'var(--civic)', textDecoration: 'none' }}>
          ← {t('empleo.back')}
        </Link>
        <div
          style={{
            marginTop: 14,
            padding: 16,
            border: '1px solid var(--border2)',
            borderRadius: 'var(--r-card)',
            fontSize: 13,
            color: 'var(--ink50)',
            lineHeight: 1.6,
          }}
        >
          {t('empleoDetail.notFound')}
        </div>
      </div>
    )
  }

  const d = offer.detail
  const info = deadlineInfo(offer.deadline)
  const lugar = [d?.municipio, d?.provincia].filter(Boolean).join(', ')

  return (
    <div className="cp-page" style={{ padding: '24px 24px 48px', maxWidth: 900, margin: '0 auto' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}
      >
        <Link to="/empleo" style={{ fontSize: 13, color: 'var(--civic)', textDecoration: 'none' }}>
          ← {t('empleo.back')}
        </Link>
        {data?.generatedAt && <DataAsOf iso={data.generatedAt} label="Empleo" />}
      </div>

      <div style={{ marginTop: 14, marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--ink50)' }}>
            {offer.codigo}
          </span>
          <Pill tone={OFERTA_STATUS_TONE[offer.status] || offer.statusTone || 'neutral'} size="xs">
            {offer.status}
          </Pill>
          {offer.inRibaRoja && (
            <Pill tone="civic" size="xs">
              Riba-roja de Túria
            </Pill>
          )}
        </div>
        <h1 style={{ fontSize: 25, fontWeight: 700, letterSpacing: '-.02em', margin: '6px 0 0' }}>
          {offer.titulo}
        </h1>
      </div>

      {/* fact tiles */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 10,
          margin: '14px 0',
        }}
      >
        <Tile label={t('empleo.published')} value={fmtDateLong(offer.publishedAt)} />
        <Tile
          label={t('empleo.deadline')}
          value={offer.deadline ? fmtDateLong(offer.deadline) : '—'}
          tone={info?.closingSoon ? (info.days <= 7 ? 'crit' : 'warn') : undefined}
        />
        <Tile label={t('empleo.workplace')} value={lugar || offer.location || '—'} />
        <Tile label={t('empleo.positions')} value={d?.numPuestos} />
      </div>

      {/* apply CTA */}
      <ExtLink
        href={offer.url}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '9px 14px',
          borderRadius: 'var(--r-input)',
          background: 'var(--ink)',
          color: 'var(--paper)',
          fontSize: 13,
          fontWeight: 600,
          textDecoration: 'none',
          marginBottom: 18,
        }}
      >
        {t('empleo.applyCta')} ↗
      </ExtLink>

      {/* Datos generales */}
      {d && d.fields?.length > 0 && (
        <Card style={{ marginBottom: 14 }}>
          <SectionHead eyebrow={t('empleoDetail.section')} title={t('empleoDetail.generalData')} />
          <div>
            {d.fields.map((f, i) => (
              <FieldRow key={`${f.label}-${i}`} label={f.label} value={f.value} />
            ))}
          </div>
        </Card>
      )}

      {/* Ocupaciones solicitadas */}
      {d?.ocupaciones?.length > 0 && (
        <Card>
          <SectionHead
            eyebrow={t('empleoDetail.requested')}
            title={t('empleoDetail.occupations')}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {d.ocupaciones.map((oc, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 8,
                  flexWrap: 'wrap',
                  fontSize: 13,
                }}
              >
                <span style={{ fontWeight: 600, color: 'var(--ink70)' }}>{oc.nombre}</span>
                {oc.experiencia && (
                  <Pill tone="neutral" size="xs">
                    {t('empleoDetail.experience')}: {oc.experiencia}
                  </Pill>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {!d && (
        <div style={{ fontSize: 12.5, color: 'var(--ink50)', lineHeight: 1.5 }}>
          {t('empleoDetail.noDetail')}
        </div>
      )}

      <div style={{ marginTop: 16, fontSize: 11.5, color: 'var(--ink50)', lineHeight: 1.5 }}>
        {t('empleo.sourceNote')}
      </div>
    </div>
  )
}
