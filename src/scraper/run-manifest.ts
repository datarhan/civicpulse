/**
 * Run manifests — "did this run actually do work?"
 *
 * Every scraper and LLM pass here already prints progress, but progress is
 * self-reported: a script can only tell you what it *believes* happened. That
 * belief has been wrong in every expensive way this repo has seen.
 *
 *   · A verdict pass reported `re-judged 1017 · kept 1017` having made zero
 *     successful LLM calls. Its own counters were internally consistent; the
 *     backend had simply stopped answering, and "the model agreed with
 *     everything" and "the model was never asked" printed identically.
 *   · A retrieval bug made every similarity score 0, so 653 claims were
 *     reported as having no candidates — indistinguishable from a corpus that
 *     genuinely held nothing relevant.
 *   · A nightly scrape ran green for weeks while committing nothing, because
 *     "nothing changed" and "nothing ran" collapsed into the same exit code.
 *
 * The shared shape of all three: a run that did nothing looked exactly like a
 * run with nothing to do. A manifest separates them by recording the four
 * counts that must add up — attempted, judged, never-attempted, skipped —
 * alongside LLM traffic measured one layer below the script, in the client
 * itself, where the script's beliefs cannot reach.
 *
 * `assessManifest` is pure and is the part under test. Rule 2 in
 * docs/DATA_INTEGRITY.md ("a run must prove it did work") is what this
 * implements.
 */

import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import type { RunStats } from '../llm/client'

export const MANIFEST_DIR = '.run-manifests'

export interface RunManifest {
  /** npm script / CLI name, e.g. `verify-pleno-claims-engine`. */
  script: string
  runId: string
  startedAt: string
  endedAt: string
  /** Free-form mode tag so `--base` and default runs are distinguishable. */
  mode?: string
  backend: string | null
  model: string | null
  /** Items the run set out to process. */
  attempted: number
  /** Items a judgement was actually obtained for. */
  judged: number
  /** Items where the model was never consulted (no candidates, policy skip). */
  neverAttempted: number
  /** reason → count. Errors, missing records, anything that aborted an item. */
  skipped: Record<string, number>
  /** Domain-specific results, e.g. `{retracted: 40, kept: 12}`. */
  outcome: Record<string, number>
  llm: RunStats
  exitCode: number
}

export type FindingLevel = 'error' | 'warn'

export interface ManifestFinding {
  level: FindingLevel
  code: string
  message: string
}

/**
 * Consecutive zero-token failures that mean "the backend is refusing", not
 * "these items are hard". Set low: the real incident produced 189 in a row, and
 * there is no legitimate reason for a handful of calls to be rejected before
 * the prompt is read.
 */
export const ZERO_TOKEN_ALARM = 5

/** Above this share of never-attempted items, coverage is the story. */
export const NEVER_ATTEMPTED_WARN = 0.5

/** Above this share of failed calls, the backend is degraded. */
export const FAILURE_RATE_WARN = 0.25

export function assessManifest(m: RunManifest): ManifestFinding[] {
  const out: ManifestFinding[] = []
  const skippedTotal = Object.values(m.skipped).reduce((a, b) => a + b, 0)

  // The headline failure: work was attempted and nothing came of it. This is
  // the shape that shipped as success three separate times.
  if (m.attempted > 0 && m.judged === 0) {
    out.push({
      level: 'error',
      code: 'no-work',
      message:
        `${m.script} processed ${m.attempted} item(s) and judged NONE. ` +
        `A run like this is indistinguishable from "everything already agreed" ` +
        `unless it is flagged. Check retrieval and the backend.`,
    })
  }

  // No tokens read, no money spent, still "failed" — the backend refused before
  // it looked at the prompt.
  if (m.llm.zeroTokenFailures >= ZERO_TOKEN_ALARM) {
    out.push({
      level: 'error',
      code: 'backend-refusing',
      message:
        `${m.llm.zeroTokenFailures} call(s) failed having consumed 0 tokens and $0. ` +
        `The backend refused instantly (rate limit, session lock, dead binary) — ` +
        `the work was never attempted, not merely unsuccessful.`,
    })
  }

  // Claimed judgements with no traffic to back them.
  if (m.judged > 0 && m.llm.calls === 0 && m.llm.cacheHits === 0) {
    out.push({
      level: 'error',
      code: 'judged-without-calls',
      message:
        `${m.script} reports ${m.judged} judged item(s) but made 0 LLM calls and ` +
        `hit 0 cache entries. The counts cannot both be true.`,
    })
  }

  // The four buckets must account for every attempted item.
  const accounted = m.judged + m.neverAttempted + skippedTotal
  if (m.attempted > 0 && accounted !== m.attempted) {
    out.push({
      level: 'warn',
      code: 'unaccounted-items',
      message:
        `judged ${m.judged} + never-attempted ${m.neverAttempted} + skipped ${skippedTotal} ` +
        `= ${accounted}, but ${m.attempted} were attempted. ${Math.abs(m.attempted - accounted)} item(s) ` +
        `are unaccounted for.`,
    })
  }

  if (m.attempted > 0 && m.neverAttempted / m.attempted > NEVER_ATTEMPTED_WARN) {
    const pct = Math.round((m.neverAttempted / m.attempted) * 100)
    out.push({
      level: 'warn',
      code: 'low-coverage',
      message:
        `${pct}% of items (${m.neverAttempted}/${m.attempted}) never reached the model. ` +
        `Usually retrieval, not the corpus.`,
    })
  }

  if (m.llm.calls > 0 && m.llm.failed / m.llm.calls > FAILURE_RATE_WARN) {
    const pct = Math.round((m.llm.failed / m.llm.calls) * 100)
    out.push({
      level: 'warn',
      code: 'high-failure-rate',
      message: `${pct}% of LLM calls failed (${m.llm.failed}/${m.llm.calls}).`,
    })
  }

  if (m.llm.shortCircuited > 0) {
    out.push({
      level: 'warn',
      code: 'circuit-tripped',
      message:
        `the circuit breaker opened and short-circuited ${m.llm.shortCircuited} call(s). ` +
        `Results are partial by design — re-run once the backend recovers.`,
    })
  }

  return out
}

