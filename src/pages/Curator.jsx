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
import { PromiseDraftRow, PromisePendingRow } from './curator/promise-queue'
import { AreaFitRow } from './curator/area-fit-queue'
import { FindingSupportRow, FindingSupportStyles } from './curator/finding-support-queue'
import { QuoteReanchorRow, QuoteReanchorStyles } from './curator/quote-reanchor-queue'
import { FindingExceptionRow, FindingExceptionStyles } from './curator/finding-exception-queue'
import { VoiceEnrollmentSection, VoiceIDAssignmentsSection } from './curator/voice'

export default function Curator() {
  const queue = useJsonResource(QUEUE_URL)
  const issues = useJsonResource(ISSUES_URL)
  const promiseQueue = useJsonResource('/api/curator/promise-queue')
  const areaFitQueue = useJsonResource('/api/curator/area-fit-queue')
  const findingSupportQueue = useJsonResource('/api/curator/finding-support-queue')
  const quoteReanchorQueue = useJsonResource('/api/curator/quote-reanchor-queue')
  const findingExceptionQueue = useJsonResource('/api/curator/finding-exception-queue')
  const pendingPromises = useJsonResource('/data/promises.json')
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

  // Encaje declarado. Unreviewed rows float to the top; already-published ones
  // stay visible so a curator can retract without leaving the dashboard.
  const areaFitPublished = new Set(
    (areaFitQueue.data?.published ?? []).map((r) => `${r.officialSlug}::${r.portfolio}`),
  )
  const areaFitOfficials = new Map((areaFitQueue.data?.officials ?? []).map((o) => [o.slug, o]))
  const areaFitRows = [...(areaFitQueue.data?.rows ?? [])].sort((a, b) => {
    const pa = areaFitPublished.has(`${a.officialSlug}::${a.portfolio}`) ? 1 : 0
    const pb = areaFitPublished.has(`${b.officialSlug}::${b.portfolio}`) ? 1 : 0
    if (pa !== pb) return pa - pb
    return a.officialSlug === b.officialSlug
      ? a.portfolio.localeCompare(b.portfolio)
      : a.officialSlug.localeCompare(b.officialSlug)
  })

  // «¿Lo sostiene o sólo se le parece?». Se muestran las 52 filas del snapshot
  // en el orden que trae la cola — primero las que afirman un vínculo
  // documental sin matizarlo. Aquí no se reordena ni se filtra nada: la lista
  // de «las que faltan por revisar» se construyó una vez por eliminación y se
  // cayó tres días después.
  const findingSupportRows = findingSupportQueue.data?.rows ?? []
  const findingSupportVerdicts = findingSupportQueue.data?.verdictOptions ?? []
  const findingSupportStats = findingSupportQueue.data?.stats ?? null
  const quoteReanchorRows = quoteReanchorQueue.data?.rows ?? []
  const quoteReanchorStats = quoteReanchorQueue.data?.stats ?? null
  const findingExceptionRows = findingExceptionQueue.data?.rows ?? []
  const findingExceptionStats = findingExceptionQueue.data?.stats ?? null

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

  // Auto-published promises awaiting human review. Distinct from the
  // draft queue above: these already live in promises.json with a public
  // "revisión pendiente" badge until a curator marks them reviewed or
  // retracts them.
  const pending = (pendingPromises.data?.items ?? []).filter(
    (p) => p.autoPublished?.reviewState === 'pending-review',
  )

  const onMarkReviewedPromise = async (id) => {
    setBusyId(id)
    setPromiseError(null)
    const r = await callCurator('mark-reviewed-promise', { promiseId: id })
    if (!r.ok || r.exitCode !== 0) {
      setPromiseError(r.error || r.stderr?.slice(0, 200) || `mark-reviewed exited ${r.exitCode}`)
      setBusyId(null)
      return
    }
    const commit = await callCommit(`data: mark promise reviewed ${id}`, [
      'public/data/promises.json',
    ])
    if (!commit.ok) {
      setPromiseError(`reviewed, but commit failed: ${commit.error}`)
      setBusyId(null)
      pendingPromises.refresh()
      return
    }
    setBusyId(null)
    pendingPromises.refresh()
  }

  const onRetractPromise = async (id) => {
    setBusyId(id)
    setPromiseError(null)
    const r = await callCurator('retract-promise', { promiseId: id })
    if (!r.ok || r.exitCode !== 0) {
      setPromiseError(r.error || r.stderr?.slice(0, 200) || `retract exited ${r.exitCode}`)
      setBusyId(null)
      return
    }
    const commit = await callCommit(`data: retract auto-published promise ${id}`, [
      'public/data/promises.json',
    ])
    if (!commit.ok) {
      setPromiseError(`retracted, but commit failed: ${commit.error}`)
      setBusyId(null)
      pendingPromises.refresh()
      promiseQueue.refresh()
      return
    }
    setBusyId(null)
    // Retract tombstones the draft into the archive, so refresh both the
    // published-promise list AND the draft queue.
    pendingPromises.refresh()
    promiseQueue.refresh()
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Curator</h1>
        <p style={{ fontSize: 12, color: 'var(--ink50)', marginTop: 4 }}>
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
          <p style={{ fontSize: 12, color: 'var(--ink50)' }}>
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
                  <div style={{ fontSize: 11.5, color: 'var(--ink50)', marginTop: 4 }}>
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
          <p style={{ fontSize: 12, color: 'var(--ink50)', lineHeight: 1.5 }}>
            <span style={{ color: 'var(--warn-ink, var(--ink))' }}>Refresh skipped.</span>{' '}
            {issues.data.error.includes('GITHUB_TOKEN')
              ? 'The repository is private — set GITHUB_TOKEN in .env (a fine-grained PAT with read access is enough) and re-run npm run refresh:gh-issues. Right-of-reply still works as a curator workflow; replies arrive through editorial contact and are applied with `npm run finding-reply`.'
              : issues.data.error}
          </p>
        )}
        {!issues.loading && !issues.error && ghIssues.length === 0 && !issues.data?.error && (
          <p style={{ fontSize: 12, color: 'var(--ink50)' }}>
            No open <code>derecho-replica</code> issues.
          </p>
        )}
        {ghIssues.map((i) => (
          <IssueRow key={i.number} issue={i} />
        ))}
      </Card>

      <Card style={{ padding: 16, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SectionHead title="Encaje declarado · cola de revisión" />
          <span
            className="mono"
            style={{ fontSize: 10.5, color: 'var(--ink50)', marginLeft: 'auto' }}
          >
            {areaFitQueue.data
              ? `${areaFitRows.length} en cola · ${areaFitPublished.size} publicadas · ${areaFitQueue.data.backend ?? '?'}`
              : ''}
          </span>
          <button
            onClick={() => areaFitQueue.refresh()}
            disabled={areaFitQueue.loading}
            style={{
              padding: '5px 10px',
              fontSize: 11,
              border: '1px solid var(--border2)',
              background: 'var(--paper)',
              borderRadius: 6,
              cursor: areaFitQueue.loading ? 'not-allowed' : 'pointer',
            }}
          >
            {areaFitQueue.loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--ink50)', lineHeight: 1.5, margin: '4px 0 10px' }}>
          Cada fila nombra a una persona viva, así que ninguna se publica sin firma. Revisa la
          evidencia citada y el criterio: la nota del curador se publica, así que describe el
          criterio, nunca el material descartado.
        </p>
        {areaFitQueue.loading && <p style={{ fontSize: 12 }}>Loading…</p>}
        {areaFitQueue.error && (
          <p style={{ fontSize: 12, color: 'var(--crit-ink)' }}>{String(areaFitQueue.error)}</p>
        )}
        {!areaFitQueue.loading && areaFitRows.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--ink50)' }}>
            Cola vacía. Genera propuestas con{' '}
            <code>LLM_BACKEND=claude-code npm run suggest:area-fit</code>.
          </p>
        )}
        {areaFitRows.map((r) => (
          <AreaFitRow
            key={`${r.officialSlug}::${r.portfolio}`}
            row={r}
            official={areaFitOfficials.get(r.officialSlug)}
            published={areaFitPublished.has(`${r.officialSlug}::${r.portfolio}`)}
            onDone={() => areaFitQueue.refresh()}
          />
        ))}
      </Card>

      <Card style={{ padding: 16, marginBottom: 18 }}>
        <FindingSupportStyles />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SectionHead title="Hallazgos · ¿lo sostiene o sólo se le parece?" />
          <span
            className="mono"
            style={{ fontSize: 10.5, color: 'var(--ink50)', marginLeft: 'auto' }}
          >
            {findingSupportStats
              ? `${findingSupportStats.queued}/${findingSupportStats.queued} en cola · ` +
                `${findingSupportStats.afirmativaDocumental} afirman vínculo documental · ` +
                `${findingSupportStats.conRevisionPrevia} con revisión previa`
              : ''}
          </span>
          <button
            onClick={() => findingSupportQueue.refresh()}
            disabled={findingSupportQueue.loading}
            style={{
              padding: '5px 10px',
              fontSize: 11,
              border: '1px solid var(--border2)',
              background: 'var(--paper)',
              borderRadius: 6,
              cursor: findingSupportQueue.loading ? 'not-allowed' : 'pointer',
            }}
          >
            {findingSupportQueue.loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--ink50)', lineHeight: 1.5, margin: '4px 0 10px' }}>
          Cada hallazgo publicado, con su sumario y el extracto que cita <strong>al lado</strong>,
          porque la pregunta es si el extracto lo sostiene o sólo se le parece. La cola presenta
          evidencia: no puntúa, no ordena por fuerza y no recomienda — el cribado léxico que lo
          intentó quedó medido sin poder discriminante. Y no escribe: el único escritor del snapshot
          publicado es <code>npm run correct-pleno-finding</code>.
        </p>
        {findingSupportQueue.loading && <p style={{ fontSize: 12 }}>Loading…</p>}
        {findingSupportQueue.error && (
          <p style={{ fontSize: 12, color: 'var(--crit-ink)' }}>
            {String(findingSupportQueue.error)}
          </p>
        )}
        {!findingSupportQueue.loading && findingSupportRows.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--ink50)' }}>
            Cola vacía. Constrúyela con <code>npm run triage:finding-support</code>.
          </p>
        )}
        {findingSupportRows.map((r) => (
          <FindingSupportRow key={r.id} row={r} verdictOptions={findingSupportVerdicts} />
        ))}
      </Card>

      <Card style={{ padding: 16, marginBottom: 18 }}>
        <QuoteReanchorStyles />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SectionHead title="Hallazgos · reanclar citas de una transcripción superada" />
          <span
            className="mono"
            style={{ fontSize: 10.5, color: 'var(--ink50)', marginLeft: 'auto' }}
          >
            {quoteReanchorStats
              ? `${quoteReanchorStats.encoladas}/${quoteReanchorStats.marcadas} en cola · ` +
                `${quoteReanchorStats.conCandidatos} con pasajes candidatos · ` +
                `${quoteReanchorStats.sinCandidatos} sin ninguno`
              : ''}
          </span>
          <button
            onClick={() => quoteReanchorQueue.refresh()}
            disabled={quoteReanchorQueue.loading}
            style={{
              padding: '5px 10px',
              fontSize: 11,
              border: '1px solid var(--border2)',
              background: 'var(--paper)',
              borderRadius: 6,
              cursor: quoteReanchorQueue.loading ? 'not-allowed' : 'pointer',
            }}
          >
            {quoteReanchorQueue.loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--ink50)', lineHeight: 1.5, margin: '4px 0 10px' }}>
          Estas citas constan en la transcripción que su sesión tenía <strong>antes</strong> de
          volverse a transcribir, y no en la vigente. La cola{' '}
          <strong>propone pasajes y no elige ninguno</strong>: el orden es solapamiento de palabras
          con contenido, que no es un veredicto, y{' '}
          <strong>no se afirma que ningún candidato sea la cita</strong> — dos intervenciones del
          mismo punto del orden del día comparten casi todo el vocabulario. Léelos, comprueba las
          palabras que faltan, y si decides reanclarla ejecuta{' '}
          <code>npm run correct-pleno-finding</code> tú mismo: queda en la bitácora pública de la
          ficha.
        </p>
        {quoteReanchorQueue.loading && <p style={{ fontSize: 12 }}>Loading…</p>}
        {quoteReanchorQueue.error && (
          <p style={{ fontSize: 12, color: 'var(--crit-ink)' }}>
            {String(quoteReanchorQueue.error)}
          </p>
        )}
        {!quoteReanchorQueue.loading && quoteReanchorRows.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--ink50)' }}>
            Cola vacía. Constrúyela con <code>npm run triage:quote-reanchor</code>.
          </p>
        )}
        {quoteReanchorRows.map((r) => (
          <QuoteReanchorRow key={r.key} row={r} />
        ))}
      </Card>

      <Card style={{ padding: 16, marginBottom: 18 }}>
        <FindingExceptionStyles />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SectionHead title="Hallazgos · ¿merece este hallazgo la excepción?" />
          <span
            className="mono"
            style={{ fontSize: 10.5, color: 'var(--ink50)', marginLeft: 'auto' }}
          >
            {findingExceptionStats
              ? `${findingExceptionStats.encolados}/${findingExceptionStats.hallazgosConCitas} en cola · ` +
                `${findingExceptionStats.sinNingunaCitaContrastada} sin ninguna cita contrastada · ` +
                `${findingExceptionStats.citasEnCola} literales`
              : ''}
          </span>
          <button
            onClick={() => findingExceptionQueue.refresh()}
            disabled={findingExceptionQueue.loading}
            style={{
              padding: '5px 10px',
              fontSize: 11,
              border: '1px solid var(--border2)',
              background: 'var(--paper)',
              borderRadius: 6,
              cursor: findingExceptionQueue.loading ? 'not-allowed' : 'pointer',
            }}
          >
            {findingExceptionQueue.loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--ink50)', lineHeight: 1.5, margin: '4px 0 10px' }}>
          La puerta editorial de <code>claim-public-gate.ts</code> retiene de{' '}
          <strong>/plenos</strong> las acusaciones públicas que el verificador no pudo contrastar.
          Promover una declaración a hallazgo es la excepción que esa puerta concede,{' '}
          <strong>y la concede porque delante hay una persona</strong>. Estas fichas no citan ni un
          literal que la puerta mostraría, y el firmante que aparece en cada una dice quién tomó la
          excepción. La cola <strong>presenta la evidencia y no elige</strong>: no puntúa, no ordena
          por gravedad —el orden es cronológico— y ninguna fila llega con decisión. Si tras leerla
          decides matizar el sumario o retirar un literal, ejecuta{' '}
          <code>npm run correct-pleno-finding</code> tú mismo: queda en la bitácora pública de la
          ficha.
        </p>
        {findingExceptionQueue.loading && <p style={{ fontSize: 12 }}>Loading…</p>}
        {findingExceptionQueue.error && (
          <p style={{ fontSize: 12, color: 'var(--crit-ink)' }}>
            {String(findingExceptionQueue.error)}
          </p>
        )}
        {!findingExceptionQueue.loading && findingExceptionRows.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--ink50)' }}>
            Cola vacía. Constrúyela con <code>npm run triage:finding-exception</code>.
          </p>
        )}
        {findingExceptionRows.map((r) => (
          <FindingExceptionRow key={r.findingId} row={r} />
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
          <p style={{ fontSize: 12, color: 'var(--ink50)' }}>La cola está vacía.</p>
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

      <Card style={{ padding: 16, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SectionHead title="Promesas auto-publicadas · pendientes de revisión" />
          <span
            className="mono"
            style={{ fontSize: 10.5, color: 'var(--ink50)', marginLeft: 'auto' }}
          >
            {pendingPromises.data
              ? `${pending.length} pendiente${pending.length === 1 ? '' : 's'} · ${
                  pendingPromises.data.items?.length ?? 0
                } publicadas · generada ${shortDate(pendingPromises.data.generatedAt)}`
              : ''}
          </span>
          <button
            onClick={() => pendingPromises.refresh()}
            disabled={pendingPromises.loading}
            style={{
              padding: '5px 10px',
              fontSize: 11,
              border: '1px solid var(--border2)',
              background: 'var(--paper)',
              borderRadius: 6,
              cursor: pendingPromises.loading ? 'not-allowed' : 'pointer',
            }}
          >
            {pendingPromises.loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        {pendingPromises.loading && <p style={{ fontSize: 12 }}>Loading…</p>}
        {pendingPromises.error && (
          <p style={{ fontSize: 12, color: 'var(--crit-ink)' }}>
            Cannot load promises.json: {pendingPromises.error}.
          </p>
        )}
        {!pendingPromises.loading && !pendingPromises.error && pending.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--ink50)' }}>
            No hay promesas auto-publicadas pendientes de revisión.
          </p>
        )}
        {pending.map((p) => (
          <PromisePendingRow
            key={p.id}
            promise={p}
            busy={busyId === p.id}
            onRetract={onRetractPromise}
            onMarkReviewed={onMarkReviewedPromise}
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
