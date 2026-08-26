#!/usr/bin/env tsx
/**
 * Promise auto-curator — daily orchestrator.
 *
 * --phase discovery : LLM discovery over fresh press → new-promise drafts.
 * --phase status    : LLM status-change miner over tenders/bdns/budget/press →
 *                     progress-transition drafts on EXISTING promises.
 * --phase both      : run both (default for the daily wrapper).
 *
 * Both phases feed the same pipeline: grounding → decision tiering → writes
 * drafts to editorial/promise-review-queue.json (local-only) and auto-publishes
 * the grounded, high-confidence ones into promises.json (en-progreso is auto;
 * parcial/cumplida are one-click fast-track).
 *
 * LOREG freeze fail-closed: missing promises.json → exit 1; frozen → exit 0.
 *
 * Usage:
 *   npm run auto-curate-promises -- [--max 10] [--min-confidence 0.7] \
 *       [--phase discovery|status|both] [--dry-run] [--no-auto-publish]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { validatePromisesSnapshot, isFrozen, type PromisesSnapshot } from '../src/scraper/promises'
import {
  makeDraftId,
  makeStatusDraftId,
  validateReviewQueue,
  emptyQueue,
  type DraftNewPromise,
  type DraftStatusChange,
  type PromiseReviewQueue,
  type QueueDraft,
} from '../src/scraper/promise-draft'
import { groundDraft, groundStatusDraft } from '../src/scraper/promise-grounding'
import {
  selectPromiseDrafts,
  selectStatusDrafts,
  statusTransitionKey,
} from '../src/scraper/promise-auto-curate'
import { newPromiseFromDraft, insertPromise, applyStatusChange } from '../src/scraper/promise-apply'
import { discoverPromises } from '../src/llm/promise-discovery'
import type { PromiseDiscoveryInput } from '../src/llm/prompts'
import { mineStatusChanges } from '../src/scraper/promise-status-miner'
import type { RetrievalInput } from '../src/llm/retriever'
import { resetBudget, loadConfigFromEnv, getRunStats } from '../src/llm/client'
import { startRun, formatManifest } from '../src/scraper/run-manifest'

const PROMISES = resolve('public/data/promises.json')
const PRESS = resolve('public/data/press.json')
const AGENDAS = resolve('public/data/plenos-agendas.json')
const TENDERS = resolve('public/data/tenders.json')
const BDNS = resolve('public/data/bdns.json')
const BUDGET = resolve('public/data/budget.json')
const QUEUE = resolve('editorial/promise-review-queue.json')
const ARCHIVE = resolve('editorial/promise-review-archive.json')
const LOGDIR = resolve('scripts/logs')

type Row = Record<string, unknown>
const s = (v: unknown) => (typeof v === 'string' ? v : '')

interface CliArgs {
  max: number
  minConfidence: number
  phase: 'discovery' | 'status' | 'both'
  dryRun: boolean
  noAutoPublish: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    max: 10,
    minConfidence: 0.7,
    phase: 'discovery',
    dryRun: false,
    noAutoPublish: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--max') out.max = Number(argv[++i])
    else if (a === '--min-confidence') out.minConfidence = Number(argv[++i])
    else if (a === '--phase') {
      const p = argv[++i]
      if (p !== 'discovery' && p !== 'status' && p !== 'both') {
        process.stderr.write(
          `[auto-curate-promises] --phase must be discovery|status|both (got ${p})\n`,
        )
        process.exit(2)
      }
      out.phase = p
    } else if (a === '--dry-run') out.dryRun = true
    else if (a === '--no-auto-publish') out.noAutoPublish = true
    else {
      process.stderr.write(`[auto-curate-promises] unknown flag ${a}\n`)
      process.exit(2)
    }
  }
  if (!Number.isFinite(out.max) || out.max < 1 || out.max > 50) {
    process.stderr.write('--max must be 1..50\n')
    process.exit(2)
  }
  if (!Number.isFinite(out.minConfidence) || out.minConfidence < 0 || out.minConfidence > 1) {
    process.stderr.write('--min-confidence must be 0..1\n')
    process.exit(2)
  }
  return out
}

function loadJson<T>(path: string): T | null {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return null
  }
}

function loadQueue(path: string): PromiseReviewQueue {
  if (!existsSync(path)) return emptyQueue(new Date().toISOString())
  return validateReviewQueue(readFileSync(path, 'utf8'))
}

function buildDiscoveryInput(
  snap: PromisesSnapshot,
  press: { items?: Array<{ title: string; link: string; date: string; source?: string }> } | null,
  agendas: { items?: Array<{ title: string; url?: string; date?: string }> } | null,
): PromiseDiscoveryInput {
  if (agendas && !('items' in agendas)) {
    process.stderr.write(
      '[auto-curate-promises] ⚠ plenos-agendas.json has no top-level "items" key — agenda discovery source is inert (Plan A discovery is press-only; agenda wiring is deferred to Plan B)\n',
    )
  }
  const existingTitles = snap.items.map((p) => p.title)
  const pressItems = (press?.items ?? []).slice(0, 60).map((n) => ({
    title: n.title,
    url: n.link,
    date: (n.date || '').slice(0, 10),
    publisher: n.source,
  }))
  const agendaItems = (agendas?.items ?? [])
    .filter((a) => a.url && a.date)
    .slice(0, 60)
    .map((a) => ({
      title: a.title,
      url: a.url as string,
      date: (a.date as string).slice(0, 10),
      publisher: 'Ayuntamiento Riba-roja',
    }))
  return {
    existingTitles,
    sources: [
      { kind: 'press', items: pressItems },
      { kind: 'pleno_agenda', items: agendaItems }, // inert in Plan A — plenos-agendas.json uses key "plenos", not "items"; agenda wiring is Plan-B
    ],
  }
}

/** Shared corpora (same docs for every promise; the retriever filters per-promise
 *  by keyword). Structured rows carry their permalink/sourceUrl as `url`. */
