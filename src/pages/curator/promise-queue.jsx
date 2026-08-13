import { ExtLink, Pill } from '../../components/Primitives'
import { PartyChip, shortDate } from './shared'

const DECISION_TONE = {
  'auto-publish': 'intel',
  'fast-track': 'warn',
  queue: 'neutral',
}

const STATUS_TONE = {
  documentada: 'neutral',
  'en-verificacion': 'neutral',
  'en-progreso': 'intel',
  parcial: 'warn',
  cumplida: 'ok',
}

/**
 * A status-change draft advances an EXISTING promise (documentada →
 * en-progreso/parcial/cumplida). It carries no `proposed.*` — instead a
 * promiseId, current→proposed statuses, and a single grounded evidence row.
 * Same card chrome + the same two actions as PromiseDraftRow.
 */
function StatusChangeDraftRow({ draft, onApprove, onReject, busy }) {
  const ev = draft.evidence ?? {}
  const grounded = Boolean(draft.grounding?.grounded)
  return (
    <div
      style={{
        padding: '12px 14px',
        border: '1px solid var(--border2)',
        borderRadius: 'var(--r-input)',
        marginBottom: 10,
        background: 'var(--paper)',
      }}
    >
      <div
        style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}
      >
        <Pill tone="intel">cambio de estado</Pill>
        <Pill tone={STATUS_TONE[draft.currentStatus] ?? 'neutral'}>{draft.currentStatus}</Pill>
        <span style={{ color: 'var(--ink50)' }}>→</span>
        <Pill tone={STATUS_TONE[draft.proposedStatus] ?? 'intel'}>{draft.proposedStatus}</Pill>
        <Pill tone={grounded ? 'ok' : 'warn'}>{grounded ? 'anclada' : 'sin anclar'}</Pill>
        {draft.decision && (
          <Pill tone={DECISION_TONE[draft.decision] ?? 'neutral'}>{draft.decision}</Pill>
        )}
        <span className="mono" style={{ marginLeft: 'auto', fontSize: 'var(--fs-micro)' }}>
          conf {Number(draft.confidence ?? 0).toFixed(2)}
        </span>
      </div>
      <div
        className="mono"
        style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginBottom: 4 }}
      >
        {draft.draftId}
      </div>
      <div style={{ fontSize: 'var(--fs-aux)', marginBottom: 4 }}>
        Promesa: <span className="mono">{draft.promiseId}</span>
      </div>
      {ev.quote && (
        <div
          style={{
            fontSize: 'var(--fs-meta)',
            color: 'var(--ink50)',
            lineHeight: 1.4,
            marginBottom: 6,
          }}
        >
          «{String(ev.quote).slice(0, 180)}…»
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {ev.url && (
          <ExtLink
            href={ev.url}
            style={{ fontSize: 'var(--fs-micro)', color: 'var(--civic)', textDecoration: 'none' }}
          >
            Evidencia: {ev.publisher || ev.kind || 'fuente'} →
          </ExtLink>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            onClick={() => onApprove(draft.draftId)}
            disabled={busy}
            style={{
              padding: '5px 12px',
              fontSize: 'var(--fs-micro)',
              fontWeight: 600,
              border: '1px solid var(--border)',
              background: 'var(--ink)',
              color: 'var(--paper)',
              borderRadius: 'var(--r-input)',
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? 'Aplicando…' : 'Aprobar y aplicar'}
          </button>
          <button
            onClick={() => onReject(draft.draftId)}
            disabled={busy}
            style={{
              padding: '5px 12px',
              fontSize: 'var(--fs-micro)',
              border: '1px solid var(--border2)',
              background: 'var(--paper)',
              borderRadius: 'var(--r-input)',
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
 * One row in the promise auto-curator review queue. Mirrors
 * ContradichoBundleRow's bordered-card style: a mono meta line
 * (party chip + confidence + grounding + decision pills), the proposed
 * title, a verbatim quote snippet, the source link, and the two curator
 * actions. Not a click-through — the buttons drive the apply CLI.
 */
function PromiseDraftRow({ draft, onApprove, onReject, busy }) {
  if (draft.kind === 'status-change') {
    return (
      <StatusChangeDraftRow draft={draft} onApprove={onApprove} onReject={onReject} busy={busy} />
    )
  }
  const p = draft.proposed ?? {}
  const grounded = Boolean(draft.grounding?.grounded)
  const decision = draft.decision
  return (
    <div
      style={{
        padding: '12px 14px',
        border: '1px solid var(--border2)',
        borderRadius: 'var(--r-input)',
        marginBottom: 10,
        background: 'var(--paper)',
      }}
    >
      <div
        style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}
      >
        <PartyChip party={p.party} />
        {p.madeAt && (
          <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
            {shortDate(p.madeAt)}
          </span>
        )}
        <Pill tone={grounded ? 'ok' : 'warn'}>{grounded ? 'anclada' : 'sin anclar'}</Pill>
        {decision && <Pill tone={DECISION_TONE[decision] ?? 'neutral'}>{decision}</Pill>}
        <span className="mono" style={{ marginLeft: 'auto', fontSize: 'var(--fs-micro)' }}>
          conf {Number(draft.confidence ?? 0).toFixed(2)}
        </span>
      </div>
      <div
        className="mono"
        style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginBottom: 4 }}
      >
        {draft.draftId}
      </div>
      <div style={{ fontSize: 'var(--fs-aux)', marginBottom: 4 }}>{p.title}</div>
      {p.quote && (
        <div
          style={{
            fontSize: 'var(--fs-meta)',
            color: 'var(--ink50)',
            lineHeight: 1.4,
            marginBottom: 6,
          }}
        >
          «{p.quote.slice(0, 180)}…»
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {p.source?.url && (
          <ExtLink
            href={p.source.url}
            style={{ fontSize: 'var(--fs-micro)', color: 'var(--civic)', textDecoration: 'none' }}
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
              fontSize: 'var(--fs-micro)',
              fontWeight: 600,
              border: '1px solid var(--border)',
              background: 'var(--ink)',
              color: 'var(--paper)',
              borderRadius: 'var(--r-input)',
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
              fontSize: 'var(--fs-micro)',
              border: '1px solid var(--border2)',
              background: 'var(--paper)',
              borderRadius: 'var(--r-input)',
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
 * "revisión pendiente" badge; "Retractar" dispatches by kind: an
 * auto-created promise is deleted, while an auto-published STATUS CHANGE on a
 * pre-existing promise is REVERTED (status → priorStatus, appended evidence
 * dropped, curated promise preserved). Styled with the crit tone.
 */
function PromisePendingRow({ promise, onRetract, onMarkReviewed, busy }) {
  const auto = promise.autoPublished ?? {}
  return (
    <div
      style={{
        padding: '12px 14px',
        border: '1px solid var(--border2)',
        borderRadius: 'var(--r-input)',
        marginBottom: 10,
        background: 'var(--paper)',
      }}
    >
      <div
        style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}
      >
        <PartyChip party={promise.party} />
        <Pill tone="warn">revisión pendiente</Pill>
        <span className="mono" style={{ marginLeft: 'auto', fontSize: 'var(--fs-micro)' }}>
          conf {Number(auto.confidence ?? 0).toFixed(2)}
        </span>
      </div>
      <div
        className="mono"
        style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginBottom: 4 }}
      >
        auto-publicada {shortDate(auto.at)}
        {auto.by ? ` · ${auto.by}` : ''}
      </div>
      <div style={{ fontSize: 'var(--fs-aux)', marginBottom: 4 }}>{promise.title}</div>
      {promise.quote && (
        <div
          style={{
            fontSize: 'var(--fs-meta)',
            color: 'var(--ink50)',
            lineHeight: 1.4,
            marginBottom: 6,
          }}
        >
          «{promise.quote.slice(0, 180)}…»
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {promise.source?.url && (
          <ExtLink
            href={promise.source.url}
            style={{ fontSize: 'var(--fs-micro)', color: 'var(--civic)', textDecoration: 'none' }}
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
              fontSize: 'var(--fs-micro)',
              fontWeight: 600,
              border: '1px solid var(--border)',
              background: 'var(--ink)',
              color: 'var(--paper)',
              borderRadius: 'var(--r-input)',
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
              fontSize: 'var(--fs-micro)',
              border: '1px solid var(--crit)',
              background: 'var(--paper)',
              color: 'var(--crit-ink)',
              borderRadius: 'var(--r-input)',
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
