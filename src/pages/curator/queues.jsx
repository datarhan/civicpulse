import { ExtLink, Pill } from '../../components/Primitives'
import { VerdictPill, shortDate } from './shared'

function ContradichoBundleRow({ bundle, onOpen }) {
  return (
    <div
      onClick={() => onOpen(bundle)}
      style={{
        padding: '12px 14px',
        border: '1px solid var(--border2)',
        borderRadius: 'var(--r-input)',
        marginBottom: 10,
        cursor: 'pointer',
        background: 'var(--paper)',
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink50)' }}>
          {bundle.plenoId} · {shortDate(bundle.plenoDate)}
        </span>
        <Pill tone="warn">{bundle.topic}</Pill>
        {bundle.blocs.map((b) => (
          <span
            key={b}
            className="mono"
            style={{
              fontSize: 10,
              padding: '1px 6px',
              background: 'var(--soft)',
              borderRadius: 'var(--r-input)',
            }}
          >
            {b}
          </span>
        ))}
        <span style={{ marginLeft: 'auto' }} className="mono">
          score={bundle.score.toFixed(2)}
        </span>
      </div>
      <div style={{ fontSize: 13.5, marginBottom: 4 }}>{bundle.plenoTitle}</div>
      {bundle.quotes[0] && (
        <div style={{ fontSize: 12, color: 'var(--ink50)', lineHeight: 1.4 }}>
          <VerdictPill verdict={bundle.quotes[0].verdict} />{' '}
          <span style={{ marginLeft: 6 }}>«{bundle.quotes[0].verbatim.slice(0, 180)}…»</span>
        </div>
      )}
    </div>
  )
}

function IssueRow({ issue }) {
  return (
    <ExtLink
      href={issue.url}
      style={{
        display: 'block',
        padding: '10px 14px',
        border: '1px solid var(--border2)',
        borderRadius: 'var(--r-input)',
        marginBottom: 8,
        textDecoration: 'none',
        color: 'inherit',
        background: 'var(--paper)',
      }}
    >
      <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink50)', marginBottom: 4 }}>
        #{issue.number} · {shortDate(issue.createdAt)} · @{issue.authorLogin}
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{issue.title}</div>
      {issue.bodyExcerpt && (
        <div style={{ fontSize: 12, color: 'var(--ink50)', marginTop: 4, lineHeight: 1.4 }}>
          {issue.bodyExcerpt.slice(0, 200)}…
        </div>
      )}
    </ExtLink>
  )
}

export { ContradichoBundleRow, IssueRow }