function buildStatusCorpora(
  tenders: { contracts?: Row[]; tenders?: Row[] } | null,
  bdns: { items?: Row[] } | null,
  budget: { snapshot?: Record<string, unknown> } | null,
  press: { items?: Array<{ title: string; link: string; date: string; source?: string }> } | null,
): RetrievalInput['corpora'] {
  const tenderDocs = [...(tenders?.contracts ?? []), ...(tenders?.tenders ?? [])]
    .slice(0, 500)
    .map((t) => ({
      url: s(t.permalink) || 'https://contrataciondelestado.es',
      title: s(t.title),
      date: (s(t.awardDate) || s(t.startDate) || s(t.submissionDate) || '2026-01-01').slice(0, 10),
      publisher: 'PLACSP',
      text: `${s(t.title)} ${s(t.categoryTitle)} ${s(t.status)} ${s(t.contractor)}`,
    }))
  const bdnsDocs = (bdns?.items ?? []).slice(0, 200).map((b) => ({
    url: s(b.sourceUrl) || 'https://www.pap.hacienda.gob.es/bdnstrans',
    title: s(b.description),
    date: (s(b.date) || '2026-01-01').slice(0, 10),
    publisher: 'BDNS',
    text: `${s(b.description)} ${s(b.organ)}`,
  }))
  const snap = budget?.snapshot ?? {}
  const budgetRows = [
    ...((snap.expenseByProgram as Row[]) ?? []),
    ...((snap.expenseByEconomicChapter as Row[]) ?? []),
  ]
  const budgetUrl = s(snap.source) || 'https://civicpulse.es/data/budget.json'
  const budgetDocs = budgetRows.map((r) => ({
    url: budgetUrl,
    title: s(r.label),
    date: `${(snap.year as number) ?? 2026}-01-01`,
    publisher: 'MinHac CONPREL',
    text: `${s(r.label)} ${String(r.amount ?? '')}`,
  }))
  const pressDocs = (press?.items ?? []).slice(0, 120).map((n) => ({
    url: s(n.link),
    title: s(n.title),
    date: (s(n.date) || '2026-01-01').slice(0, 10),
    publisher: s(n.source) || 'prensa',
    text: s(n.title),
  }))
  return [
    { corpus: 'tender', documents: tenderDocs },
    { corpus: 'bdns', documents: bdnsDocs },
    { corpus: 'budget', documents: budgetDocs },
    { corpus: 'press', documents: pressDocs },
  ]
}

