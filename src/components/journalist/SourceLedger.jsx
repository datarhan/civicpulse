// Journalist UI — the full-width sortable source ledger + per-row expander.
import { useMemo, useState } from 'react'
import { Card, ExtLink, Pill, SectionHead } from '../Primitives'
import { CITATION_KIND_LABEL, CITATION_TRUST_TONE } from '../../hooks/useJournalistReports'

// ─── Source ledger (sortable, full-width) ────────────────────────────────

export function SourceLedger({ sources }) {
  const [sort, setSort] = useState({ col: 'num', dir: 'asc' })
  const numByid = useMemo(() => {
    const m = new Map()
    sources.forEach((s, i) => m.set(s.id, i + 1))
    return m
  }, [sources])
  const sorted = useMemo(() => {
    const rows = sources.map((s) => ({ s, num: numByid.get(s.id) ?? 0 }))
    const dir = sort.dir === 'asc' ? 1 : -1
    rows.sort((a, b) => {
      switch (sort.col) {
        case 'title':
          return dir * (a.s.title || '').localeCompare(b.s.title || '')
        case 'publisher':
          return dir * (a.s.publisher || '').localeCompare(b.s.publisher || '')
        case 'date':
          return dir * (a.s.publishedAt || '').localeCompare(b.s.publishedAt || '')
        case 'retrieved':
          return dir * (a.s.retrievedAt || '').localeCompare(b.s.retrievedAt || '')
        case 'trust':
          return dir * (a.s.trust || '').localeCompare(b.s.trust || '')
        default:
          return dir * (a.num - b.num)
      }
    })
    return rows
  }, [sources, sort, numByid])
  const onHeaderClick = (col) =>
    setSort((prev) =>
      prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' },
    )
  const header = (label, col) => (
    <th
      onClick={() => onHeaderClick(col)}
      style={{
        textAlign: 'left',
        padding: '8px 10px',
        cursor: 'pointer',
        userSelect: 'none',
        color: 'var(--ink50)',
        fontSize: 10.5,
        textTransform: 'uppercase',
        letterSpacing: '.06em',
        borderBottom: '1px solid var(--border)',
        background: 'var(--soft)',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
      {sort.col === col && <span style={{ marginLeft: 4 }}>{sort.dir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  )
  return (
    <Card>
      <SectionHead title="Fuentes consultadas" />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 720 }}>
          <thead>
            <tr>
              {header('#', 'num')}
              {header('Título', 'title')}
              {header('Editor', 'publisher')}
              {header('Publicado', 'date')}
              {header('Recuperado', 'retrieved')}
              {header('Confianza', 'trust')}
              <th
                style={{
                  textAlign: 'left',
                  padding: '8px 10px',
                  color: 'var(--ink50)',
                  fontSize: 10.5,
                  textTransform: 'uppercase',
                  letterSpacing: '.06em',
                  borderBottom: '1px solid var(--border)',
                  background: 'var(--soft)',
                }}
              >
                Archivo
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ s, num }) => (
              <SourceRow key={s.id} src={s} num={num} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function SourceRow({ src, num }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <tr
        id={`src-${num}`}
        onClick={() => setOpen((v) => !v)}
        style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
      >
        <td
          className="mono"
          style={{ padding: '8px 10px', color: 'var(--ink50)', verticalAlign: 'top' }}
        >
          [{num}]
        </td>
        <td style={{ padding: '8px 10px', color: 'var(--ink70)', verticalAlign: 'top' }}>
          {src.url ? (
            <ExtLink
              href={src.url}
              onClick={(e) => e.stopPropagation()}
              style={{ color: 'var(--ink70)' }}
            >
              {src.title}
            </ExtLink>
          ) : (
            src.title
          )}
        </td>
        <td style={{ padding: '8px 10px', color: 'var(--ink50)', verticalAlign: 'top' }}>
          {src.publisher ?? '—'}
        </td>
        <td
          className="mono"
          style={{ padding: '8px 10px', color: 'var(--ink50)', verticalAlign: 'top' }}
        >
          {src.publishedAt ?? '—'}
        </td>
        <td
          className="mono"
          style={{ padding: '8px 10px', color: 'var(--ink50)', verticalAlign: 'top' }}
        >
          {src.retrievedAt?.slice(0, 10) ?? '—'}
          {/* The date is when we read the DOCUMENT; the link above may point
              somewhere else if the publisher has since moved it. Saying
              "recuperado el X" beside a URL that did not serve it on X would be
              a small lie, and the ledger is the one part of the page whose
              entire job is being checkable. */}
          {src.previousUrl && (
            <div
              style={{ fontSize: '0.72rem', color: 'var(--ink50)', marginTop: 2, lineHeight: 1.3 }}
            >
              reubicada {src.relocatedAt?.slice(0, 10) ?? ''}
            </div>
          )}
        </td>
        <td style={{ padding: '8px 10px', verticalAlign: 'top' }}>
          <Pill tone={CITATION_TRUST_TONE[src.trust] || 'ghost'} size="sm">
            {CITATION_KIND_LABEL[src.kind] || src.kind}
          </Pill>
        </td>
        <td style={{ padding: '8px 10px', verticalAlign: 'top' }}>
          {src.archiveUrl ? (
            <ExtLink
              href={src.archiveUrl}
              onClick={(e) => e.stopPropagation()}
              style={{ color: 'var(--ink50)', fontSize: 11.5 }}
            >
              Wayback ↗
            </ExtLink>
          ) : src.localPath ? (
            <span className="mono" style={{ color: 'var(--ink50)', fontSize: 10.5 }}>
              local
            </span>
          ) : (
            <span style={{ color: 'var(--ink50)' }}>—</span>
          )}
        </td>
      </tr>
      {open && (src.excerpt || src.previousUrl) && (
        <tr>
          <td colSpan={7} style={{ padding: '4px 16px 12px 38px', background: 'var(--soft)' }}>
            {src.excerpt && (
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--ink70)',
                  paddingLeft: 10,
                  borderLeft: '3px solid var(--civic)',
                  display: 'inline-block',
                  maxWidth: '68ch',
                }}
              >
                «{src.excerpt}»
              </span>
            )}
            {/* Naming the old address is what makes the relocation checkable
                rather than something the reader has to take on trust. The
                excerpt above was verified verbatim against the document at the
                NEW url before the pointer was moved. */}
            {src.previousUrl && (
              <div
                className="mono"
                style={{ fontSize: 11, color: 'var(--ink50)', marginTop: src.excerpt ? 8 : 0 }}
              >
                Publicada originalmente en {src.previousUrl} — el publicador la movió; el extracto
                citado se verificó literalmente en la dirección actual.
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
