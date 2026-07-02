import { ExtLink, Pill } from '../../components/Primitives'
import { PartyChip, shortDate } from './shared'

const DECISION_TONE = {
  'auto-publish': 'intel',
  'fast-track': 'warn',
  queue: 'neutral',
}

/**
 * One row in the promise auto-curator review queue. Mirrors
 * ContradichoBundleRow's bordered-card style: a mono meta line
 * (party chip + confidence + grounding + decision pills), the proposed
 * title, a verbatim quote snippet, the source link, and the two curator
 * actions. Not a click-through — the buttons drive the apply CLI.
 */
function PromiseDraftRow({ draft, onApprove, onReject, busy }) {
  const p = draft.proposed ?? {}
  const grounded = Boolean(draft.grounding?.grounded)
  const decision = draft.decision
  return (
    <div
      style={{
        padding: '12px 14px',
        border: '1px solid var(--border2)',
        borderRadius: 8,
        marginBottom: 10,
        background: 'var(--paper)',
      }}
    >
      <div
        style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}
      >
        <PartyChip party={p.party} />
        {p.madeAt && (
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink50)' }}>
            {shortDate(p.madeAt)}
          </span>
        )}
        <Pill tone={grounded ? 'ok' : 'warn'}>{grounded ? 'anclada' : 'sin anclar'}</Pill>
        {decision && <Pill tone={DECISION_TONE[decision] ?? 'neutral'}>{decision}</Pill>}
        <span className="mono" style={{ marginLeft: 'auto', fontSize: 11 }}>
          conf {Number(draft.confidence ?? 0).toFixed(2)}
        </span>
      </div>
      <div className="mono" style={{ fontSize: 10, color: 'var(--ink50)', marginBottom: 4 }}>
        {draft.draftId}
      </div>
      <div style={{ fontSize: 13.5, marginBottom: 4 }}>{p.title}</div>
      {p.quote && (
        <div style={{ fontSize: 12, color: 'var(--ink60)', lineHeight: 1.4, marginBottom: 6 }}>
          «{p.quote.slice(0, 180)}…»
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {p.source?.url && (
          <ExtLink
            href={p.source.url}
            style={{ fontSize: 11.5, color: 'var(--civic)', textDecoration: 'none' }}
          >
            Fuente: {p.source.publisher || 'origen'} →
          </ExtLink>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            onClick={() => onApprove(draft.draftId)}
            disabled={busy}
            style={{
              padding: '5px 12px',
              fontSize: 11.5,
              fontWeight: 600,
              border: '1px solid var(--border)',
              background: 'var(--ink)',
              color: 'var(--paper)',
              borderRadius: 6,
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? 'Publicando…' : 'Aprobar y publicar'}
          </button>
          <button
            onClick={() => onReject(draft.draftId)}
            disabled={busy}
            style={{
              padding: '5px 12px',
              fontSize: 11.5,
              border: '1px solid var(--border2)',
              background: 'var(--paper)',
              borderRadius: 6,
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}
          >
            Rechazar
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * One row in the AUTO-PUBLISHED promise review queue. Distinct from
 * PromiseDraftRow (not-yet-published drafts from the local queue): this
 * renders a promise ALREADY published to promises.json whose
 * `autoPublished.reviewState` is still 'pending-review'. The two actions
 * drive the apply-promise-draft CLI — "Marcar revisada" clears the public
 * "revisión pendiente" badge; "Retractar" tombstones the promise into the
 * archive (destructive, styled with the crit tone).
 */
function PromisePendingRow({ promise, onRetract, onMarkReviewed, busy }) {
  const auto = promise.autoPublished ?? {}
  return (
    <div
      style={{
        padding: '12px 14px',
        border: '1px solid var(--border2)',
        borderRadius: 8,
        marginBottom: 10,
        background: 'var(--paper)',
      }}
    >
      <div
        style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}
      >
        <PartyChip party={promise.party} />
        <Pill tone="warn">revisión pendiente</Pill>
        <span className="mono" style={{ marginLeft: 'auto', fontSize: 11 }}>
          conf {Number(auto.confidence ?? 0).toFixed(2)}
        </span>
      </div>
      <div className="mono" style={{ fontSize: 10, color: 'var(--ink50)', marginBottom: 4 }}>
        auto-publicada {shortDate(auto.at)}
        {auto.by ? ` · ${auto.by}` : ''}
      </div>
      <div style={{ fontSize: 13.5, marginBottom: 4 }}>{promise.title}</div>
      {promise.quote && (
        <div style={{ fontSize: 12, color: 'var(--ink60)', lineHeight: 1.4, marginBottom: 6 }}>
          «{promise.quote.slice(0, 180)}…»
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {promise.source?.url && (
          <ExtLink
            href={promise.source.url}
            style={{ fontSize: 11.5, color: 'var(--civic)', textDecoration: 'none' }}
          >
            Fuente: {promise.source.publisher || 'origen'} →
          </ExtLink>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            onClick={() => onMarkReviewed(promise.id)}
            disabled={busy}
            style={{
              padding: '5px 12px',
              fontSize: 11.5,
              fontWeight: 600,
              border: '1px solid var(--border)',
              background: 'var(--ink)',
              color: 'var(--paper)',
              borderRadius: 6,
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? 'Procesando…' : 'Marcar revisada'}
          </button>
          <button
            onClick={() => onRetract(promise.id)}
            disabled={busy}
            style={{
              padding: '5px 12px',
              fontSize: 11.5,
              border: '1px solid var(--crit)',
              background: 'var(--paper)',
              color: 'var(--crit-ink)',
              borderRadius: 6,
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}
          >
            Retractar
          </button>
        </div>
      </div>
    </div>
  )
}

export { PromiseDraftRow, PromisePendingRow }
