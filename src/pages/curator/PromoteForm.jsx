import { useEffect, useState } from 'react'
import { Card, ExtLink, Pill, SectionHead } from '../../components/Primitives'
import { callCurator, callCommit, VerdictPill, shortDate } from './shared'

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
        // landing in crossChecked[] on the published finding. This
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
                        <ExtLink href={e.ref}>{e.snippet}</ExtLink>
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
                        <ExtLink
                          href={ev.sourceUrl}
                          className="mono"
                          style={{ fontSize: 10, color: 'var(--ink50)' }}
                        >
                          source ↗
                        </ExtLink>
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
                      title="If checked, this URL/PDF/transcript lands in the published finding's crossChecked[] for citizen-facing citation. The CLI does not verify it supports the finding — say so in the summary."
                    >
                      <input
                        type="checkbox"
                        checked={!!ev.includeInCorroboration}
                        onChange={() => toggleEvidenceCorroboration(i)}
                        style={{ margin: 0 }}
                      />
                      Include in published <code>crossChecked[]</code>
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
              <code>crossChecked[]</code> on the published finding (
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

export { PromoteForm }