export function formatManifest(m: RunManifest): string {
  const skipped = Object.entries(m.skipped)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ')
  const outcome = Object.entries(m.outcome)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ')
  return [
    `${m.script}${m.mode ? ` (${m.mode})` : ''} · ${m.backend ?? 'no-backend'}${m.model ? `/${m.model}` : ''}`,
    `  attempted ${m.attempted} · judged ${m.judged} · never-attempted ${m.neverAttempted}` +
      (skipped ? ` · skipped ${skipped}` : ''),
    outcome ? `  outcome: ${outcome}` : '',
    `  llm: ${m.llm.calls} calls (${m.llm.ok} ok, ${m.llm.failed} failed, ` +
      `${m.llm.zeroTokenFailures} zero-token) · ${m.llm.cacheHits} cache hits · ` +
      `${m.llm.tokens.toLocaleString('en-US')} tokens · $${m.llm.costUSD.toFixed(4)}`,
  ]
    .filter(Boolean)
    .join('\n')
}

// ─── Builder ────────────────────────────────────────────────────────────────

export interface RunRecorder {
  attempt(n?: number): void
  judge(n?: number): void
  neverAttempt(n?: number): void
  skip(reason: string, n?: number): void
  record(key: string, n?: number): void
  /** Finalise, write to disk, and return the manifest (plus its findings). */
  finish(opts?: { exitCode?: number; write?: boolean }): {
    manifest: RunManifest
    findings: ManifestFinding[]
  }
}

/**
 * `getStats` is injected so the recorder stays testable without importing the
 * live client, and so a caller can snapshot traffic for one phase of a run.
 */
export function startRun(
  script: string,
  opts: {
    mode?: string
    backend?: string | null
    model?: string | null
    getStats: () => RunStats
    now?: () => Date
  },
): RunRecorder {
  const now = opts.now ?? (() => new Date())
  const startedAt = now().toISOString()
  const runId = `${startedAt.replace(/[:.]/g, '-')}`
  let attempted = 0
  let judged = 0
  let neverAttempted = 0
  const skipped: Record<string, number> = {}
  const outcome: Record<string, number> = {}

  return {
    attempt: (n = 1) => {
      attempted += n
    },
    judge: (n = 1) => {
      judged += n
    },
    neverAttempt: (n = 1) => {
      neverAttempted += n
    },
    skip: (reason, n = 1) => {
      skipped[reason] = (skipped[reason] ?? 0) + n
    },
    record: (key, n = 1) => {
      outcome[key] = (outcome[key] ?? 0) + n
    },
    finish: (fin = {}) => {
      const manifest: RunManifest = {
        script,
        runId,
        startedAt,
        endedAt: now().toISOString(),
        mode: opts.mode,
        backend: opts.backend ?? process.env.LLM_BACKEND ?? null,
        model: opts.model ?? null,
        attempted,
        judged,
        neverAttempted,
        skipped,
        outcome,
        llm: opts.getStats(),
        exitCode: fin.exitCode ?? 0,
      }
      const findings = assessManifest(manifest)
      if (fin.write !== false) writeManifest(manifest)
      return { manifest, findings }
    },
  }
}

// ─── I/O ────────────────────────────────────────────────────────────────────

export function writeManifest(m: RunManifest, dir = MANIFEST_DIR): string {
  const abs = resolve(dir)
  mkdirSync(abs, { recursive: true })
  const path = join(abs, `${m.script}-${m.runId}.json`)
  writeFileSync(path, JSON.stringify(m, null, 2) + '\n')
  return path
}

export function readManifests(dir = MANIFEST_DIR): RunManifest[] {
  const abs = resolve(dir)
  if (!existsSync(abs)) return []
  const out: RunManifest[] = []
  for (const f of readdirSync(abs)) {
    if (!f.endsWith('.json')) continue
    try {
      out.push(JSON.parse(readFileSync(join(abs, f), 'utf8')) as RunManifest)
    } catch {
      process.stderr.write(`[run-manifest] skipping unreadable manifest ${f}\n`)
    }
  }
  return out.sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}
