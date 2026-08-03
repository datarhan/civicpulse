import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { REPORTAJE_SLUGS } from '../../../reportajes'
import { loadSnapshotOptional } from '../../../lib/snapshot-store'
import { truncateAtWord, fmtDateHuman } from '../../../lib/formatters'
import { PALETTE, SERIF, MONO } from '../tokens'
import { SectionHeader } from '../SectionHeader'

/**
 * The landing column's lead block: CivicPulse's own long-form investigations.
 *
 * It replaced the third-party press lead (a single headline + excerpt lifted
 * from whichever outlet published most recently) in August 2026. Both occupied
 * the most valuable slot on the page, and only one of them is ours — the
 * aggregated press feed still runs further down as `PressBlockD`, so nothing
 * was lost by demoting it out of the lead.
 *
 * Each pieza now carries the summary a reader needs to decide whether to open
 * it. A bare headline list made the block the least informative thing in the
 * column while pointing at the most expensive work in the project.
 *
 * Renders from the shared registry (src/reportajes.js — the same list the
 * /reportajes index uses) so the two surfaces can't drift. Honesty gate
 * intact: only `meta.estado === 'publicado'` piezas list, and the whole block
 * disappears when none are published (or on load/error) — never an empty shell.
 */

/** Summary budget: ~3 lines in the 420px column. Long enough to carry a
 *  finding, short enough that two piezas don't crowd out the blocks below. */
export const SUMMARY_CHARS = 170

/** "Reportaje · Dinero público" → "Dinero público". The section header already
 *  says Reportajes; repeating it on every row is noise. */
export function reportajeTopic(seccion) {
  if (!seccion) return ''
  return seccion.replace(/^\s*reportajes?\s*[·:-]\s*/iu, '').trim()
}

function useReportajesPublicados() {
  const [items, setItems] = useState(null)
  useEffect(() => {
    let alive = true
    Promise.all(
      REPORTAJE_SLUGS.map((slug) => loadSnapshotOptional(`/data/reportajes/${slug}.json`)),
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
    <div>
      <SectionHeader
        tone="reportajes"
        title="Reportajes · CivicPulse"
        meta={`${items.length} ${items.length === 1 ? 'pieza' : 'piezas'}`}
      />
      {items.map(({ slug, meta }, i) => {
        const topic = reportajeTopic(meta.seccion)
        const fecha = fmtDateHuman(meta.publicadoEl || meta.fechaDatos)
        const correcciones = meta.correcciones?.length ?? 0
        return (
          <div
            key={slug}
            style={{
              padding: '11px 0',
              borderTop: i === 0 ? 'none' : '1px solid ' + PALETTE.hair,
            }}
          >
            {(topic || fecha) && (
              <div
                className="mono"
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 6,
                  flexWrap: 'wrap',
                  fontSize: 9.5,
                  color: PALETTE.ink50,
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}
              >
                {topic && <span style={{ color: PALETTE.accent, fontWeight: 700 }}>{topic}</span>}
                {topic && fecha && <span aria-hidden="true">·</span>}
                {fecha && <span>{fecha}</span>}
              </div>
            )}
            <div
              style={{
                fontFamily: SERIF,
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: '-.015em',
                lineHeight: 1.22,
                marginBottom: 5,
              }}
            >
              <Link
                to={'/reportajes/' + (meta.slug || slug)}
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                {meta.titulo}
              </Link>
            </div>
            {meta.subtitulo && (
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  color: PALETTE.ink60,
                  lineHeight: 1.45,
                }}
              >
                {truncateAtWord(meta.subtitulo, SUMMARY_CHARS)}
              </p>
            )}
            {correcciones > 0 && (
              // Published corrections are disclosed here, not only inside the
              // pieza. A reader who never opens it should still know the record
              // was amended — the same commitment /hallazgos and /laboratorio
              // make with their "Bitácora de correcciones".
              <div style={{ marginTop: 7 }}>
                <span
                  className="mono"
                  style={{
                    // The column's established metadata-chip idiom (same shape
                    // as the LOREG and plazos-vencidos badges). As plain text it
                    // read as a second kicker competing with the topic line.
                    fontSize: 9,
                    color: PALETTE.amber,
                    background: 'rgba(180,83,9,.10)',
                    padding: '2px 6px',
                    borderRadius: 3,
                    letterSpacing: '.08em',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                  }}
                >
                  {correcciones} {correcciones === 1 ? 'corrección' : 'correcciones'} publicada
                  {correcciones === 1 ? '' : 's'}
                </span>
              </div>
            )}
          </div>
        )
      })}
      <div
        style={{
          fontFamily: MONO,
          fontSize: 10.5,
          color: PALETTE.ink60,
          letterSpacing: '.06em',
          marginTop: 4,
        }}
      >
        <Link
          to="/reportajes"
          style={{ color: PALETTE.civic, textDecoration: 'none', fontWeight: 600 }}
        >
          Todos los reportajes →
        </Link>
      </div>
    </div>
  )
}
