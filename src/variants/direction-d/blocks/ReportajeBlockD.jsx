import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { REPORTAJE_SLUGS } from '../../../reportajes'
import { PALETTE, SERIF, MONO } from '../tokens'

// Compact landing teaser for the long-form data reportajes: one kicker, the
// published piezas as plain title links (no standfirst), and a single footer
// link to the /reportajes index. Renders from the shared registry
// (src/reportajes.js — the same list the index uses) so the two surfaces
// can't drift. Honesty gate intact: only meta.estado === 'publicado' piezas
// list, and the whole block disappears when none are published (or on
// load/error) — never an empty shell.
function useReportajesPublicados() {
  const [items, setItems] = useState(null)
  useEffect(() => {
    let alive = true
    Promise.all(
      REPORTAJE_SLUGS.map((slug) =>
        fetch(`/data/reportajes/${slug}.json`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ),
    ).then((snaps) => {
      if (!alive) return
      setItems(
        snaps
          .map((snap, i) => ({ slug: REPORTAJE_SLUGS[i], meta: snap?.meta }))
          .filter((x) => x.meta && x.meta.estado === 'publicado'),
      )
    })
    return () => {
      alive = false
    }
  }, [])
  return items
}

export function ReportajeBlockD() {
  const items = useReportajesPublicados()
  if (!items || items.length === 0) return null
  return (
    <article style={{ paddingBottom: 18, borderBottom: '1px solid ' + PALETTE.hair }}>
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
        Reportajes · CivicPulse
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, margin: '9px 0 0' }}>
        {items.map(({ slug, meta }) => (
          <h2
            key={slug}
            style={{
              margin: 0,
              fontFamily: SERIF,
              fontSize: 15.5,
              fontWeight: 700,
              letterSpacing: '-.01em',
              lineHeight: 1.3,
            }}
          >
            <Link
              to={'/reportajes/' + (meta.slug || slug)}
              style={{ color: 'inherit', textDecoration: 'none' }}
            >
              {meta.titulo}
            </Link>
          </h2>
        ))}
      </div>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 10.5,
          color: PALETTE.ink60,
          letterSpacing: '.06em',
          marginTop: 11,
        }}
      >
        <Link
          to="/reportajes"
          style={{ color: PALETTE.civic, textDecoration: 'none', fontWeight: 600 }}
        >
          Todos los reportajes →
        </Link>
      </div>
    </article>
  )
}
