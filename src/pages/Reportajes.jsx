import { Link } from 'react-router-dom'
import { useReportaje } from '../hooks/useReportaje'
import { REPORTAJE_SLUGS } from '../reportajes'
import { fmtDateHuman } from '../lib/formatters'
import { useT } from '../i18n'

const SERIF = "'Fraunces', Georgia, serif"

/* Card for one pieza. Fetches its own frozen snapshot and renders ONLY when
 * meta.estado === 'publicado' (borradores pending right-of-reply never list). */
function ReportajeCard({ slug, readLabel }) {
  const { loading, error, data } = useReportaje(slug)
  if (loading || error || !data) return null
  const m = data.meta || {}
  if (m.estado !== 'publicado') return null
  const href = `/reportajes/${m.slug || slug}`
  return (
    <article
      style={{
        background: 'var(--paper)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '22px 24px',
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
        {m.seccion}
        {/* fmtDateHuman, not the raw value: `publicadoEl` is prose ("15 de
            julio de 2026") but `fechaDatos` is ISO, so the fallback branch was
            printing "2026-07-06" next to a Spanish date on the same page. */}
        {(m.publicadoEl || m.fechaDatos) && (
          <span> · {fmtDateHuman(m.publicadoEl || m.fechaDatos)}</span>
        )}
      </div>
      <h2
        style={{
          fontFamily: SERIF,
          fontSize: 24,
          fontWeight: 600,
          letterSpacing: '-.015em',
          lineHeight: 1.15,
          margin: '8px 0 10px',
        }}
      >
        <Link to={href} style={{ color: 'inherit', textDecoration: 'none' }}>
          {m.titulo}
        </Link>
      </h2>
      <p style={{ fontSize: 14.5, color: 'var(--ink60)', lineHeight: 1.5, margin: '0 0 12px' }}>
        {m.subtitulo}
      </p>
      <Link
        to={href}
        className="mono"
        style={{ fontSize: 12, color: 'var(--civic)', textDecoration: 'none', fontWeight: 600 }}
      >
        {readLabel}
      </Link>
    </article>
  )
}

export default function Reportajes() {
  const t = useT()
  return (
    <div className="cp-page" style={{ padding: 24, maxWidth: 760, margin: '0 auto' }}>
      <div
        className="mono"
        style={{
          fontSize: 10.5,
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
        }}
      >
        {t('reportajes.eyebrow')}
      </div>
      <h1
        style={{
          fontFamily: SERIF,
          fontSize: 'clamp(28px, 4.5vw, 38px)',
          fontWeight: 600,
          letterSpacing: '-.015em',
          lineHeight: 1.1,
          margin: '4px 0 12px',
        }}
      >
        {t('reportajes.title')}
      </h1>
      <p style={{ fontSize: 15.5, color: 'var(--ink60)', lineHeight: 1.55, margin: '0 0 24px' }}>
        {t('reportajes.intro')}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {REPORTAJE_SLUGS.map((s) => (
          <ReportajeCard key={s} slug={s} readLabel={t('reportajes.read')} />
        ))}
      </div>
    </div>
  )
}
