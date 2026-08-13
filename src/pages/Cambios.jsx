import { Link } from 'react-router-dom'
import { Card, Pill, SectionHead, ShareWA, ExtLink } from '../components/Primitives'
import { useCambios, KIND_LABEL_ES, KIND_TONE } from '../hooks/useCambios'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useT } from '../i18n'
import { useState } from 'react'

const WINDOW_OPTIONS = [
  { days: 7, label: '7 días' },
  { days: 14, label: '14 días' },
  { days: 30, label: '30 días' },
]

function WindowToggle({ current, onChange }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        gap: 4,
        background: 'var(--soft)',
        padding: 2,
        borderRadius: 7,
      }}
    >
      {WINDOW_OPTIONS.map((o) => (
        <button
          key={o.days}
          onClick={() => onChange(o.days)}
          style={{
            padding: '4px 10px',
            borderRadius: 5,
            fontSize: 12,
            fontWeight: current === o.days ? 600 : 500,
            background: current === o.days ? 'var(--paper)' : 'transparent',
            color: current === o.days ? 'var(--ink)' : 'var(--ink50)',
            boxShadow: current === o.days ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function KindCard({ kind, items, formatDate }) {
  if (!items || items.length === 0) return null
  return (
    <Card>
      <SectionHead
        eyebrow={`${items.length} ${items.length === 1 ? 'cambio' : 'cambios'}`}
        title={KIND_LABEL_ES[kind] || kind}
        right={
          <Pill tone={KIND_TONE[kind] || 'ghost'} size="xs">
            {items.length}
          </Pill>
        }
      />
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.slice(0, 10).map((it, i) => (
          <div
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: '90px 1fr min-content',
              gap: 10,
              alignItems: 'baseline',
              padding: '6px 0',
              borderTop: i === 0 ? 'none' : '1px dotted var(--border2)',
            }}
          >
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink50)' }}>
              {formatDate ? formatDate(it.date) : it.date}
            </span>
            <div style={{ minWidth: 0 }}>
              {it.external ? (
                <ExtLink
                  href={it.url}
                  style={{
                    color: 'var(--ink70)',
                    textDecoration: 'none',
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  {it.title}
                </ExtLink>
              ) : (
                <Link
                  to={it.url}
                  style={{
                    color: 'var(--ink70)',
                    textDecoration: 'none',
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  {it.title}
                </Link>
              )}
              {it.subtitle && (
                <div
                  className="mono"
                  style={{ fontSize: 10.5, color: 'var(--ink50)', marginTop: 2 }}
                >
                  {it.subtitle}
                </div>
              )}
            </div>
            <ShareWA
              text={it.shareText}
              url={it.external ? it.url : `https://civicpulse.es${it.url}`}
            />
          </div>
        ))}
        {items.length > 10 && (
          <div className="mono" style={{ fontSize: 11, color: 'var(--ink50)', marginTop: 4 }}>
            + {items.length - 10} más · ver {KIND_LABEL_ES[kind] || kind} completo
          </div>
        )}
      </div>
    </Card>
  )
}

export default function Cambios() {
  const t = useT()
  const [days, setDays] = useState(7)
  const { loading, byKind, totalCount, windowDays, formatDate } = useCambios(days)
  useDocumentTitle(t('cambios.title') || 'Novedades')

  const kinds = ['queja', 'pleno', 'licitacion', 'subvencion', 'prensa', 'participa']

  return (
    <div
      className="cp-page"
      style={{ padding: '24px 24px 48px', maxWidth: 1100, margin: '0 auto' }}
    >
      <div
        style={{
          marginBottom: 18,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            className="mono"
            style={{
              fontSize: 10.5,
              color: 'var(--ink50)',
              textTransform: 'uppercase',
              letterSpacing: '.08em',
            }}
          >
            {t('cambios.eyebrow') || 'Esta semana en Riba-roja'}
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.015em', marginTop: 2 }}>
            {t('cambios.title') || 'Novedades'}
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--ink50)', marginTop: 4, maxWidth: 720 }}>
            Todo lo que ha cambiado en los últimos {windowDays} días: quejas nuevas, plenos,
            contratos adjudicados, subvenciones, prensa y participación ciudadana. Cada tarjeta
            lleva un botón verde (WA) para compartir por WhatsApp.
          </div>
        </div>
        <WindowToggle current={days} onChange={setDays} />
      </div>

      {!loading && totalCount === 0 && (
        <Card>
          <SectionHead
            eyebrow="Sin cambios"
            title={`Sin novedades en los últimos ${windowDays} días`}
          />
          <div style={{ fontSize: 13, color: 'var(--ink50)', marginTop: 6 }}>
            No se han registrado quejas, plenos, contratos, subvenciones ni prensa en este periodo.
            Prueba a ampliar la ventana a 14 o 30 días.
          </div>
        </Card>
      )}

      {!loading && totalCount > 0 && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {kinds
              .filter((k) => byKind[k]?.length)
              .map((k) => (
                <Pill key={k} tone={KIND_TONE[k]} size="sm">
                  {KIND_LABEL_ES[k]} · {byKind[k].length}
                </Pill>
              ))}
          </div>
          <div style={{ display: 'grid', gap: 14 }}>
            {kinds.map((k) => (
              <KindCard key={k} kind={k} items={byKind[k]} formatDate={formatDate} />
            ))}
          </div>
          <div style={{ marginTop: 18, fontSize: 12, color: 'var(--ink50)', textAlign: 'center' }}>
            Total: {totalCount} cambio{totalCount === 1 ? '' : 's'} · ventana de {windowDays} días ·
            cada evento enlazable, compartible y con cita a la fuente.
          </div>
        </>
      )}

      {loading && (
        <Card>
          <div style={{ fontSize: 13, color: 'var(--ink50)' }}>Cargando novedades…</div>
        </Card>
      )}
    </div>
  )
}
