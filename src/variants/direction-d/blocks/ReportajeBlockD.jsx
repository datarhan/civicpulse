import { Link } from 'react-router-dom'
import { useReportaje } from '../../../hooks/useReportaje'
import { REPORTAJE_SLUGS } from '../../../reportajes'
import { PALETTE, SERIF, MONO } from '../tokens'

// Landing teasers for our long-form data reportajes, newest first, rendered
// from the shared registry (src/reportajes.js — the same list the /reportajes
// index uses, so the two surfaces can't drift). Honesty gate per pieza:
// a teaser renders ONLY when the piece is actually published
// (estado === 'publicado') — never while it's a borrador pending
// right-of-reply. Each teaser degrades to null on load/error.
export function ReportajeBlockD() {
  return (
    <>
      {REPORTAJE_SLUGS.map((slug, i) => (
        <ReportajeTeaser key={slug} slug={slug} first={i === 0} />
      ))}
    </>
  )
}

function ReportajeTeaser({ slug, first }) {
  const { loading, error, data } = useReportaje(slug)
  if (loading || error || !data) return null
  const m = data.meta || {}
  if (m.estado !== 'publicado') return null
  const href = '/reportajes/' + (m.slug || slug)
  return (
    <article
      style={{
        paddingTop: first ? 0 : 18,
        paddingBottom: 22,
        borderBottom: '1px solid ' + PALETTE.hair,
      }}
    >
      <div
        style={{
          fontFamily: MONO,
          fontSize: 10,
          color: PALETTE.accent,
          fontWeight: 700,
          letterSpacing: '.14em',
          textTransform: 'uppercase',
        }}
      >
        Reportaje · CivicPulse
      </div>
      <h2
        style={{
          fontFamily: SERIF,
          fontSize: 24,
          fontWeight: 800,
          letterSpacing: '-.02em',
          lineHeight: 1.12,
          margin: '8px 0 10px',
        }}
      >
        <Link to={href} style={{ color: 'inherit', textDecoration: 'none' }}>
          {m.titulo}
        </Link>
      </h2>
      {m.subtitulo && (
        <div
          style={{
            fontFamily: SERIF,
            fontSize: 14.5,
            color: PALETTE.ink80,
            lineHeight: 1.45,
            fontStyle: 'italic',
            marginBottom: 12,
          }}
        >
          {m.subtitulo}
        </div>
      )}
      <div
        style={{ fontFamily: MONO, fontSize: 10.5, color: PALETTE.ink60, letterSpacing: '.06em' }}
      >
        <Link to={href} style={{ color: PALETTE.civic, textDecoration: 'none', fontWeight: 600 }}>
          Leer el reportaje →
        </Link>
      </div>
    </article>
  )
}
