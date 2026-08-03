#!/usr/bin/env tsx
/**
 * Propose «encaje declarado» rows for curator review.
 *
 *   LLM_BACKEND=claude-code npm run suggest:area-fit
 *   LLM_BACKEND=claude-code npm run suggest:area-fit -- --official teresa-pozuelo-martin
 *   npm run suggest:area-fit -- --dry-run          # build tasks, call nothing
 *
 * Writes editorial/area-fit-queue.json — GITIGNORED, never under public/.
 * Vercel serves the whole of public/, so a machine judgement about whether a
 * named councillor is qualified would be fetchable by URL the moment it landed
 * there, reviewed or not. That is exactly how 24 unreviewed drafts about named
 * councillors stayed web-readable for weeks.
 *
 * Nothing here publishes. Every row carries requiresHumanApproval: true, and the
 * PUBLISHED schema rejects that field outright — two independent layers, per the
 * journalist-agent contract. `decideAutomation` is consulted not because the
 * answer is in doubt (namesIndividual ⇒ Tier C, always) but so the refusal is
 * logged in the run manifest rather than assumed.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import { callLLM, loadConfigFromEnv, resetBudget, getRunStats } from '../src/llm/client'
import { startRun } from '../src/scraper/run-manifest'
import { decideAutomation } from '../src/scraper/automation-policy'
import { canonicalizeDepartment } from '../src/scraper/departments'
import {
  AREA_FIT_PROMPT_VERSION,
  buildAreaFitSystemPrompt,
  buildAreaFitUserPrompt,
  buildFitTasks,
  needsModel,
  rowFromResponse,
  rowWithoutModel,
  type AreaFitRow,
  type FitTask,
  type OfficialLike,
  type ReportLike,
} from '../src/scraper/area-fit'

const OFFICIALS = resolve('public/data/officials.json')
const REPORTS = resolve('public/data/journalist-reports.json')
const PROMISES = resolve('public/data/promises.json')
const OUT = resolve('editorial/area-fit-queue.json')

const AssessmentSchema = z.object({
  value: z.enum(['relacionada', 'sin-relacion-declarada']),
  evidenceIndices: z.array(z.number().int().nonnegative()),
  reason: z.string(),
})
const ResponseSchema = z.object({
  formacion: AssessmentSchema,
  experiencia: AssessmentSchema,
})

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}

/** LOREG art. 50 halts the suggester, same gate as /promesas and auto-curate. */
function frozenUntil(): string | null {
  if (!existsSync(PROMISES)) return null
  try {
    const f = JSON.parse(readFileSync(PROMISES, 'utf8')).frozenUntil
    if (typeof f !== 'string') return null
    return new Date(f) > new Date() ? f : null
  } catch {
    return null
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const only = arg('official')

  const freeze = frozenUntil()
  if (freeze) {
    console.error(`[area-fit] congelación LOREG activa hasta ${freeze} — no se sugiere nada`)
    process.exit(0)
  }

  // Logged, not assumed. The answer is always Tier C for this class.
  const decision = decideAutomation({ kind: 'name-individual', namesIndividual: true })
  console.log(`[area-fit] política de automatización: ${decision.tier} — ${decision.reason}`)

  const officials: OfficialLike[] = JSON.parse(readFileSync(OFFICIALS, 'utf8')).officials
  const reportsRaw = JSON.parse(readFileSync(REPORTS, 'utf8'))
  const reports: ReportLike[] = reportsRaw.items || reportsRaw.reports || []

  let tasks = buildFitTasks(officials, reports, canonicalizeDepartment)
  if (only) tasks = tasks.filter((t) => t.officialSlug === only)

  const cfg = loadConfigFromEnv()
  const run = startRun('suggest-area-fit', {
    mode: dryRun ? 'dry-run' : 'live',
    backend: cfg.backend,
    model: cfg.claudeCodeModel ?? null,
    getStats: getRunStats,
  })

  console.log(
    `[area-fit] ${tasks.length} par(es) cargo×área` +
      `${only ? ` (filtrado a ${only})` : ''} · backend ${cfg.backend}`,
  )

  const rows: AreaFitRow[] = []
  const deterministic: FitTask[] = []
  resetBudget()

  for (const task of tasks) {
    // A pool we cannot judge never reaches the model: `no-consta` is a fact
    // about our sources, decided here, never something a model may claim.
    if (!needsModel(task)) {
      deterministic.push(task)
      run.skip('sin-cv-publicado')
      rows.push({ ...rowWithoutModel(task), requiresHumanApproval: true })
      continue
    }

    if (dryRun) {
      run.neverAttempt()
      continue
    }

    run.attempt()
    const response = await callLLM({
      systemPrompt: buildAreaFitSystemPrompt(),
      userPrompt: buildAreaFitUserPrompt(task),
      promptVersion: AREA_FIT_PROMPT_VERSION,
      schema: ResponseSchema,
      input: { slug: task.officialSlug, portfolio: task.portfolio },
    })

    // A null result is NOT "found nothing" — it means the backend is exhausted
    // or the circuit tripped. Naming the unjudged pair beats a silent all-clear.
    if (!response) {
      run.record('backend-null')
      console.warn(
        `[area-fit] ⚠ ${task.officialSlug} · ${task.portfolio} — el backend no respondió`,
      )
      continue
    }

    try {
      rows.push({ ...rowFromResponse(task, response), requiresHumanApproval: true })
      run.judge()
      run.record(`formacion:${response.formacion.value}`)
      run.record(`experiencia:${response.experiencia.value}`)
    } catch (err) {
      // A drifted index or an uncited "relacionada" kills its own row, not the run.
      run.record('rechazado-por-validador')
      console.warn(
        `[area-fit] ✗ ${task.officialSlug} · ${task.portfolio} — ${(err as Error).message}`,
      )
    }
  }

  if (dryRun) {
    console.log(
      `[area-fit] dry-run: ${tasks.length} pares, ` +
        `${deterministic.length} sin CV publicado (no-consta determinista), ` +
        `${tasks.length - deterministic.length} habrían llamado al modelo`,
    )
    run.finish({ write: false })
    return
  }

  mkdirSync(resolve('editorial'), { recursive: true })
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        _comment:
          'COLA DE REVISIÓN — no publicada. Cada fila lleva requiresHumanApproval: true y el ' +
          'esquema publicado rechaza ese campo. Se promociona con `npm run promote-area-fit`.',
        generatedAt: new Date().toISOString(),
        promptVersion: AREA_FIT_PROMPT_VERSION,
        backend: cfg.backend,
        rows,
      },
      null,
      2,
    ) + '\n',
  )

  const { manifest, findings } = run.finish()
  console.log(
    `[area-fit] ${rows.length} fila(s) en cola → ${OUT}\n` +
      `           intentadas ${manifest.attempted} · juzgadas ${manifest.judged} · ` +
      `nunca intentadas ${manifest.neverAttempted}`,
  )
  for (const f of findings)
    console.log(`           ${f.level === 'error' ? '✗' : '⚠'} ${f.message}`)
  console.log('[area-fit] nada se publica hasta que un curador lo promociona.')
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e) + '\n')
  process.exit(1)
})
