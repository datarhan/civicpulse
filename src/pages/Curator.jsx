/**
 * Curator dashboard — dev-only, never in production builds.
 *
 * Surfaces the queues that need human attention and exposes the
 * existing CLIs as buttons (instead of "copy/paste into terminal").
 *
 *   · Contradicho queue: bundles auto-curate quarantined. Curator
 *     reviews, types title + summary, clicks Promote, clicks Commit.
 *   · Right-of-reply: open GH issues with `derecho-replica` label.
 *
 * Wires through the local Vite middleware at /api/curator/*. The
 * middleware enforces an action allowlist + zod-validated args + an
 * argv-array `execFile` (no shell). See vite-curator-plugin.js.
 */
import { Component, useCallback, useEffect, useMemo, useState } from 'react'
import { Card, Pill, SectionHead } from '../components/Primitives'

// Tiny error boundary so a runtime crash in a single section can't
// take down the whole dashboard. Renders the error stack inline so
// a curator can copy/paste the bug into a report. Only used on the
// dev-only /curator route — production builds tree-shake this out.
class SectionErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, info: null }
  }
  static getDerivedStateFromError(error) {
    return { error, info: null }
  }
  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error(`[Curator section "${this.props.label}" crashed]`, error, info)
    this.setState({ error, info })
  }
  render() {
    if (this.state.error) {
      return (
        <Card style={{ padding: 12, marginBottom: 18, borderColor: 'var(--crit-ink)' }}>
          <div className="mono" style={{ fontSize: 11, color: 'var(--crit-ink)', marginBottom: 6 }}>
            ⚠ {this.props.label} crashed
          </div>
          <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', margin: 0 }}>
            {String(this.state.error?.stack || this.state.error || 'unknown error')}
          </pre>
        </Card>
      )
    }
    return this.props.children
  }
}

const QUEUE_URL = '/data/auto-curation-queue.json'
const ISSUES_URL = '/data/finding-response-issues.json'

function useJsonResource(url) {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  const refresh = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }))
    fetch(url, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.json()
      })
      .then((data) => setState({ loading: false, error: null, data }))
      .catch((err) => setState({ loading: false, error: err.message, data: null }))
  }, [url])
  useEffect(() => refresh(), [refresh])
  return { ...state, refresh }
}

async function callCurator(action, args = {}) {
  const res = await fetch('/api/curator/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, args }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    return {
      ok: false,
      error: json.error || `${res.status} ${res.statusText}`,
      issues: json.issues,
      raw: json,
    }
  }
  return { ok: true, ...json }
}