function draftLabel(d: QueueDraft): string {
  return d.kind === 'new-promise'
    ? `${d.proposed.party} · ${d.proposed.title}`
    : `${d.promiseId} → ${d.proposedStatus}`
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  resetBudget()
  const config = loadConfigFromEnv()
  process.stdout.write(
    `[auto-curate-promises] backend=${config.backend} · phase=${opts.phase} · max=${opts.max} · min-conf=${opts.minConfidence} · dry-run=${opts.dryRun} · no-auto-publish=${opts.noAutoPublish}\n`,
  )

  // Manifiesto de pasada.
  //
  // Esta pasada YA detectaba su propia muerte —«This is a broken run, not an
  // empty one»— y la escribía a un log que no lee nadie. Falló todas las
  // mañanas desde el 2026-07-08 con `Not logged in`, 49 días seguidos, y
  // `check:runs` no la vigilaba porque no dejaba manifiesto. Gritar en un sitio
  // donde nadie escucha es la mitad del trabajo.
  //
  // Se escribe en `exit` y no en un `finally` a propósito: este script sale por
  // `process.exit()` en varios sitios —congelación LOREG, fichero ausente— y un
  // `finally` no cubre ninguno. La pasada que no deja manifiesto es justo la
  // que `check:runs` existe para notar.
  const runLog = startRun('auto-curate-promises', {
    mode: opts.phase,
    backend: config.backend,
    // Mismo giro que `extract-pleno-claims`: el modelo vive por backend en
    // ClientConfig, y el envoltorio fija estas dos variables.
    model: process.env.CLAUDE_CODE_MODEL ?? process.env.AGY_MODEL ?? null,
    getStats: getRunStats,
  })
  let manifiestoEscrito = false
  process.on('exit', (code) => {
    if (manifiestoEscrito) return
    manifiestoEscrito = true
    const { manifest, findings } = runLog.finish({ exitCode: code })
    process.stdout.write(`\n${formatManifest(manifest)}\n`)
    for (const f of findings) {
      process.stdout.write(`  ${f.level.toUpperCase()} [${f.code}] ${f.message}\n`)
    }
  })

  // Fail CLOSED: unknowable freeze state must not publish.
  const rawPromises = existsSync(PROMISES) ? readFileSync(PROMISES, 'utf8') : null
  if (!rawPromises) {
    process.stderr.write(
      `[auto-curate-promises] ${PROMISES} missing — cannot determine LOREG freeze, refusing\n`,
    )
    runLog.skip('promises-snapshot-missing')
    process.exit(1)
  }
  const snap = validatePromisesSnapshot(rawPromises)
  if (isFrozen(snap)) {
    process.stderr.write(
      `[auto-curate-promises] LOREG freeze active until ${snap.frozenUntil} — exiting\n`,
    )
    // Un día de congelación es una pasada que NO hizo nada a propósito. Con el
    // motivo escrito, `check:runs` la distingue de una que no llegó a correr.
    runLog.skip('loreg-freeze')
    process.exit(0)
  }

  const now = new Date()
  const nowIso = now.toISOString()
  const press = loadJson<{
    items?: Array<{ title: string; link: string; date: string; source?: string }>
  }>(PRESS)
  const agendas = loadJson<{ items?: Array<{ title: string; url?: string; date?: string }> }>(
    AGENDAS,
  )

  const existingQueue = loadQueue(QUEUE)
  const archive = loadQueue(ARCHIVE)
  const seen = new Set<string>([...existingQueue.drafts, ...archive.drafts].map((d) => d.draftId))

  const doDiscovery = opts.phase === 'discovery' || opts.phase === 'both'
  const doStatus = opts.phase === 'status' || opts.phase === 'both'

  // ── Discovery phase (new promises) ──────────────────────────────────────────
  let newAuto: DraftNewPromise[] = []
  let newQueue: DraftNewPromise[] = []
  const newSkipped: Array<{ draftId: string; reason: string }> = []
  if (doDiscovery) {
    // Discovery se cuelga: `claude-code timed out after 180s (no output;
    // killed)`, y no es tamaño —manda 60 titulares—. No sé por qué se cuelga;
    // lo que sí puedo hacer es dejar de pagar tres minutos por averiguarlo.
    // Falla blando (abajo), y la fase `status` —la que de verdad mueve
    // promesas— corre después: cuanto antes llegue, mejor.
    const relojPrevio = process.env.LLM_CLI_TIMEOUT_MS
    process.env.LLM_CLI_TIMEOUT_MS = process.env.LLM_CLI_TIMEOUT_MS ?? '45000'
    let batch: Awaited<ReturnType<typeof discoverPromises>>
    try {
      batch = await discoverPromises(buildDiscoveryInput(snap, press, agendas))
    } finally {
      // Restaurado para no imponerle a `status` el reloj corto de discovery.
      if (relojPrevio === undefined) delete process.env.LLM_CLI_TIMEOUT_MS
      else process.env.LLM_CLI_TIMEOUT_MS = relojPrevio
    }
    if (!batch) {
      process.stderr.write('[auto-curate-promises] discovery: LLM returned null (backend/budget)\n')
    } else {
      process.stdout.write(
        `[auto-curate-promises] discovery: LLM proposed ${batch.promises.length} candidate(s)\n`,
      )
      const candidates: DraftNewPromise[] = []
      for (const it of batch.promises) {
        const draft: DraftNewPromise = {
          draftId: makeDraftId(it.party, it.title, it.sourceUrl),
          kind: 'new-promise',
          requiresHumanApproval: true,
          confidence: it.confidence,
          grounding: { grounded: false, urlResolved: false, quoteFound: false, checkedAt: nowIso },
          decision: 'queue',
          proposed: {
            party: it.party,
            title: it.title,
            quote: it.quote,
            source: { url: it.sourceUrl, publisher: it.publisher },
            madeAt: it.madeAt,
            topic: it.topic,
            kind: it.kind,
            status: 'documentada',
          },
          reasoning: [
            {
              url: it.sourceUrl,
              date: it.madeAt,
              quote: it.reasoning,
              publisher: it.publisher,
              matchedKeywords: [],
            },
          ],
          generatedAt: nowIso,
        }
        draft.grounding = await groundDraft(draft, undefined, now)
        candidates.push(draft)
      }
      const sel = selectPromiseDrafts({
        candidates,
        existingPromises: snap.items,
        seenDraftIds: seen,
        frozen: false,
        minConfidence: opts.minConfidence,
        max: opts.max,
      })
      newAuto = opts.noAutoPublish ? [] : sel.autoPublish
      newQueue = opts.noAutoPublish
        ? [...sel.queue, ...sel.autoPublish.map((d) => ({ ...d, decision: 'queue' as const }))]
        : sel.queue
      newSkipped.push(...sel.skipped)
    }
  }

  // ── Status phase (progress transitions on existing promises) ────────────────
  let statusAuto: DraftStatusChange[] = []
  let statusQueue: DraftStatusChange[] = []
  const statusSkipped: Array<{ draftId: string; reason: string }> = []
  if (doStatus) {
    const tenders = loadJson<{ contracts?: Row[]; tenders?: Row[] }>(TENDERS)
    const bdns = loadJson<{ items?: Row[] }>(BDNS)
    const budget = loadJson<{ snapshot?: Record<string, unknown> }>(BUDGET)
    const corpora = buildStatusCorpora(tenders, bdns, budget, press)
    const budgetSourceUrl =
      s((budget?.snapshot as Record<string, unknown>)?.source) ||
      'https://civicpulse.es/data/budget.json'

    const statusCandidates: DraftStatusChange[] = []
    const minerStats = {
      retrieved: 0,
      emitted: 0,
      hallucinatedCite: 0,
      belowConfidence: 0,
      idMismatch: 0,
    }
    for (const p of snap.items) {
      const input: RetrievalInput = {
        promise: {
          id: p.id,
          title: p.title,
          quote: p.quote,
          topic: p.topic,
          party: p.party,
          madeAt: p.madeAt,
        } as unknown as RetrievalInput['promise'],
        corpora,
      }
      const mined = await mineStatusChanges(input, {
        snapshot: snap,
        minConfidence: opts.minConfidence,
        budgetSourceUrl,
      })
      minerStats.retrieved += mined.stats.candidatesRetrieved
      minerStats.emitted += mined.stats.emitted
      minerStats.hallucinatedCite += mined.stats.rejected.hallucinatedCite
      minerStats.belowConfidence += mined.stats.rejected.belowConfidence
      minerStats.idMismatch += mined.stats.rejected.idMismatch
      for (const c of mined.candidates) {
        const draft: DraftStatusChange = {
          draftId: makeStatusDraftId(c.promiseId, c.proposedStatus, c.evidence.url),
          kind: 'status-change',
          requiresHumanApproval: true,
          confidence: c.confidence,
          grounding: { grounded: false, urlResolved: false, quoteFound: false, checkedAt: nowIso },
          decision: 'queue',
          promiseId: c.promiseId,
          currentStatus: p.status,
          proposedStatus: c.proposedStatus,
          evidence: c.evidence,
          reasoning: [
            {
              url: c.evidence.url,
              date: c.evidence.date,
              quote: c.reasoning,
              publisher: c.evidence.publisher,
              matchedKeywords: [],
            },
          ],
          generatedAt: nowIso,
        }
        draft.grounding = await groundStatusDraft(draft, undefined, now)
        statusCandidates.push(draft)
      }
    }
    process.stdout.write(
      `[auto-curate-promises] status: ${statusCandidates.length} candidate(s) · retrieved=${minerStats.retrieved} emitted=${minerStats.emitted} rejected(cite=${minerStats.hallucinatedCite}, conf=${minerStats.belowConfidence}, id=${minerStats.idMismatch})\n`,
    )

    // `owed` es el nivel de la cola; `attempted`/`judged`, los veredictos que
    // volvieron de verdad. Cuando el backend no contesta, `attempted` es 0 con
    // `owed` en cientos, y eso dispara `nothing-attempted`, cuyo texto describe
    // exactamente lo que pasó aquí: «setup, credentials or a dependency, not
    // the model».
    const veredictos =
      minerStats.emitted +
      minerStats.hallucinatedCite +
      minerStats.belowConfidence +
      minerStats.idMismatch
    runLog.owe(minerStats.retrieved)
    runLog.attempt(veredictos)
    runLog.judge(veredictos)

    // Retrieval found work and the model emitted NOTHING and rejected NOTHING:
    // that is not a quiet day, it is the model never having answered. A day
    // where it ran and was merely conservative still shows rejections.
    //
    // This ran unnoticed for 25 consecutive days: 371 candidates retrieved
    // every morning, `auto-published: 0 · queued: 0 · skipped: 0` written to
    // the digest, and the wrapper exiting 0. The failure was visible only as
    // one `[llm] all backends exhausted` line buried in a 196 KB cron log.
    const modelNeverAnswered =
      minerStats.retrieved > 0 &&
      minerStats.emitted === 0 &&
      minerStats.hallucinatedCite === 0 &&
      minerStats.belowConfidence === 0 &&
      minerStats.idMismatch === 0
    if (modelNeverAnswered) {
      process.stderr.write(
        `[auto-curate-promises] FAILED: ${minerStats.retrieved} candidate(s) retrieved but the model ` +
          `returned nothing and rejected nothing — the LLM backend did not answer. ` +
          `This is a broken run, not an empty one.\n`,
      )
      process.exitCode = 1
    }

    const seenTransitions = new Set<string>([
      ...snap.items.map((p) => statusTransitionKey(p.id, p.status)),
      ...existingQueue.drafts
        .filter((d): d is DraftStatusChange => d.kind === 'status-change')
        .map((d) => statusTransitionKey(d.promiseId, d.proposedStatus)),
    ])
    const selS = selectStatusDrafts({
      candidates: statusCandidates,
      seenDraftIds: seen,
      seenTransitions,
      frozen: false,
      minConfidence: opts.minConfidence,
      max: opts.max,
    })
    statusAuto = opts.noAutoPublish ? [] : selS.autoPublish
    statusQueue = opts.noAutoPublish
      ? [...selS.queue, ...selS.autoPublish.map((d) => ({ ...d, decision: 'queue' as const }))]
      : selS.queue
    statusSkipped.push(...selS.skipped)
  }

  const autoCount = newAuto.length + statusAuto.length
  const toQueue: QueueDraft[] = [...newQueue, ...statusQueue]
  const skipped = [...newSkipped, ...statusSkipped]
  process.stdout.write(
    `[auto-curate-promises] auto-publish=${autoCount} · queue=${toQueue.length} · skipped=${skipped.length}\n`,
  )
  runLog.record('autoPublished', autoCount)
  runLog.record('queued', toQueue.length)
  // Desenlace, NO `skip`. Estos descartes ocurren DESPUÉS del veredicto —el
  // modelo ya los juzgó y la selección los deja fuera—, así que meterlos en el
  // cubo de saltados los cuenta dos veces y rompe la invariante
  // `judged + never-attempted + skipped === attempted`: la primera versión de
  // esto imprimió «judged 9 + skipped 5 = 14, but 9 were attempted».
  // `skip` es para lo que nunca llegó a juzgarse.
  for (const sk of skipped) runLog.record(`descartado:${sk.reason}`, 1)

  if (opts.dryRun) {
    const preview = `/tmp/auto-curate-promises-preview-${now.getTime()}.json`
    writeFileSync(
      preview,
      JSON.stringify({ newAuto, statusAuto, toQueue, skipped }, null, 2) + '\n',
    )
    process.stdout.write(
      `[auto-curate-promises] DRY RUN — wrote preview to ${preview} (no persistence)\n`,
    )
    return
  }

  // Persist queue (merge new queue/fast-track drafts onto the existing queue).
  mkdirSync(resolve('editorial'), { recursive: true })
  const mergedQueue: PromiseReviewQueue = {
    version: existingQueue.version,
    generatedAt: nowIso,
    drafts: [...existingQueue.drafts, ...toQueue],
  }
  // Validate the merged queue BEFORE writing: a malformed draft (e.g. a
  // non-ISO scraped date) fails in THIS run instead of bricking the next
  // loadQueue (which validates on read). Fail-safe: throws → main().catch.
  const mergedQueueJson = JSON.stringify(mergedQueue, null, 2) + '\n'
  validateReviewQueue(mergedQueueJson)
  writeFileSync(QUEUE, mergedQueueJson)

  // Apply auto-publish drafts to promises.json (single validated write).
  // Per-draft try/catch: one bad draft (e.g. a stale transition, or the
  // 2026-07-07 hallucinated-promiseId crash) must skip THAT draft, not abort
  // the run and lose the valid publishes alongside it.
  let applied = 0
  if (autoCount > 0) {
    let next: PromisesSnapshot = snap
    for (const d of newAuto) {
      try {
        next = insertPromise(
          next,
          newPromiseFromDraft(d, nowIso, { confidence: d.confidence, at: nowIso }),
        )
        applied += 1
      } catch (err) {
        process.stderr.write(
          `[auto-curate-promises] warn: skipping new-promise draft ${d.draftId}: ${err instanceof Error ? err.message : String(err)}\n`,
        )
      }
    }
    for (const d of statusAuto) {
      try {
        next = applyStatusChange(next, d, nowIso, { confidence: d.confidence, at: nowIso })
        applied += 1
      } catch (err) {
        process.stderr.write(
          `[auto-curate-promises] warn: skipping status-change draft ${d.draftId}: ${err instanceof Error ? err.message : String(err)}\n`,
        )
      }
    }
    if (applied > 0) {
      const serialized = JSON.stringify({ ...next, generatedAt: nowIso }, null, 2) + '\n'
      validatePromisesSnapshot(serialized) // defence-in-depth
      writeFileSync(PROMISES, serialized)
    }
    process.stdout.write(
      `[auto-curate-promises] auto-published ${applied}/${autoCount} change(s) to promises.json\n`,
    )
  }

  // Digest.
  mkdirSync(LOGDIR, { recursive: true })
  const allAuto: QueueDraft[] = [...newAuto, ...statusAuto]
  const digest = [
    `# Promise auto-curator digest — ${nowIso} (phase=${opts.phase})`,
    ``,
    `- auto-published: ${applied}${applied < autoCount ? ` (of ${autoCount} attempted — see warns)` : ''}`,
    ...allAuto.map((d) => `  - ${draftLabel(d)} (conf ${d.confidence.toFixed(2)})`),
    `- queued for review: ${toQueue.length}`,
    ...toQueue.map(
      (d) =>
        `  - [${d.kind}·${d.decision}] ${draftLabel(d)} (conf ${d.confidence.toFixed(2)}, grounded=${d.grounding.grounded})`,
    ),
    `- skipped: ${skipped.length}`,
    ...skipped.map((sk) => `  - ${sk.draftId}: ${sk.reason}`),
    ``,
  ].join('\n')
  writeFileSync(resolve(LOGDIR, `auto-curate-promises-${nowIso.slice(0, 10)}.md`), digest)
  process.stdout.write(
    `[auto-curate-promises] digest → scripts/logs/auto-curate-promises-${nowIso.slice(0, 10)}.md\n`,
  )
}

main().catch((err) => {
  process.stderr.write(
    `[auto-curate-promises] FATAL: ${err instanceof Error ? err.message : String(err)}\n`,
  )
  process.exit(1)
})
