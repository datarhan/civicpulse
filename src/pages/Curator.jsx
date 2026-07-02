/**
 * Curator dashboard — dev-only, never in production builds. Composition
 * root; the queue, promote-form, and voice-id sections live in ./curator/*.
 * Wires through the local Vite middleware at /api/curator/* (see
 * vite-curator-plugin.js).
 */
import { useState } from 'react'
import { Card, SectionHead } from '../components/Primitives'
import {
  SectionErrorBoundary,
  QUEUE_URL,
  ISSUES_URL,
  useJsonResource,
  callCurator,
  callCommit,
  shortDate,
} from './curator/shared'
import { PromoteForm } from './curator/PromoteForm'
import { ContradichoBundleRow, IssueRow } from './curator/queues'
import { PromiseDraftRow } from './curator/promise-queue'
import { VoiceEnrollmentSection, VoiceIDAssignmentsSection } from './curator/voice'

export default function Curator() {
  const queue = useJsonResource(QUEUE_URL)
  const issues = useJsonResource(ISSUES_URL)
  const promiseQueue = useJsonResource('/api/curator/promise-queue')
  const [openBundle, setOpenBundle] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshResult, setRefreshResult] = useState(null)

  const refreshQueue = async () => {
    setRefreshing(true)
    setRefreshResult(null)
    const r = await callCurator('refresh-curate-queue')
    setRefreshing(false)
    setRefreshResult(r)
    if (r.ok && r.exitCode === 0) {
      queue.refresh()
    }
  }

  const refreshIssues = async () => {
    setRefreshing(true)
    setRefreshResult(null)
    const r = await callCurator('refresh-gh-issues')
    setRefreshing(false)
    setRefreshResult(r)
    if (r.ok && r.exitCode === 0) {
      issues.refresh()
    }
  }

  const queueBundles = queue.data?.bundles ?? []
  const archivedBundles = queue.data?.archived ?? []
  const ghIssues = issues.data?.issues ?? []
  const [showArchived, setShowArchived] = useState(false)
  const [unarchiving, setUnarchiving] = useState(null)
  const [unarchiveError, setUnarchiveError] = useState(null)

  const onUnarchive = async (bundle) => {
    setUnarchiving(`${bundle.plenoId}/${bundle.topic}`)
    setUnarchiveError(null)
    const r = await callCurator('unarchive-bundle', {
      plenoId: bundle.plenoId,
      topic: bundle.topic,
    })
    if (!r.ok || r.exitCode !== 0) {
      setUnarchiveError(r.error || r.stderr?.slice(0, 200) || `unarchive exited ${r.exitCode}`)
      setUnarchiving(null)
      return
    }
    await callCurator('refresh-curate-queue', {})
    queue.refresh()
    setUnarchiving(null)
  }

  // Promise auto-curator review queue. Fast-track drafts ("listo para
  // publicar") float to the top so the curator sees the ready ones first.
  const promiseDrafts = [...(promiseQueue.data?.drafts ?? [])].sort(
    (a, b) => (b.decision === 'fast-track' ? 1 : 0) - (a.decision === 'fast-track' ? 1 : 0),
  )
  const [busyId, setBusyId] = useState(null)
  const [promiseError, setPromiseError] = useState(null)

  const onApprovePromise = async (draftId) => {
    setBusyId(draftId)
    setPromiseError(null)
    const r = await callCurator('apply-promise-draft', { draftId })
    if (!r.ok || r.exitCode !== 0) {
      setPromiseError(r.error || r.stderr?.slice(0, 200) || `apply exited ${r.exitCode}`)
      setBusyId(null)
      return
    }
    const commit = await callCommit(`data: publish promise ${draftId}`, [
      'public/data/promises.json',
    ])
    if (!commit.ok) {
      setPromiseError(`published, but commit failed: ${commit.error}`)
      setBusyId(null)
      promiseQueue.refresh()
      return
    }
    setBusyId(null)
    promiseQueue.refresh()
  }

  const onRejectPromise = async (draftId) => {
    setBusyId(draftId)
    setPromiseError(null)
    const r = await callCurator('reject-promise-draft', { draftId })
    if (!r.ok || r.exitCode !== 0) {
      setPromiseError(r.error || r.stderr?.slice(0, 200) || `reject exited ${r.exitCode}`)
      setBusyId(null)
      return
    }
    setBusyId(null)
    promiseQueue.refresh()
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Curator</h1>
        <p style={{ fontSize: 12, color: 'var(--ink60)', marginTop: 4 }}>
          Dev-only dashboard. Surfaces queues that need human review and runs the existing CLIs
          locally via the Vite middleware. Mutations land in the same JSON files the production
          scrapers write — git history is the audit trail. Production builds tree-shake this route
          out.
        </p>
      </div>

      <Card style={{ padding: 16, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SectionHead title="Contradicho queue" />
          <span
            className="mono"
            style={{ fontSize: 10.5, color: 'var(--ink50)', marginLeft: 'auto' }}
          >
            {queue.data
              ? `${queueBundles.length} live · ${archivedBundles.length} archived · generated ${shortDate(queue.data.generatedAt)}`
              : ''}
          </span>
          {archivedBundles.length > 0 && (
            <button
              onClick={() => setShowArchived((v) => !v)}
              style={{
                padding: '5px 10px',
                fontSize: 11,
                border: '1px solid var(--border2)',
                background: showArchived ? 'var(--soft)' : 'var(--paper)',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              {showArchived ? 'Hide archived' : `Show archived (${archivedBundles.length})`}
            </button>
          )}
          <button
            onClick={refreshQueue}
            disabled={refreshing}
            style={{
              padding: '5px 10px',
              fontSize: 11,
              border: '1px solid var(--border2)',
              background: 'var(--paper)',
              borderRadius: 6,
              cursor: refreshing ? 'not-allowed' : 'pointer',
            }}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        {queue.loading && <p style={{ fontSize: 12 }}>Loading…</p>}
        {queue.error && (
          <p style={{ fontSize: 12, color: 'var(--crit-ink)' }}>
            Cannot load {QUEUE_URL}: {queue.error}. Run <code>npm run refresh:curate-queue</code> to
            generate it.
          </p>
        )}
        {!queue.loading && !queue.error && queueBundles.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--ink60)' }}>
            No quarantined bundles. The verifier didn't surface any contradicho claims that passed
            the auto-curate gates this run.
          </p>
        )}
        {queueBundles.map((b) => (
          <ContradichoBundleRow key={`${b.plenoId}/${b.topic}`} bundle={b} onOpen={setOpenBundle} />
        ))}
        {showArchived && archivedBundles.length > 0 && (
          <div
            style={{
              marginTop: 14,
              paddingTop: 12,
              borderTop: '1px dashed var(--border2)',
            }}
          >
            <div
              className="mono"
              style={{
                fontSize: 10.5,
                color: 'var(--ink50)',
                textTransform: 'uppercase',
                letterSpacing: '.08em',
                marginBottom: 8,
              }}
            >
              Archived — reviewed and dismissed
            </div>
            {unarchiveError && (
              <div
                style={{
                  padding: '6px 10px',
                  marginBottom: 8,
                  border: '1px solid var(--crit-ink)',
                  borderRadius: 6,
                  fontSize: 11.5,
                  color: 'var(--crit-ink)',
                  background: 'var(--soft)',
                }}
              >
                Un-archive failed: {unarchiveError}
              </div>
            )}
            {archivedBundles.map((b) => (
              <div
                key={`${b.plenoId}/${b.topic}`}
                style={{
                  padding: '10px 12px',
                  border: '1px solid var(--border2)',
                  borderRadius: 6,
                  marginBottom: 6,
                  background: 'var(--soft)',
                  opacity: 0.85,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 4,
                    flexWrap: 'wrap',
                  }}
                >
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink50)' }}>
                    {b.plenoId} · {b.topic} · score={b.score?.toFixed?.(2) ?? b.score}
                  </span>
                  {b.archive?.archivedAt && (
                    <span className="mono" style={{ fontSize: 10, color: 'var(--ink50)' }}>
                      archived {shortDate(b.archive.archivedAt)}
                    </span>
                  )}
                  <div style={{ flex: 1 }} />
                  <button
                    onClick={() => onUnarchive(b)}
                    disabled={unarchiving === `${b.plenoId}/${b.topic}`}
                    style={{
                      padding: '4px 10px',
                      fontSize: 11,
                      border: '1px solid var(--border2)',
                      background: 'var(--paper)',
                      borderRadius: 4,
                      cursor: unarchiving === `${b.plenoId}/${b.topic}` ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {unarchiving === `${b.plenoId}/${b.topic}` ? 'Restoring…' : 'Un-archive'}
                  </button>
                </div>
                <div style={{ fontSize: 12.5 }}>{b.plenoTitle}</div>
                {b.archive?.reason && (
                  <div style={{ fontSize: 11.5, color: 'var(--ink60)', marginTop: 4 }}>
                    Reason: {b.archive.reason}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card style={{ padding: 16, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SectionHead title="Right-of-reply (GH issues)" />
          <span
            className="mono"
            style={{ fontSize: 10.5, color: 'var(--ink50)', marginLeft: 'auto' }}
          >
            {issues.data
              ? `${ghIssues.length} open · generated ${shortDate(issues.data.generatedAt)}`
              : ''}
          </span>
          <button
            onClick={refreshIssues}
            disabled={refreshing}
            style={{
              padding: '5px 10px',
              fontSize: 11,
              border: '1px solid var(--border2)',
              background: 'var(--paper)',
              borderRadius: 6,
              cursor: refreshing ? 'not-allowed' : 'pointer',
            }}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        {issues.loading && <p style={{ fontSize: 12 }}>Loading…</p>}
        {issues.error && (
          <p style={{ fontSize: 12, color: 'var(--crit-ink)' }}>
            Cannot load {ISSUES_URL}: {issues.error}. Run <code>npm run refresh:gh-issues</code> to
            generate it.
          </p>
        )}
        {issues.data?.error && (
          <p style={{ fontSize: 12, color: 'var(--ink60)', lineHeight: 1.5 }}>
            <span style={{ color: 'var(--warn-ink, var(--ink))' }}>Refresh skipped.</span>{' '}
            {issues.data.error.includes('GITHUB_TOKEN')
              ? 'The repository is private — set GITHUB_TOKEN in .env (a fine-grained PAT with read access is enough) and re-run npm run refresh:gh-issues. Right-of-reply still works as a curator workflow; replies arrive through editorial contact and are applied with `npm run finding-reply`.'
              : issues.data.error}
          </p>
        )}
        {!issues.loading && !issues.error && ghIssues.length === 0 && !issues.data?.error && (
          <p style={{ fontSize: 12, color: 'var(--ink60)' }}>
            No open <code>derecho-replica</code> issues.
          </p>
        )}
        {ghIssues.map((i) => (
          <IssueRow key={i.number} issue={i} />
        ))}
      </Card>

      <Card style={{ padding: 16, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SectionHead title="Promesas · cola de revisión" />
          <span
            className="mono"
            style={{ fontSize: 10.5, color: 'var(--ink50)', marginLeft: 'auto' }}
          >
            {promiseQueue.data
              ? `${promiseDrafts.length} en cola · ${promiseQueue.data.archivedCount ?? 0} archivadas · generada ${shortDate(promiseQueue.data.generatedAt)}`
              : ''}
          </span>
          <button
            onClick={() => promiseQueue.refresh()}
            disabled={promiseQueue.loading}
            style={{
              padding: '5px 10px',
              fontSize: 11,
              border: '1px solid var(--border2)',
              background: 'var(--paper)',
              borderRadius: 6,
              cursor: promiseQueue.loading ? 'not-allowed' : 'pointer',
            }}
          >
            {promiseQueue.loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        {promiseQueue.loading && <p style={{ fontSize: 12 }}>Loading…</p>}
        {promiseQueue.error && (
          <p style={{ fontSize: 12, color: 'var(--crit-ink)' }}>
            Cannot load the promise queue: {promiseQueue.error}. The endpoint is dev-only — run{' '}
            <code>npm run auto-curate-promises</code> to populate it.
          </p>
        )}
        {promiseError && (
          <div
            style={{
              padding: '6px 10px',
              margin: '8px 0',
              border: '1px solid var(--crit-ink)',
              borderRadius: 6,
              fontSize: 11.5,
              color: 'var(--crit-ink)',
              background: 'var(--soft)',
            }}
          >
            {promiseError}
          </div>
        )}
        {!promiseQueue.loading && !promiseQueue.error && promiseDrafts.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--ink60)' }}>La cola está vacía.</p>
        )}
        {promiseDrafts.map((d) => (
          <PromiseDraftRow
            key={d.draftId}
            draft={d}
            busy={busyId === d.draftId}
            onApprove={onApprovePromise}
            onReject={onRejectPromise}
          />
        ))}
      </Card>

      <SectionErrorBoundary label="Voice ID enrollment">
        <VoiceEnrollmentSection />
      </SectionErrorBoundary>

      <SectionErrorBoundary label="Voice ID assignments">
        <VoiceIDAssignmentsSection />
      </SectionErrorBoundary>

      {refreshResult && !refreshResult.ok && (
        <Card style={{ padding: 12, marginBottom: 18, borderColor: 'var(--crit-ink)' }}>
          <div className="mono" style={{ fontSize: 11, color: 'var(--crit-ink)' }}>
            Refresh failed: {refreshResult.error}
          </div>
        </Card>
      )}

      {openBundle && (
        <PromoteForm
          bundle={openBundle}
          onClose={() => setOpenBundle(null)}
          onCompleted={() => queue.refresh()}
        />
      )}
    </div>
  )
}
