import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { REPORTAJE_SLUGS } from '../../../reportajes'
import { PALETTE, MONO } from '../tokens'

// Compact landing teaser for the long-form data reportajes. Follows the
// column's list idiom (same row typography and hairline separators as the
// press block): one kicker, each published pieza as a bare headline link, and
// a single footer link to the /reportajes index. Renders from the shared
// registry (src/reportajes.js — the same list the index uses) so the two
// surfaces can't drift. Honesty gate intact: only meta.estado === 'publicado'
// piezas list, and the whole block disappears when none are published (or on
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
    <article style={{ paddingBottom: 16, borderBottom: '1px solid ' + PALETTE.hair }}>
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
      {items.map(({ slug, meta }, i) => (
        <div
          key={slug}
          style={{
            padding: '10px 0',
            borderTop: i === 0 ? 'none' : '1px solid ' + PALETTE.hair,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>
            <Link
              to={'/reportajes/' + (meta.slug || slug)}
              style={{ color: 'inherit', textDecoration: 'none' }}
            >
              {meta.titulo}
            </Link>
          </div>
        </div>
      ))}
      <div
        style={{
          fontFamily: MONO,
          fontSize: 10.5,
          color: PALETTE.ink60,
          letterSpacing: '.06em',
          marginTop: 2,
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