async function callCommit(message) {
  const res = await fetch('/api/curator/commit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok)
    return { ok: false, error: json.error || `${res.status} ${res.statusText}`, raw: json }
  return { ok: true, ...json }
}

function shortDate(iso) {
  if (!iso) return ''
  return iso.slice(0, 10)
}

function VerdictPill({ verdict }) {
  const tone =
    verdict === 'verificado'
      ? 'ok'
      : verdict === 'contradicho'
        ? 'crit'
        : verdict === 'parcial'
          ? 'warn'
          : 'neutral'
  return <Pill tone={tone}>{verdict}</Pill>
}

function PromoteForm({ bundle, onClose, onCompleted }) {
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [severity, setSeverity] = useState('notable')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [committing, setCommitting] = useState(false)
  const [commitResult, setCommitResult] = useState(null)
  const [drafting, setDrafting] = useState(false)
  const [draftError, setDraftError] = useState(null)
  // Curator-added evidence: ephemeral, lives in modal state only.
  const [evidence, setEvidence] = useState([])
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [fetchingEvidence, setFetchingEvidence] = useState(false)
  const [evidenceError, setEvidenceError] = useState(null)
  // Audio/video transcription jobs.
  const [mediaPath, setMediaPath] = useState('')
  const [mediaKind, setMediaKind] = useState('audio')
  const [transcribeJobs, setTranscribeJobs] = useState([])
  const [mediaError, setMediaError] = useState(null)
  // Archive UI.
  const [archiving, setArchiving] = useState(false)
  const [archiveReason, setArchiveReason] = useState('')
  const [showArchiveInput, setShowArchiveInput] = useState(false)
  const [archiveResult, setArchiveResult] = useState(null)

  const claimIds = bundle.quotes.map((q) => q.claimId)
  const titleValid = title.trim().length >= 10 && title.trim().length <= 200
  const summaryValid = summary.trim().length >= 40 && summary.trim().length <= 2000
  const ready = titleValid && summaryValid && claimIds.length > 0 && !running

  const addEvidence = async () => {
    const url = evidenceUrl.trim()
    if (!url) return
    if (evidence.length >= 10) {
      setEvidenceError('max 10 evidence entries per bundle')
      return
    }
    setFetchingEvidence(true)
    setEvidenceError(null)
    const r = await callCurator('fetch-url-evidence', { url })
    setFetchingEvidence(false)
    if (!r.ok || r.exitCode !== 0) {
      setEvidenceError(r.error || r.stderr?.slice(0, 400) || `fetch exited ${r.exitCode}`)
      return
    }
    const lines = (r.stdout || '').trim().split('\n').filter(Boolean)
    let parsed
    try {
      parsed = JSON.parse(lines[lines.length - 1] || '{}')
    } catch {
      setEvidenceError(`unexpected stdout: ${(r.stdout || '').slice(0, 200)}`)
      return
    }
    if (!parsed.snippet) {
      setEvidenceError('no snippet extracted')
      return
    }
    setEvidence((prev) => [
      ...prev,
      {
        kind: parsed.kind || 'url',
        sourceUrl: parsed.sourceUrl || url,
        title: parsed.title || '',
        snippet: parsed.snippet,
        // Default OFF: the curator opts in per-item to the URL/PDF
        // landing in corroboration[] on the published finding. This
        // is the libel-safe default — research-only URLs don't
        // accidentally become public citations.
        includeInCorroboration: false,
      },
    ])
    setEvidenceUrl('')
  }

  const removeEvidence = (idx) => {
    setEvidence((prev) => prev.filter((_, i) => i !== idx))
  }

  // ─── Audio/video transcription jobs ───────────────────────────────────
  // The Vite middleware accepts an absolute file path, validates it
  // (path traversal, magic-byte sniff, 500MB cap), then spawns a
  // detached runner that transcribes via Whisper. We poll the job
  // every 2s until it's done|failed|cancelled.
  const startTranscribeJob = async () => {
    const path = mediaPath.trim()
    if (!path) return
    setMediaError(null)
    const res = await fetch('/api/curator/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'transcribe-evidence',
        args: { filePath: path, expectedKind: mediaKind },
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setMediaError(data.error || `${res.status} ${res.statusText}`)
      return
    }
    setTranscribeJobs((prev) => [
      ...prev,
      {
        jobId: data.jobId,
        status: data.status,
        path,
        kind: mediaKind,
        sizeBytes: data.sizeBytes,
        progress: 'queued',
      },
    ])
    setMediaPath('')
  }

  const cancelTranscribeJob = async (jobId) => {
    await fetch(`/api/curator/jobs/${jobId}`, { method: 'DELETE' })
    // Poll loop below will pick up the new state on its next tick.
  }

  const dismissTranscribeJob = (jobId) => {
    setTranscribeJobs((prev) => prev.filter((j) => j.jobId !== jobId))
  }

  // Poll all in-flight jobs every 2s. When a job lands, drop it from
  // the list and append its result to the evidence list.
  useEffect(() => {
    const inflight = transcribeJobs.filter((j) => j.status === 'queued' || j.status === 'running')
    if (inflight.length === 0) return undefined
    const t = setInterval(async () => {
      for (const j of inflight) {
        try {
          const res = await fetch(`/api/curator/jobs/${j.jobId}`)
          if (!res.ok) continue
          const fresh = await res.json()
          setTranscribeJobs((prev) =>
            prev.map((p) =>
              p.jobId === j.jobId
                ? {
                    ...p,
                    status: fresh.status,
                    progress: fresh.progress || p.progress,
                    error: fresh.error,
                    result: fresh.result,
                  }
                : p,
            ),
          )
          if (fresh.status === 'done' && fresh.result) {
            setEvidence((prev) => [
              ...prev,
              {
                kind: 'transcript',
                sourceUrl: fresh.result.sourceUrl,
                title: fresh.result.title,
                snippet: fresh.result.snippet,
                fullTranscript: fresh.result.fullTranscript,
                includeInCorroboration: false,
              },
            ])
            // Drop the card after a short delay so the curator sees "done".
            setTimeout(() => dismissTranscribeJob(j.jobId), 1200)
          }
        } catch {
          /* network blip — try again on next tick */
        }
      }
    }, 2000)
    return () => clearInterval(t)
  }, [transcribeJobs])

  const toggleEvidenceCorroboration = (idx) => {
    setEvidence((prev) =>
      prev.map((e, i) =>
        i === idx ? { ...e, includeInCorroboration: !e.includeInCorroboration } : e,
      ),
    )
  }

  // Map modal evidence kind to FindingRef.kind (the public schema).
  const modalKindToCorroborationKind = (k) => {
    if (k === 'pdf') return 'document'
    if (k === 'transcript') return 'transcript'
    return 'press' // url + anything else
  }
  // Build the extraCorroboration payload from the checked items only.
  const corroborationPayload = evidence
    .filter((e) => e.includeInCorroboration && e.sourceUrl)
    .map((e) => ({
      kind: modalKindToCorroborationKind(e.kind),
      ref: e.sourceUrl,
      // Schema cap is 240 chars; truncate cleanly.
      snippet:
        (e.title ? `${e.title} — ` : '') + e.snippet.replace(/\s+/g, ' ').trim().slice(0, 240),
    }))
    .map((e) => ({ ...e, snippet: e.snippet.slice(0, 240) }))

  const onArchive = async () => {
    setArchiving(true)
    setArchiveResult(null)
    const args = { plenoId: bundle.plenoId, topic: bundle.topic }
    const reason = archiveReason.trim()
    if (reason) args.reason = reason
    const r = await callCurator('archive-bundle', args)
    setArchiving(false)
    setArchiveResult(r)
    if (r.ok && r.exitCode === 0) {
      // Refresh the queue file so the bundle disappears from the live
      // list, then close the modal.
      await callCurator('refresh-curate-queue', {})
      onCompleted?.()
      onClose()
    }
  }

  const onDraft = async () => {
    setDrafting(true)
    setDraftError(null)
    const args = { plenoId: bundle.plenoId, topic: bundle.topic }
    if (evidence.length > 0) args.extraEvidence = evidence
    const r = await callCurator('draft-finding', args)
    setDrafting(false)
    if (!r.ok || r.exitCode !== 0) {
      setDraftError(r.error || r.stderr?.slice(0, 400) || `LLM exited ${r.exitCode}`)
      return
    }
    // The script prints one final JSON line on stdout. Find it (the LLM
    // client may have logged warnings before it).
    const lines = (r.stdout || '').trim().split('\n').filter(Boolean)
    const lastLine = lines[lines.length - 1]
    let parsed
    try {
      parsed = JSON.parse(lastLine || '{}')
    } catch {
      setDraftError(`unexpected stdout: ${(r.stdout || '').slice(0, 200)}`)
      return
    }
    if (!parsed.title || !parsed.summary) {
      setDraftError(`malformed draft: ${lastLine?.slice(0, 200)}`)
      return
    }
    setTitle(parsed.title)
    setSummary(parsed.summary)
  }

  const onPromote = async () => {
    setRunning(true)
    setResult(null)
    const args = {
      claimIds,
      title: title.trim(),
      summary: summary.trim(),
      severity,
    }
    if (corroborationPayload.length > 0) {
      args.extraCorroboration = corroborationPayload
    }
    const r = await callCurator('promote-claim', args)
    setRunning(false)
    setResult(r)
    if (r.ok && r.exitCode === 0) {
      onCompleted?.()
    }
  }

  const onCommit = async () => {
    setCommitting(true)
    setCommitResult(null)
    const msg = `data: curator promote ${claimIds[0]} (+${claimIds.length - 1} claim${claimIds.length > 2 ? 's' : ''})`
    const r = await callCommit(msg)
    setCommitting(false)
    setCommitResult(r)
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.42)',
        zIndex: 100,
        display: 'grid',
        placeItems: 'center',
        padding: 16,
      }}
      role="dialog"
      aria-modal="true"
    >
      <Card
        style={{
          width: 'min(880px, 100%)',
          maxHeight: '92vh',
          overflow: 'auto',
          padding: 0,
        }}
      >
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--border2)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mono" style={{ fontSize: 11, color: 'var(--ink50)' }}>
              {bundle.plenoId} · {shortDate(bundle.plenoDate)} · {bundle.topic}
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>{bundle.plenoTitle}</div>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '6px 10px',
              border: '1px solid var(--border2)',
              background: 'var(--paper)',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>

        <div style={{ padding: 18 }}>
          <SectionHead title="Quotes (verbatim)" />
          {bundle.quotes.map((q) => (
            <div
              key={q.claimId}
              style={{
                padding: '10px 12px',
                border: '1px solid var(--border2)',
                borderRadius: 6,
                marginBottom: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <VerdictPill verdict={q.verdict} />
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink50)' }}>
                  {q.speakerGroup ?? '—'} · conf={q.confidence.toFixed(2)} · {q.claimId}
                </span>
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>«{q.verbatim}»</div>
              {q.evidence?.length > 0 && (
                <div
                  style={{ marginTop: 8, paddingTop: 6, borderTop: '1px dashed var(--border2)' }}
                >
                  {q.evidence.map((e, i) => (
                    <div key={i} style={{ fontSize: 11.5, lineHeight: 1.4, marginTop: 2 }}>
                      <span
                        className="mono"
                        style={{
                          fontSize: 9.5,
                          color: 'var(--ink50)',
                          marginRight: 6,
                          textTransform: 'uppercase',
                        }}
                      >
                        {e.kind}
                      </span>
                      {/^https?:\/\//.test(e.ref) ? (
                        <a href={e.ref} target="_blank" rel="noreferrer">
                          {e.snippet}
                        </a>
                      ) : (
                        e.snippet
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          <SectionHead title="Additional evidence (optional)" />
          <p style={{ fontSize: 12, color: 'var(--ink60)', marginTop: 0 }}>
            Paste a URL (HTML article or PDF). The server fetches it, extracts text, and includes it
            in the next LLM draft. Audio and video evidence are <b>not yet supported</b> here —
            transcription needs an async job pipeline that's a follow-up task. Evidence lives in
            this modal only; promoting the finding does not embed the snippets in the published
            record (use the editorial summary to cite them).
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
            <input
              type="url"
              placeholder="https://example.com/article-or-document.pdf"
              value={evidenceUrl}
              onChange={(e) => setEvidenceUrl(e.target.value)}
              disabled={fetchingEvidence}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addEvidence()
                }
              }}
              style={{
                flex: 1,
                padding: '7px 10px',
                border: '1px solid var(--border2)',
                borderRadius: 6,
                fontSize: 12.5,
                background: 'var(--paper)',
                color: 'var(--ink)',
              }}
            />
            <button
              onClick={addEvidence}
              disabled={!evidenceUrl.trim() || fetchingEvidence}
              style={{
                padding: '7px 12px',
                border: '1px solid var(--border2)',
                background: fetchingEvidence ? 'var(--soft)' : 'var(--paper)',
                borderRadius: 6,
                cursor: !evidenceUrl.trim() || fetchingEvidence ? 'not-allowed' : 'pointer',
                fontSize: 12,
              }}
            >
              {fetchingEvidence ? 'Fetching…' : 'Add URL'}
            </button>
          </div>
          {evidenceError && (
            <div
              style={{
                padding: '6px 10px',
                marginTop: 6,
                border: '1px solid var(--crit-ink)',
                borderRadius: 6,
                fontSize: 11.5,
                background: 'var(--soft)',
                color: 'var(--crit-ink)',
              }}
            >
              {evidenceError}
            </div>
          )}
          {evidence.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {evidence.map((ev, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'flex-start',
                    padding: '8px 10px',
                    border: '1px solid var(--border2)',
                    borderRadius: 6,
                    marginBottom: 6,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                      <Pill tone="intel" size="sm">
                        {ev.kind}
                      </Pill>
                      {ev.title && (
                        <span style={{ fontSize: 12.5, fontWeight: 600 }}>
                          {ev.title.slice(0, 100)}
                        </span>
                      )}
                      {ev.sourceUrl && (
                        <a
                          href={ev.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mono"
                          style={{ fontSize: 10, color: 'var(--ink50)' }}
                        >
                          source ↗
                        </a>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink60)', lineHeight: 1.4 }}>
                      {ev.snippet.slice(0, 240)}
                      {ev.snippet.length > 240 ? '…' : ''}
                    </div>
                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        marginTop: 6,
                        fontSize: 11,
                        color: 'var(--ink60)',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                      title="If checked, this URL/PDF/transcript lands in the published finding's corroboration[] for citizen-facing citation."
                    >
                      <input
                        type="checkbox"
                        checked={!!ev.includeInCorroboration}
                        onChange={() => toggleEvidenceCorroboration(i)}
                        style={{ margin: 0 }}
                      />
                      Include in published <code>corroboration[]</code>
                    </label>
                  </div>
                  <button
                    onClick={() => removeEvidence(i)}
                    aria-label="remove evidence"
                    style={{
                      padding: '2px 8px',
                      border: '1px solid var(--border2)',
                      background: 'var(--paper)',
                      borderRadius: 4,
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div
            style={{
              marginTop: 12,
              paddingTop: 10,
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
                marginBottom: 6,
              }}
            >
              Audio / video evidence (transcribed via Whisper)
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--ink60)', marginTop: 0 }}>
              Paste an absolute path to a local audio or video file (under your home directory). The
              server validates the file (size cap 500&nbsp;MB, magic-byte mime sniff), spawns a
              detached transcription job, and the snippet appears in the evidence list when ready.
              Engine: <code>WHISPER_ENGINE</code> env (defaults to <code>local</code>).
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
              <input
                type="text"
                placeholder="/Users/me/Downloads/press-conf.mp4"
                value={mediaPath}
                onChange={(e) => setMediaPath(e.target.value)}
                style={{
                  flex: 1,
                  padding: '7px 10px',
                  border: '1px solid var(--border2)',
                  borderRadius: 6,
                  fontSize: 12.5,
                  background: 'var(--paper)',
                  color: 'var(--ink)',
                }}
              />
              <select
                value={mediaKind}
                onChange={(e) => setMediaKind(e.target.value)}
                style={{
                  padding: '7px 10px',
                  border: '1px solid var(--border2)',
                  borderRadius: 6,
                  fontSize: 12,
                  background: 'var(--paper)',
                  color: 'var(--ink)',
                }}
              >
                <option value="audio">Audio</option>
                <option value="video">Video</option>
              </select>
              <button
                onClick={startTranscribeJob}
                disabled={!mediaPath.trim()}
                style={{
                  padding: '7px 12px',
                  border: '1px solid var(--border2)',
                  background: 'var(--paper)',
                  borderRadius: 6,
                  cursor: !mediaPath.trim() ? 'not-allowed' : 'pointer',
                  fontSize: 12,
                }}
              >
                Transcribe
              </button>
            </div>
            {mediaError && (
              <div
                style={{
                  padding: '6px 10px',
                  marginTop: 6,
                  border: '1px solid var(--crit-ink)',
                  borderRadius: 6,
                  fontSize: 11.5,
                  background: 'var(--soft)',
                  color: 'var(--crit-ink)',
                }}
              >
                {mediaError}
              </div>
            )}
            {transcribeJobs.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {transcribeJobs.map((j) => {
                  const isInflight = j.status === 'queued' || j.status === 'running'
                  const tone =
                    j.status === 'done'
                      ? 'var(--ok-ink)'
                      : j.status === 'failed' || j.status === 'cancelled'
                        ? 'var(--crit-ink)'
                        : 'var(--border2)'
                  return (
                    <div
                      key={j.jobId}
                      style={{
                        display: 'flex',
                        gap: 8,
                        alignItems: 'center',
                        padding: '8px 10px',
                        border: `1px solid ${tone}`,
                        borderRadius: 6,
                        marginBottom: 6,
                        background: 'var(--soft)',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>
                          {j.path.split('/').pop()}
                        </div>
                        <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink50)' }}>
                          {j.kind} · {j.status}
                          {j.progress ? ` · ${j.progress}` : ''}
                          {j.error ? ` · ${j.error.slice(0, 120)}` : ''}
                        </div>
                      </div>
                      {isInflight && (
                        <button
                          onClick={() => cancelTranscribeJob(j.jobId)}
                          style={{
                            padding: '4px 10px',
                            fontSize: 11,
                            border: '1px solid var(--border2)',
                            background: 'var(--paper)',
                            borderRadius: 4,
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                      )}
                      {!isInflight && j.status !== 'done' && (
                        <button
                          onClick={() => dismissTranscribeJob(j.jobId)}
                          style={{
                            padding: '4px 10px',
                            fontSize: 11,
                            border: '1px solid var(--border2)',
                            background: 'var(--paper)',
                            borderRadius: 4,
                            cursor: 'pointer',
                          }}
                        >
                          Dismiss
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <SectionHead title="Editorial draft" />
          <p style={{ fontSize: 12, color: 'var(--ink60)', marginTop: 0 }}>
            Severity defaults to <b>notable</b> for contradicho-bearing bundles (auto-curation never
            publishes contradicho material — manual review is the whole point of this queue).
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0' }}>
            <button
              onClick={onDraft}
              disabled={drafting || running}
              style={{
                padding: '6px 12px',
                border: '1px solid var(--border2)',
                background: drafting ? 'var(--soft)' : 'var(--paper)',
                color: 'var(--ink)',
                borderRadius: 6,
                cursor: drafting || running ? 'not-allowed' : 'pointer',
                fontSize: 12,
              }}
            >
              {drafting
                ? 'Generating draft (10–30s)…'
                : evidence.length > 0
                  ? `Re-draft with ${evidence.length} evidence`
                  : 'Generate draft with LLM'}
            </button>
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink50)' }}>
              defaults to gemini · LLM_BACKEND env overrides
            </span>
          </div>
          {draftError && (
            <div
              style={{
                padding: '8px 10px',
                marginBottom: 8,
                border: '1px solid var(--crit-ink)',
                borderRadius: 6,
                fontSize: 11.5,
                background: 'var(--soft)',
                color: 'var(--crit-ink)',
              }}
            >
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{draftError}</pre>
            </div>
          )}
          <label
            className="mono"
            style={{ fontSize: 10.5, color: 'var(--ink50)', display: 'block', marginTop: 8 }}
          >
            Title (10–200 chars)
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            disabled={running}
            style={{
              width: '100%',
              padding: '8px 10px',
              border: `1px solid ${title && !titleValid ? 'var(--crit-ink)' : 'var(--border2)'}`,
              borderRadius: 6,
              fontSize: 13,
              fontFamily: 'inherit',
              background: 'var(--paper)',
              color: 'var(--ink)',
            }}
          />
          <label
            className="mono"
            style={{ fontSize: 10.5, color: 'var(--ink50)', display: 'block', marginTop: 8 }}
          >
            Summary (40–2000 chars)
          </label>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            maxLength={2000}
            disabled={running}
            rows={5}
            style={{
              width: '100%',
              padding: '8px 10px',
              border: `1px solid ${summary && !summaryValid ? 'var(--crit-ink)' : 'var(--border2)'}`,
              borderRadius: 6,
              fontSize: 13,
              fontFamily: 'inherit',
              background: 'var(--paper)',
              color: 'var(--ink)',
              resize: 'vertical',
            }}
          />
          <label
            className="mono"
            style={{ fontSize: 10.5, color: 'var(--ink50)', display: 'block', marginTop: 8 }}
          >
            Severity
          </label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            disabled={running}
            style={{
              padding: '6px 10px',
              border: '1px solid var(--border2)',
              borderRadius: 6,
              fontSize: 13,
              background: 'var(--paper)',
              color: 'var(--ink)',
            }}
          >
            <option value="informational">informational</option>
            <option value="notable">notable</option>
            <option value="critical">critical</option>
          </select>

          {corroborationPayload.length > 0 && (
            <div
              style={{
                marginTop: 12,
                padding: '8px 10px',
                border: '1px solid var(--ok-ink)',
                borderRadius: 6,
                fontSize: 11.5,
                background: 'var(--soft)',
                color: 'var(--ink60)',
              }}
            >
              <b>{corroborationPayload.length}</b> evidence will be embedded as{' '}
              <code>corroboration[]</code> on the published finding (
              {corroborationPayload.map((c) => c.kind).join(' · ')})
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button
              onClick={onPromote}
              disabled={!ready}
              style={{
                padding: '9px 14px',
                border: 'none',
                background: ready ? 'var(--civic-ink)' : 'var(--soft)',
                color: ready ? '#fff' : 'var(--ink50)',
                borderRadius: 6,
                cursor: ready ? 'pointer' : 'not-allowed',
                fontWeight: 600,
              }}
            >
              {running ? 'Running…' : 'Run promote-claim'}
            </button>
            <button
              onClick={onCommit}
              disabled={committing || !result?.ok || result.exitCode !== 0}
              style={{
                padding: '9px 14px',
                border: '1px solid var(--border2)',
                background: 'var(--paper)',
                color: 'var(--ink)',
                borderRadius: 6,
                cursor:
                  committing || !result?.ok || result.exitCode !== 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {committing ? 'Committing…' : 'Commit & push'}
            </button>
            <div style={{ flex: 1 }} />
            {!showArchiveInput ? (
              <button
                onClick={() => setShowArchiveInput(true)}
                disabled={archiving || running || committing}
                style={{
                  padding: '9px 14px',
                  border: '1px dashed var(--border2)',
                  background: 'transparent',
                  color: 'var(--ink60)',
                  borderRadius: 6,
                  cursor: archiving || running || committing ? 'not-allowed' : 'pointer',
                  fontSize: 12.5,
                }}
                title="Mark this bundle reviewed and skip it. Doesn't publish anything."
              >
                Archive (unclear)
              </button>
            ) : (
              <div
                style={{
                  display: 'flex',
                  gap: 6,
                  alignItems: 'center',
                  flex: '1 1 100%',
                  marginTop: 6,
                  padding: '8px 10px',
                  border: '1px dashed var(--border2)',
                  borderRadius: 6,
                  background: 'var(--soft)',
                }}
              >
                <input
                  type="text"
                  placeholder="Optional reason (≤500 chars) — useful for git history"
                  value={archiveReason}
                  onChange={(e) => setArchiveReason(e.target.value)}
                  maxLength={500}
                  disabled={archiving}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    border: '1px solid var(--border2)',
                    borderRadius: 4,
                    fontSize: 12,
                    background: 'var(--paper)',
                    color: 'var(--ink)',
                  }}
                />
                <button
                  onClick={onArchive}
                  disabled={archiving}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid var(--border2)',
                    background: 'var(--paper)',
                    borderRadius: 4,
                    cursor: archiving ? 'not-allowed' : 'pointer',
                    fontSize: 12,
                  }}
                >
                  {archiving ? 'Archiving…' : 'Confirm archive'}
                </button>
                <button
                  onClick={() => {
                    setShowArchiveInput(false)
                    setArchiveReason('')
                  }}
                  disabled={archiving}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid var(--border2)',
                    background: 'var(--paper)',
                    borderRadius: 4,
                    cursor: archiving ? 'not-allowed' : 'pointer',
                    fontSize: 12,
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
          {archiveResult && !archiveResult.ok && (
            <div
              style={{
                marginTop: 8,
                padding: '8px 10px',
                border: '1px solid var(--crit-ink)',
                borderRadius: 6,
                fontSize: 11.5,
                color: 'var(--crit-ink)',
                background: 'var(--soft)',
              }}
            >
              Archive failed: {archiveResult.error}
            </div>
          )}

          {result && (
            <div
              style={{
                marginTop: 14,
                padding: 10,
                border: `1px solid ${result.ok && result.exitCode === 0 ? 'var(--ok-ink)' : 'var(--crit-ink)'}`,
                borderRadius: 6,
                fontSize: 11.5,
                background: 'var(--soft)',
              }}
            >
              <div className="mono" style={{ fontSize: 10.5, marginBottom: 4 }}>
                exit={result.exitCode ?? '?'} · {result.durationMs}ms
                {result.timedOut ? ' · TIMED OUT' : ''}
              </div>
              {result.error && <div style={{ color: 'var(--crit-ink)' }}>{result.error}</div>}
              {result.stderr && (
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--crit-ink)' }}>
                  {result.stderr}
                </pre>
              )}
              {result.stdout && (
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{result.stdout}</pre>
              )}
            </div>
          )}

          {commitResult && (
            <div
              style={{
                marginTop: 8,
                padding: 10,
                border: `1px solid ${commitResult.ok && commitResult.exitCode === 0 ? 'var(--ok-ink)' : 'var(--crit-ink)'}`,
                borderRadius: 6,
                fontSize: 11.5,
                background: 'var(--soft)',
              }}
            >
              <div className="mono" style={{ fontSize: 10.5, marginBottom: 4 }}>
                git {commitResult.ok ? `· ${commitResult.durationMs}ms` : 'failed'}
                {commitResult.failedAt ? ` · failed at ${commitResult.failedAt}` : ''}
              </div>
              {commitResult.error && (
                <div style={{ color: 'var(--crit-ink)' }}>{commitResult.error}</div>
              )}
              {commitResult.stderr && (
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--crit-ink)' }}>
                  {commitResult.stderr}
                </pre>
              )}
              {commitResult.stdout && (
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{commitResult.stdout}</pre>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

function ContradichoBundleRow({ bundle, onOpen }) {
  return (
    <div
      onClick={() => onOpen(bundle)}
      style={{
        padding: '12px 14px',
        border: '1px solid var(--border2)',
        borderRadius: 8,
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
            style={{ fontSize: 10, padding: '1px 6px', background: 'var(--soft)', borderRadius: 4 }}
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
        <div style={{ fontSize: 12, color: 'var(--ink60)', lineHeight: 1.4 }}>
          <VerdictPill verdict={bundle.quotes[0].verdict} />{' '}
          <span style={{ marginLeft: 6 }}>«{bundle.quotes[0].verbatim.slice(0, 180)}…»</span>
        </div>
      )}
    </div>
  )
}

function IssueRow({ issue }) {
  return (
    <a
      href={issue.url}
      target="_blank"
      rel="noreferrer"
      style={{
        display: 'block',
        padding: '10px 14px',
        border: '1px solid var(--border2)',
        borderRadius: 8,
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
        <div style={{ fontSize: 12, color: 'var(--ink60)', marginTop: 4, lineHeight: 1.4 }}>
          {issue.bodyExcerpt.slice(0, 200)}…
        </div>
      )}
    </a>
  )
}

function PartyChip({ party }) {
  if (!party) return null
  const tone =
    party === 'PSOE'
      ? 'civic'
      : party === 'PP'
        ? 'intel'
        : party === 'VOX'
          ? 'crit'
          : party === 'Compromís'
            ? 'ok'
            : 'neutral'
  return <Pill tone={tone}>{party}</Pill>
}

function VoiceEnrollmentSection() {
  // The endpoint returns { rows: [{slug, name, party, role, enrollment}] }
  // — see vite-curator-plugin.js:handleVoiceprintsRead. Refreshes after
  // every enroll/delete so the curator sees the latest state.
  const voices = useJsonResource('/api/curator/voiceprints')
  const [enrollFor, setEnrollFor] = useState(null) // { slug, name, party, role } or null
  const [enrollUrl, setEnrollUrl] = useState('')
  const [enrolling, setEnrolling] = useState(false)
  const [enrollErr, setEnrollErr] = useState(null)
  const [deleting, setDeleting] = useState(null) // slug being deleted, or null

  const onEnroll = async () => {
    if (!enrollFor) return
    const url = enrollUrl.trim()
    if (!url) return
    setEnrolling(true)
    setEnrollErr(null)
    const r = await callCurator('enroll-voice', {
      slug: enrollFor.slug,
      audioUrl: url,
      force: !!enrollFor.enrollment, // re-enroll path
    })
    setEnrolling(false)
    if (!r.ok || r.exitCode !== 0) {
      setEnrollErr(r.error || r.stderr?.slice(-300) || `enroll exited ${r.exitCode}`)
      return
    }
    setEnrollFor(null)
    setEnrollUrl('')
    voices.refresh()
  }

  const onDelete = async (slug) => {
    setDeleting(slug)
    const r = await callCurator('delete-voiceprint', { slug })
    setDeleting(null)
    if (r.ok && r.exitCode === 0) voices.refresh()
  }

  const rows = voices.data?.rows ?? []
  const enrolledCount = voices.data?.enrolledCount ?? 0
  const total = voices.data?.totalCouncillors ?? 0

  return (
    <Card style={{ padding: 16, marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <SectionHead title="Voice ID enrollment" />
        <span
          className="mono"
          style={{ fontSize: 10.5, color: 'var(--ink50)', marginLeft: 'auto' }}
        >
          {voices.data
            ? `${enrolledCount}/${total} councillors enrolled · generated ${shortDate(voices.data.generatedAt)}`
            : ''}
        </span>
        <button
          onClick={() => voices.refresh()}
          disabled={voices.loading}
          style={{
            padding: '5px 10px',
            fontSize: 11,
            border: '1px solid var(--border2)',
            background: 'var(--paper)',
            borderRadius: 6,
            cursor: voices.loading ? 'not-allowed' : 'pointer',
          }}
        >
          {voices.loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--ink60)', marginTop: 4, marginBottom: 10 }}>
        Per-councillor voiceprint database (192-dim ECAPA-TDNN embeddings). Enroll from any public
        audio URL — Instagram reel, YouTube clip, official statement. Stored locally in{' '}
        <code>.voiceprints/</code> (gitignored). Used for individual claim attribution at extraction
        time once integration ships; today this is the enrollment tool only.
      </p>
      {voices.error && (
        <p style={{ fontSize: 12, color: 'var(--crit-ink)' }}>
          Cannot load /api/curator/voiceprints: {voices.error}
        </p>
      )}
      <div style={{ display: 'grid', gap: 6 }}>
        {rows.map((r) => {
          const enrolled = !!r.enrollment
          return (
            <div
              key={r.slug}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                border: `1px solid ${enrolled ? 'var(--ok-ink)' : 'var(--border2)'}`,
                borderRadius: 6,
                background: enrolled ? 'var(--soft)' : 'var(--paper)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</span>
                  <PartyChip party={r.party} />
                  {r.role === 'alcalde' && (
                    <Pill tone="warn" size="sm">
                      alcalde
                    </Pill>
                  )}
                  {enrolled && (
                    <span
                      className="mono"
                      style={{ fontSize: 10, color: 'var(--ok-ink)' }}
                      title={`enrolled ${r.enrollment.enrolledAt}`}
                    >
                      ✓ {Math.round(r.enrollment.durationSec)}s · {r.enrollment.embeddingDim}-dim
                    </span>
                  )}
                </div>
                {enrolled && r.enrollment.sourceUrl && (
                  <div style={{ fontSize: 10.5, color: 'var(--ink50)', marginTop: 2 }}>
                    <a
                      href={r.enrollment.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: 'inherit' }}
                    >
                      source ↗
                    </a>
                  </div>
                )}
              </div>
              {enrolled && (
                <button
                  onClick={() => onDelete(r.slug)}
                  disabled={deleting === r.slug}
                  style={{
                    padding: '4px 10px',
                    fontSize: 11,
                    border: '1px solid var(--border2)',
                    background: 'var(--paper)',
                    borderRadius: 4,
                    cursor: deleting === r.slug ? 'not-allowed' : 'pointer',
                  }}
                >
                  {deleting === r.slug ? 'Removing…' : 'Clear'}
                </button>
              )}
              <button
                onClick={() => {
                  setEnrollFor(r)
                  setEnrollUrl('')
                  setEnrollErr(null)
                }}
                style={{
                  padding: '4px 10px',
                  fontSize: 11,
                  border: '1px solid var(--border2)',
                  background: 'var(--paper)',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                {enrolled ? 'Re-enroll…' : 'Enroll URL…'}
              </button>
            </div>
          )
        })}
      </div>

      {enrollFor && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.42)',
            zIndex: 100,
            display: 'grid',
            placeItems: 'center',
            padding: 16,
          }}
          role="dialog"
          aria-modal="true"
        >
          <Card style={{ width: 'min(560px, 100%)', padding: 18 }}>
            <div className="mono" style={{ fontSize: 11, color: 'var(--ink50)' }}>
              {enrollFor.role ?? '—'} · {enrollFor.party ?? '—'}
            </div>
            <h3 style={{ margin: '4px 0 12px', fontSize: 16 }}>Enroll voice: {enrollFor.name}</h3>
            <p style={{ fontSize: 12, color: 'var(--ink60)', marginTop: 0 }}>
              Paste any public audio URL with this person speaking — yt-dlp will extract the audio.
              Recommended: <b>≥30 s</b> of clear, uninterrupted speech (interview, statement, press
              conference). The downloaded clip is cached in <code>.voiceprints/audio/</code> for
              audit but never committed.
            </p>
            <input
              type="url"
              placeholder="https://www.instagram.com/reel/… or https://youtu.be/…"
              value={enrollUrl}
              onChange={(e) => setEnrollUrl(e.target.value)}
              disabled={enrolling}
              autoFocus
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid var(--border2)',
                borderRadius: 6,
                fontSize: 13,
                background: 'var(--paper)',
                color: 'var(--ink)',
                marginTop: 8,
              }}
            />
            {enrollErr && (
              <pre
                style={{
                  marginTop: 8,
                  padding: '8px 10px',
                  border: '1px solid var(--crit-ink)',
                  borderRadius: 6,
                  fontSize: 11,
                  background: 'var(--soft)',
                  color: 'var(--crit-ink)',
                  whiteSpace: 'pre-wrap',
                  overflow: 'auto',
                  maxHeight: 200,
                }}
              >
                {enrollErr}
              </pre>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button
                onClick={onEnroll}
                disabled={!enrollUrl.trim() || enrolling}
                style={{
                  padding: '9px 14px',
                  border: 'none',
                  background: enrollUrl.trim() && !enrolling ? 'var(--civic-ink)' : 'var(--soft)',
                  color: enrollUrl.trim() && !enrolling ? '#fff' : 'var(--ink50)',
                  borderRadius: 6,
                  cursor: enrollUrl.trim() && !enrolling ? 'pointer' : 'not-allowed',
                  fontWeight: 600,
                }}
              >
                {enrolling
                  ? 'Enrolling (yt-dlp + ffmpeg + ECAPA)…'
                  : enrollFor.enrollment
                    ? 'Re-enroll'
                    : 'Enroll'}
              </button>
              <button
                onClick={() => {
                  setEnrollFor(null)
                  setEnrollUrl('')
                  setEnrollErr(null)
                }}
                disabled={enrolling}
                style={{
                  padding: '9px 14px',
                  border: '1px solid var(--border2)',
                  background: 'var(--paper)',
                  borderRadius: 6,
                  cursor: enrolling ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </Card>
        </div>
      )}
    </Card>
  )
}

/**
 * Voice-ID assignments per pleno. Lists every pleno-speakers/<id>.json
 * the matcher has produced and lets the curator override individual
 * cluster→councillor mappings before the LLM extractor consumes them.
 *
 * Audio playback per cluster is deferred to a later iteration — the
 * curator can spot-check the underlying audio via the source recording.
 */
function tierBadge(tier) {
  if (tier === 'curator') return { label: 'curator', tone: 'civic' }
  if (tier === 'high') return { label: 'high', tone: 'ok' }
  if (tier === 'medium') return { label: 'medium', tone: 'warn' }
  if (tier === 'low') return { label: 'low', tone: 'neutral' }
  return { label: 'unmatched', tone: 'neutral' }
}

function effectiveAssignment(a) {
  if (a.curatorOverride) {
    return {
      slug: a.curatorOverride.slug,
      name: a.curatorOverride.name,
      party: a.curatorOverride.party,
      tier: 'curator',
      cosine: null,
      margin: null,
    }
  }
  if (a.match) {
    return {
      slug: a.match.slug,
      name: a.match.name,
      party: a.match.party,
      tier: a.match.tier,
      cosine: a.match.cosine,
      margin: a.match.margin,
    }
  }
  return { slug: null, name: null, party: null, tier: 'unmatched', cosine: null, margin: null }
}

function PlenoAssignmentRow({ plenoId, assignment, voiceprintRows, onOverride, busy }) {
  const eff = effectiveAssignment(assignment)
  const tier = tierBadge(eff.tier)
  return (
    <tr style={{ borderTop: '1px dashed var(--border2)' }}>
      <td style={{ padding: '8px 6px', verticalAlign: 'top' }}>
        <div className="mono" style={{ fontSize: 11, fontWeight: 600 }}>
          {assignment.speaker}
        </div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--ink50)' }}>
          {assignment.durationSec.toFixed(0)}s · {assignment.segmentCount} seg
        </div>
        <audio
          controls
          preload="none"
          src={`/api/curator/pleno-speakers/${plenoId}/audio/${assignment.speaker}`}
          style={{ width: 220, marginTop: 6, height: 28 }}
          title="8-second snippet from the cluster's longest segment"
        />
      </td>
      <td style={{ padding: '8px 6px', verticalAlign: 'top' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Pill tone={tier.tone} size="xs">
            {tier.label}
          </Pill>
          {eff.name ? (
            <>
              <span style={{ fontSize: 12.5 }}>{eff.name}</span>
              <PartyChip party={eff.party} />
            </>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--ink50)' }}>—</span>
          )}
        </div>
        {eff.cosine != null && (
          <div className="mono" style={{ fontSize: 10, color: 'var(--ink50)', marginTop: 3 }}>
            cos={eff.cosine.toFixed(3)} · margin={(eff.margin ?? 0).toFixed(3)}
          </div>
        )}
        {assignment.curatorOverride && assignment.match && (
          <div className="mono" style={{ fontSize: 10, color: 'var(--ink50)', marginTop: 2 }}>
            (auto would be {assignment.match.tier} · {assignment.match.name})
          </div>
        )}
        {assignment.curatorOverride?.reason && (
          <div style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--ink60)', marginTop: 3 }}>
            «{assignment.curatorOverride.reason}»
          </div>
        )}
      </td>
      <td style={{ padding: '8px 6px', verticalAlign: 'top' }}>
        <div className="mono" style={{ fontSize: 10, color: 'var(--ink60)', lineHeight: 1.6 }}>
          {(assignment.topCandidates ?? []).slice(0, 3).map((c) => (
            <div key={c.slug}>
              {c.name} · {c.cosine.toFixed(3)}
            </div>
          ))}
        </div>
      </td>
      <td style={{ padding: '8px 6px', verticalAlign: 'top', minWidth: 180 }}>
        <select
          value={
            assignment.curatorOverride
              ? (assignment.curatorOverride.slug ?? '__cleared__')
              : '__no-override__'
          }
          disabled={busy}
          onChange={(e) => {
            const v = e.target.value
            if (v === '__no-override__')
              onOverride(plenoId, assignment.speaker, { mode: 'remove-override' })
            else if (v === '__cleared__') onOverride(plenoId, assignment.speaker, { mode: 'clear' })
            else onOverride(plenoId, assignment.speaker, { mode: 'assign', slug: v })
          }}
          style={{
            width: '100%',
            padding: '4px 6px',
            fontSize: 11,
            border: '1px solid var(--border2)',
            background: 'var(--paper)',
            borderRadius: 4,
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          <option value="__no-override__">— auto —</option>
          <option value="__cleared__">unassigned (curator)</option>
          {voiceprintRows
            .filter((r) => r.enrollment)
            .map((r) => (
              <option key={r.slug} value={r.slug}>
                {r.name} ({r.party ?? '?'})
              </option>
            ))}
        </select>
      </td>
    </tr>
  )
}

function PlenoAssignmentsCard({ plenoSummary, voiceprintRows, onChanged }) {
  const detail = useJsonResource(`/api/curator/pleno-speakers/${plenoSummary.plenoId}`)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const onOverride = async (plenoId, speaker, payload) => {
    setBusy(true)
    setErr(null)
    const r = await callCurator('override-speaker-assignment', {
      plenoId,
      speaker,
      ...payload,
    })
    setBusy(false)
    if (!r.ok || r.exitCode !== 0) {
      setErr(r.error || r.stderr?.slice(-300) || `override exited ${r.exitCode}`)
      return
    }
    detail.refresh()
    if (onChanged) onChanged()
  }

  const assignments = detail.data?.assignments ?? []
  return (
    <Card style={{ padding: 14, marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
        <SectionHead
          eyebrow={
            plenoSummary.plenoDate
              ? `${plenoSummary.plenoDate} · ${plenoSummary.plenoId}`
              : plenoSummary.plenoId
          }
          title={plenoSummary.plenoTitle ?? plenoSummary.plenoId}
        />
        <span
          className="mono"
          style={{ fontSize: 10.5, color: 'var(--ink50)', marginLeft: 'auto' }}
        >
          {plenoSummary.totalSpeakers} cluster(s) · {plenoSummary.highConfidenceCount} high ·{' '}
          {plenoSummary.mediumConfidenceCount} medium · {plenoSummary.unmatchedCount} unmatched
          {plenoSummary.curatorOverrideCount > 0
            ? ` · ${plenoSummary.curatorOverrideCount} curator`
            : ''}
        </span>
      </div>
      {detail.loading && <div style={{ fontSize: 12, color: 'var(--ink60)' }}>Loading…</div>}
      {detail.error && (
        <div style={{ fontSize: 12, color: 'var(--crit-ink)' }}>
          Cannot load detail: {detail.error}
        </div>
      )}
      {err && (
        <div style={{ fontSize: 11.5, color: 'var(--crit-ink)', marginBottom: 6 }}>
          Override failed: {err}
        </div>
      )}
      {assignments.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--ink50)', fontSize: 10.5 }}>
              <th
                style={{
                  padding: '6px',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '.06em',
                }}
              >
                Cluster
              </th>
              <th
                style={{
                  padding: '6px',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '.06em',
                }}
              >
                Effective
              </th>
              <th
                style={{
                  padding: '6px',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '.06em',
                }}
              >
                Top candidates
              </th>
              <th
                style={{
                  padding: '6px',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '.06em',
                }}
              >
                Curator override
              </th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <PlenoAssignmentRow
                key={a.speaker}
                plenoId={plenoSummary.plenoId}
                assignment={a}
                voiceprintRows={voiceprintRows}
                onOverride={onOverride}
                busy={busy}
              />
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}

function VoiceIDAssignmentsSection() {
  const list = useJsonResource('/api/curator/pleno-speakers')
  const voices = useJsonResource('/api/curator/voiceprints')
  const [expanded, setExpanded] = useState(null)

  const plenos = list.data?.plenos ?? []
  const voiceprintRows = voices.data?.rows ?? []

  return (
    <Card style={{ padding: 16, marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <SectionHead title="Voice ID assignments per pleno" />
        <span
          className="mono"
          style={{ fontSize: 10.5, color: 'var(--ink50)', marginLeft: 'auto' }}
        >
          {plenos.length} pleno(s) · generated{' '}
          {list.data?.generatedAt ? shortDate(list.data.generatedAt) : '—'}
        </span>
        <button
          onClick={list.refresh}
          disabled={list.loading}
          style={{
            padding: '5px 10px',
            fontSize: 11,
            border: '1px solid var(--border2)',
            background: 'var(--paper)',
            borderRadius: 6,
            cursor: list.loading ? 'not-allowed' : 'pointer',
          }}
        >
          {list.loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink60)', lineHeight: 1.5, marginTop: 4 }}>
        Per-pleno cluster→councillor map produced by <code>npm run identify-pleno-speakers</code>.
        High-tier matches feed the LLM extractor as <code>speakerSlug</code>; medium and low stay
        editorial signal only. Override low-confidence rows here before re-running the extractor.
      </div>
      {list.error && (
        <div style={{ fontSize: 12, color: 'var(--crit-ink)', marginTop: 8 }}>
          Cannot load /api/curator/pleno-speakers: {list.error}
        </div>
      )}
      {plenos.length === 0 && !list.loading && !list.error && (
        <div style={{ fontSize: 12, color: 'var(--ink60)', marginTop: 8 }}>
          No <code>pleno-speakers/&lt;id&gt;.json</code> files yet. Run{' '}
          <code>
            WHISPER_DIARIZE=1 WHISPER_IDENTIFY=1 bash scripts/transcribe-pleno.sh &lt;id&gt;
          </code>
          , or <code>npm run identify-pleno-speakers -- &lt;id&gt; --apply</code> against an
          already-diarized transcript.
        </div>
      )}
      {plenos.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {plenos.map((p) => {
            const isExpanded = expanded === p.plenoId
            return (
              <div key={p.plenoId}>
                <button
                  onClick={() => setExpanded(isExpanded ? null : p.plenoId)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 10px',
                    border: '1px solid var(--border2)',
                    background: isExpanded ? 'var(--soft)' : 'var(--paper)',
                    borderRadius: 6,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    {p.plenoDate ? `${p.plenoDate} · ` : ''}
                    {p.plenoTitle ?? p.plenoId}
                  </span>
                  <span
                    className="mono"
                    style={{ fontSize: 10.5, color: 'var(--ink50)', marginLeft: 'auto' }}
                  >
                    {p.totalSpeakers} cluster(s) · {p.highConfidenceCount} high
                    {p.curatorOverrideCount > 0 ? ` · ${p.curatorOverrideCount} curator` : ''}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--ink50)' }}>
                    {isExpanded ? '▾' : '▸'}
                  </span>
                </button>
                {isExpanded && (
                  <PlenoAssignmentsCard
                    plenoSummary={p}
                    voiceprintRows={voiceprintRows}
                    onChanged={list.refresh}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

export default function Curator() {
  const queue = useJsonResource(QUEUE_URL)
  const issues = useJsonResource(ISSUES_URL)
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
