#!/usr/bin/env tsx
/**
 * Curator job runner — detached background process spawned by the
 * Vite middleware when the dashboard creates a transcribe-evidence
 * job.
 *
 *   tsx scripts/curator-job-runner.ts <jobId>
 *
 * Lifecycle:
 *   1. Purge finished/failed jobs older than JOB_RETENTION_MS.
 *   2. Read .curator-jobs/<jobId>.json (status: queued).
 *   3. Mark status=running, spawn transcribe-file.ts as a child.
 *   4. Periodically check the job file for status=cancelled — if
 *      found, kill the child + exit.
 *   5. On child exit: parse stdout JSON, mark status=done with
 *      result, OR status=failed with error.
 *
 * Single-flight is enforced by `findInProgressJobId()` in the curator-
 * jobs module: if a different job is already running, this runner
 * leaves status=queued so the next runner picks it up. (The middleware
 * spawns one runner per job; the queue surfaces in the dashboard.)
 *
 * Stdout / stderr are deliberately silent — the parent middleware
 * detached this process. Diagnostics land in the job file's
 * `progress` / `error` fields.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
// curator-jobs is a JS module with JSDoc types so it can be imported
// from both the dev-only Vite plugin (Node ESM, no TS loader) and from
// here under tsx. We re-declare the JobState shape locally for TS-side
// type-checking; the runtime values come from the JS module.
import {
  findInProgressJobId,
  loadJob,
  purgeOldJobs,
  writeJob,
} from '../src/scraper/curator-jobs.js'

interface JobResult {
  kind: 'transcript'
  sourceUrl: string
  title: string
  snippet: string
  fullTranscript: string
}

interface JobState {
  id: string
  action: 'transcribe-evidence'
  args: { filePath: string; expectedKind: 'audio' | 'video'; engine?: 'mlx' | 'local' | 'openai' }
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
  createdAt: string
  startedAt?: string
  finishedAt?: string
  progress?: string
  result?: JobResult
  error?: string
}

const TRANSCRIBE_SCRIPT = resolve('scripts/transcribe-file.ts')

function nowIso(): string {
  return new Date().toISOString()
}

function fail(state: JobState, msg: string): void {
  state.status = 'failed'
  state.error = msg.slice(0, 2000)
  state.finishedAt = nowIso()
  writeJob(state)
}

async function runTranscribe(state: JobState): Promise<void> {
  state.status = 'running'
  state.startedAt = nowIso()
  state.progress = 'spawning transcribe-file…'
  writeJob(state)

  const args = ['tsx', TRANSCRIBE_SCRIPT, '--path', state.args.filePath]
  if (state.args.engine) {
    args.push('--engine', state.args.engine)
  }
  const child = spawn('npx', args, {
    cwd: resolve('.'),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  })

  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString('utf8')
  })
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString('utf8')
    stderr += text
    // Surface the latest progress line from transcribe-file.ts so
    // the dashboard's poll has something to render.
    const lines = text.trim().split('\n').filter(Boolean)
    if (lines.length > 0) {
      const fresh = loadJob(state.id)
      if (!fresh || fresh.status === 'cancelled') return
      fresh.progress = lines[lines.length - 1].slice(0, 240)
      writeJob(fresh)
    }
  })

  // Cancellation poll — if the dashboard sets status=cancelled, kill
  // the child. We poll every 2s (cheap; the child is the heavy lifter).
  const cancelTimer = setInterval(() => {
    const fresh = loadJob(state.id)
    if (fresh?.status === 'cancelled') {
      clearInterval(cancelTimer)
      try {
        child.kill('SIGTERM')
      } catch {
        /* noop */
      }
      // Give it 5s, then SIGKILL.
      setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {
          /* noop */
        }
      }, 5000)
    }
  }, 2000)

  await new Promise<void>((resolveP) => {
    child.on('exit', (code) => {
      clearInterval(cancelTimer)
      const fresh = loadJob(state.id) ?? state
      if (fresh.status === 'cancelled') {
        fresh.finishedAt = nowIso()
        writeJob(fresh)
        resolveP()
        return
      }
      if (code !== 0) {
        fail(fresh, `transcribe-file exit ${code}: ${stderr.slice(-500) || '(no stderr)'}`)
        resolveP()
        return
      }
      // Parse the LAST stdout line as JSON.
      const lastLine = stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .pop()
      if (!lastLine) {
        fail(fresh, 'no JSON output from transcribe-file')
        resolveP()
        return
      }
      let result: unknown
      try {
        result = JSON.parse(lastLine)
      } catch (err) {
        fail(fresh, `failed to parse JSON output: ${(err as Error).message}`)
        resolveP()
        return
      }
      const r = result as Record<string, unknown>
      if (
        r.kind !== 'transcript' ||
        typeof r.sourceUrl !== 'string' ||
        typeof r.title !== 'string' ||
        typeof r.snippet !== 'string' ||
        typeof r.fullTranscript !== 'string'
      ) {
        fail(fresh, 'malformed JSON output')
        resolveP()
        return
      }
      fresh.status = 'done'
      fresh.finishedAt = nowIso()
      fresh.result = {
        kind: 'transcript',
        sourceUrl: r.sourceUrl as string,
        title: r.title as string,
        snippet: r.snippet as string,
        fullTranscript: r.fullTranscript as string,
      }
      fresh.progress = undefined
      writeJob(fresh)
      resolveP()
    })
  })
}

async function main(): Promise<void> {
  const jobId = process.argv[2]
  if (!jobId) {
    process.stderr.write('Usage: curator-job-runner <jobId>\n')
    process.exit(2)
  }
  // Best-effort cleanup of stale finished jobs.
  try {
    mkdirSync(resolve('.curator-jobs'), { recursive: true })
    purgeOldJobs()
  } catch {
    /* noop */
  }

  const state = loadJob(jobId)
  if (!state) {
    process.stderr.write(`[runner] job ${jobId} not found\n`)
    process.exit(1)
  }
  if (state.status !== 'queued') {
    // Could be cancelled before we picked it up, or already done by
    // a sibling runner in a race. Either way, nothing to do.
    process.exit(0)
  }

  // Single-flight: if another runner is mid-job, defer. The dashboard
  // sees status=queued and the user can wait.
  const inProgress = findInProgressJobId()
  if (inProgress && inProgress !== jobId) {
    state.progress = `waiting for job ${inProgress} to finish`
    writeJob(state)
    // Naive but sufficient: poll for 30 minutes max.
    const deadline = Date.now() + 30 * 60 * 1000
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5000))
      const stillBlocked = findInProgressJobId()
      if (!stillBlocked || stillBlocked === jobId) break
      // Re-check this job's status — if cancelled, exit cleanly.
      const fresh = loadJob(jobId)
      if (fresh?.status === 'cancelled') {
        fresh.finishedAt = nowIso()
        writeJob(fresh)
        process.exit(0)
      }
    }
  }

  if (state.action !== 'transcribe-evidence') {
    fail(state, `unsupported action: ${state.action}`)
    process.exit(0)
  }
  if (!existsSync(state.args.filePath)) {
    fail(state, `file vanished: ${state.args.filePath}`)
    process.exit(0)
  }

  try {
    await runTranscribe(state)
  } catch (err) {
    fail(state, (err as Error).message)
  }
  process.exit(0)
}

main().catch((err) => {
  process.stderr.write(`[runner] fatal: ${(err as Error).message}\n`)
  process.exit(1)
})
