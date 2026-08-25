import { useState } from 'react'
import { Card, ExtLink, Pill, SectionHead } from '../../components/Primitives'
import { useJsonResource, callCurator, shortDate, PartyChip } from './shared'

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
          style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginLeft: 'auto' }}
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
            fontSize: 'var(--fs-micro)',
            border: '1px solid var(--border2)',
            background: 'var(--paper)',
            borderRadius: 'var(--r-input)',
            cursor: voices.loading ? 'not-allowed' : 'pointer',
          }}
        >
          {voices.loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      <p
        style={{
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink50)',
          marginTop: 4,
          marginBottom: 10,
        }}
      >
        Per-councillor voiceprint database (192-dim ECAPA-TDNN embeddings). Enroll from any public
        audio URL — Instagram reel, YouTube clip, official statement. Stored locally in{' '}
        <code>.voiceprints/</code> (gitignored). Used for individual claim attribution at extraction
        time once integration ships; today this is the enrollment tool only.
      </p>
      {voices.error && (
        <p style={{ fontSize: 'var(--fs-aux)', color: 'var(--crit-ink)' }}>
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
                borderRadius: 'var(--r-input)',
                background: enrolled ? 'var(--soft)' : 'var(--paper)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 'var(--fs-aux)', fontWeight: 600 }}>{r.name}</span>
                  <PartyChip party={r.party} />
                  {r.role === 'alcalde' && (
                    <Pill tone="warn" size="sm">
                      alcalde
                    </Pill>
                  )}
                  {enrolled && (
                    <span
                      className="mono"
                      style={{ fontSize: 'var(--fs-micro)', color: 'var(--ok-ink)' }}
                      title={`enrolled ${r.enrollment.enrolledAt}`}
                    >
                      ✓ {Math.round(r.enrollment.durationSec)}s · {r.enrollment.embeddingDim}-dim
                    </span>
                  )}
                </div>
                {enrolled && r.enrollment.sourceUrl && (
                  <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 2 }}>
                    <ExtLink href={r.enrollment.sourceUrl} style={{ color: 'inherit' }}>
                      source ↗
                    </ExtLink>
                  </div>
                )}
              </div>
              {enrolled && (
                <button
                  onClick={() => onDelete(r.slug)}
                  disabled={deleting === r.slug}
                  style={{
                    padding: '4px 10px',
                    fontSize: 'var(--fs-micro)',
                    border: '1px solid var(--border2)',
                    background: 'var(--paper)',
                    borderRadius: 'var(--r-input)',
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
                  fontSize: 'var(--fs-micro)',
                  border: '1px solid var(--border2)',
                  background: 'var(--paper)',
                  borderRadius: 'var(--r-input)',
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
            <div className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
              {enrollFor.role ?? '—'} · {enrollFor.party ?? '—'}
            </div>
            <h3 style={{ margin: '4px 0 12px', fontSize: 'var(--fs-head)' }}>
              Enroll voice: {enrollFor.name}
            </h3>
            <p style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink50)', marginTop: 0 }}>
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
                borderRadius: 'var(--r-input)',
                fontSize: 'var(--fs-aux)',
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
                  borderRadius: 'var(--r-input)',
                  fontSize: 'var(--fs-micro)',
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
                  borderRadius: 'var(--r-input)',
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
                  borderRadius: 'var(--r-input)',
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
        <div className="mono" style={{ fontSize: 'var(--fs-micro)', fontWeight: 600 }}>
          {assignment.speaker}
        </div>
        <div className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
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
              <span style={{ fontSize: 'var(--fs-meta)' }}>{eff.name}</span>
              <PartyChip party={eff.party} />
            </>
          ) : (
            <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>—</span>
          )}
        </div>
        {eff.cosine != null && (
          <div
            className="mono"
            style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 3 }}
          >
            cos={eff.cosine.toFixed(3)} · margin={(eff.margin ?? 0).toFixed(3)}
          </div>
        )}
        {assignment.curatorOverride && assignment.match && (
          <div
            className="mono"
            style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 2 }}
          >
            (auto would be {assignment.match.tier} · {assignment.match.name})
          </div>
        )}
        {assignment.curatorOverride?.reason && (
          <div
            style={{
              fontSize: 'var(--fs-micro)',
              color: 'var(--ink50)',
              marginTop: 3,
            }}
          >
            «{assignment.curatorOverride.reason}»
          </div>
        )}
      </td>
      <td style={{ padding: '8px 6px', verticalAlign: 'top' }}>
        <div
          className="mono"
          style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink50)', lineHeight: 1.6 }}
        >
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
            fontSize: 'var(--fs-micro)',
            border: '1px solid var(--border2)',
            background: 'var(--paper)',
            borderRadius: 'var(--r-input)',
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
          style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginLeft: 'auto' }}
        >
          {plenoSummary.totalSpeakers} cluster(s) · {plenoSummary.highConfidenceCount} high ·{' '}
          {plenoSummary.mediumConfidenceCount} medium · {plenoSummary.unmatchedCount} unmatched
          {plenoSummary.curatorOverrideCount > 0
            ? ` · ${plenoSummary.curatorOverrideCount} curator`
            : ''}
        </span>
      </div>
      {detail.loading && (
        <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>Loading…</div>
      )}
      {detail.error && (
        <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--crit-ink)' }}>
          Cannot load detail: {detail.error}
        </div>
      )}
      {err && (
        <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--crit-ink)', marginBottom: 6 }}>
          Override failed: {err}
        </div>
      )}
      {assignments.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-meta)' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--ink50)', fontSize: 'var(--fs-micro)' }}>
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
          style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginLeft: 'auto' }}
        >
          {plenos.length} pleno(s) · generated{' '}
          {list.data?.generatedAt ? shortDate(list.data.generatedAt) : '—'}
        </span>
        <button
          onClick={list.refresh}
          disabled={list.loading}
          style={{
            padding: '5px 10px',
            fontSize: 'var(--fs-micro)',
            border: '1px solid var(--border2)',
            background: 'var(--paper)',
            borderRadius: 'var(--r-input)',
            cursor: list.loading ? 'not-allowed' : 'pointer',
          }}
        >
          {list.loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      <div
        style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink50)', lineHeight: 1.5, marginTop: 4 }}
      >
        Per-pleno cluster→councillor map produced by <code>npm run identify-pleno-speakers</code>.
        High-tier matches feed the LLM extractor as <code>speakerSlug</code>; medium and low stay
        editorial signal only. Override low-confidence rows here before re-running the extractor.
      </div>
      {list.error && (
        <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--crit-ink)', marginTop: 8 }}>
          Cannot load /api/curator/pleno-speakers: {list.error}
        </div>
      )}
      {plenos.length === 0 && !list.loading && !list.error && (
        <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)', marginTop: 8 }}>
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
                    borderRadius: 'var(--r-input)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <span style={{ fontSize: 'var(--fs-aux)', fontWeight: 600 }}>
                    {p.plenoDate ? `${p.plenoDate} · ` : ''}
                    {p.plenoTitle ?? p.plenoId}
                  </span>
                  <span
                    className="mono"
                    style={{
                      fontSize: 'var(--fs-micro)',
                      color: 'var(--ink50)',
                      marginLeft: 'auto',
                    }}
                  >
                    {p.totalSpeakers} cluster(s) · {p.highConfidenceCount} high
                    {p.curatorOverrideCount > 0 ? ` · ${p.curatorOverrideCount} curator` : ''}
                  </span>
                  <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
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

export { VoiceEnrollmentSection, VoiceIDAssignmentsSection }
