// Journalist UI — citation pills + hover popover + the source-index helper.
import { useState } from 'react'

// ─── Source-index helper ─────────────────────────────────────────────────

const SOURCE_INDEX = (sources) => {
  const m = new Map()
  sources.forEach((s, i) => m.set(s.id, { src: s, num: i + 1 }))
  return m
}
export { SOURCE_INDEX }

// ─── Citation pill with hover popover ────────────────────────────────────

export function CitationPills({ ids, sourceMap }) {
  if (!ids || ids.length === 0) return null
  return (
    <span style={{ display: 'inline-flex', gap: 4, marginLeft: 6, verticalAlign: 'baseline' }}>
      {ids.map((id) => {
        const hit = sourceMap.get(id)
        if (!hit) return null
        return <CitationPopover key={id} num={hit.num} src={hit.src} />
      })}
    </span>
  )
}

export function CitationPopover({ num, src }) {
  const [open, setOpen] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <a
        href={`#src-${num}`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        style={{
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          textDecoration: 'none',
          padding: '1px 6px',
          borderRadius: 'var(--r-pill)',
          background: 'var(--soft)',
          fontVariantNumeric: 'tabular-nums',
        }}
        title={src.title}
      >
        [{num}]
      </a>
      {open && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            zIndex: 50,
            bottom: 'calc(100% + 6px)',
            left: 0,
            minWidth: 260,
            maxWidth: 360,
            padding: 10,
            borderRadius: 'var(--r-input)',
            border: '1px solid var(--border)',
            background: 'var(--paper)',
            color: 'var(--ink70)',
            fontSize: 'var(--fs-aux)',
            lineHeight: 1.5,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{src.title}</div>
          {src.publisher && (
            <div style={{ marginTop: 2, color: 'var(--ink50)' }}>{src.publisher}</div>
          )}
          {src.excerpt && (
            <div
              style={{
                marginTop: 6,
                paddingTop: 6,
                borderTop: '1px solid var(--border)',
                color: 'var(--ink70)',
                fontWeight: 500,
                maxWidth: '68ch',
              }}
            >
              «{src.excerpt.slice(0, 220)}»
            </div>
          )}
        </span>
      )}
    </span>
  )
}
