import { Link } from 'react-router-dom'
import { useReportaje } from '../../../hooks/useReportaje'
import { PALETTE, SERIF, MONO } from '../tokens'

// Landing teaser for our own flagship data reportaje. Honesty gate: renders
// ONLY when the piece is actually published (estado === 'publicado') — never
// while it's a borrador pending right-of-reply. Degrades to null on load/error.
export function ReportajeBlockD({ slug = 'reconstruccion-dana' }) {
  const { loading, error, data } = useReportaje(slug)
  if (loading || error || !data) return null
  const m = data.meta || {}
  if (m.estado !== 'publicado') return null
  const href = '/reportajes/' + (m.slug || slug)
  return (
    <article style={{ paddingBottom: 22, borderBottom: '1px solid ' + PALETTE.hair }}>
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
