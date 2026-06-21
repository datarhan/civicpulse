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
          style={{ padding: '8px 10px', color: 'var(--ink60)', verticalAlign: 'top' }}
        >
          [{num}]
        </td>
        <td style={{ padding: '8px 10px', color: 'var(--ink80)', verticalAlign: 'top' }}>
          {src.url ? (
            <ExtLink
              href={src.url}
              onClick={(e) => e.stopPropagation()}
              style={{ color: 'var(--ink80)' }}
            >
              {src.title}
            </ExtLink>
          ) : (
            src.title
          )}
        </td>
        <td style={{ padding: '8px 10px', color: 'var(--ink60)', verticalAlign: 'top' }}>
          {src.publisher ?? '—'}
        </td>
        <td
          className="mono"
          style={{ padding: '8px 10px', color: 'var(--ink60)', verticalAlign: 'top' }}
        >
          {src.publishedAt ?? '—'}
        </td>
        <td
          className="mono"
          style={{ padding: '8px 10px', color: 'var(--ink60)', verticalAlign: 'top' }}
        >
          {src.retrievedAt?.slice(0, 10) ?? '—'}
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
              style={{ color: 'var(--ink60)', fontSize: 11.5 }}
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
      {open && src.excerpt && (
        <tr>
          <td colSpan={7} style={{ padding: '4px 16px 12px 38px', background: 'var(--soft)' }}>
            <span style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--ink60)' }}>
              «{src.excerpt}»
            </span>
          </td>
        </tr>
      )}
    </>
  )
}
