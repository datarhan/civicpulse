/**
 * @file Curator job state — shared by the dev-only Vite middleware
 * (creates + reads jobs) and `scripts/curator-job-runner.ts` (executes
 * them). JSDoc-typed JS so it can be imported from both .js (the
 * Vite plugin, loaded under plain Node ESM) and .ts (via tsx) without
 * needing an extra build step.
 *
 * Pure module: file I/O is local-only (`.curator-jobs/` + tmpdir).
 * Path-validation guards are defence-in-depth — they refuse paths
 * outside the user's HOME and verify the file's magic-byte mime-type
 * matches the claimed kind so a `.txt` can't sneak through as `audio`.
 */
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve, sep } from 'node:path'

export const JOBS_DIR = resolve('.curator-jobs')

/** Max age of a finished job before the runner cleans it up on next start. */
export const JOB_RETENTION_MS = 24 * 60 * 60 * 1000

/** Refuse files larger than this (in bytes) — Whisper cost + memory cap. */
export const MAX_INPUT_BYTES = 500 * 1024 * 1024

/**
 * @typedef {'queued' | 'running' | 'done' | 'failed' | 'cancelled'} JobStatus
 *
 * @typedef {Object} JobResult
 * @property {'transcript'} kind
 * @property {string} sourceUrl
 * @property {string} title
 * @property {string} snippet
 * @property {string} fullTranscript
 *
 * @typedef {Object} TranscribeJobArgs
 * @property {string} filePath
 * @property {'audio' | 'video'} expectedKind
 * @property {'mlx' | 'local' | 'openai'} [engine]
 *
 * @typedef {Object} JobState
 * @property {string} id
 * @property {'transcribe-evidence'} action
 * @property {TranscribeJobArgs} args
 * @property {JobStatus} status
 * @property {string} createdAt
 * @property {string} [startedAt]
 * @property {string} [finishedAt]
 * @property {string} [progress]
 * @property {JobResult} [result]
 * @property {string} [error]
 */

const AUDIO_MIME_ALLOW = new Set([
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-wav',
  'audio/flac',
  'audio/ogg',
  'audio/opus',
  'audio/aac',
  'audio/x-m4a',
])
const VIDEO_MIME_ALLOW = new Set(['video/mp4', 'video/x-matroska', 'video/quicktime', 'video/webm'])

export class JobValidationError extends Error {
  /**
   * @param {string} msg
   * @param {number} [status]
   */
  constructor(msg, status = 400) {
    super(msg)
    this.name = 'JobValidationError'
    /** @type {number} HTTP status the middleware should map this to. */
    this.status = status
  }
}

/**
 * Synchronous magic-byte sniff via the system `file` command.
 * @param {string} absPath
 * @returns {string}
 */
function sniffMimeType(absPath) {
  const r = spawnSync('file', ['--mime-type', '--brief', absPath], { encoding: 'utf8' })
  if (r.status !== 0 || r.error) {
    throw new JobValidationError(
      `mime sniff failed: ${r.stderr || (r.error && r.error.message) || 'unknown'}`,
      500,
    )
  }
  return r.stdout.trim().toLowerCase()
}

/**
 * Validate a curator-supplied file path.
 *
 *   · Must be absolute.
 *   · Must exist.
 *   · `realpath()` (follows symlinks) must resolve under HOME.
 *   · Must not exceed MAX_INPUT_BYTES.
 *   · `file --mime-type` must match `expectedKind`.
 *
 * @param {string} input
 * @param {'audio' | 'video'} expectedKind
 * @returns {{realPath: string, mimeType: string, sizeBytes: number}}
 */
export function validateInputPath(input, expectedKind) {
  if (typeof input !== 'string' || !input.startsWith('/')) {
    throw new JobValidationError('path must be absolute', 400)
  }
  if (!existsSync(input)) {
    throw new JobValidationError(`file not found: ${input}`, 404)
  }
  let realPath
  try {
    realPath = realpathSync(input)
  } catch (err) {
    throw new JobValidationError(`realpath failed: ${err.message}`, 400)
  }
  const home = homedir()
  const homeWithSep = home.endsWith(sep) ? home : home + sep
  if (!realPath.startsWith(homeWithSep) && realPath !== home) {
    throw new JobValidationError(`path outside HOME (${home}): ${realPath}`, 403)
  }
  let st
  try {
    st = statSync(realPath)
  } catch (err) {
    throw new JobValidationError(`stat failed: ${err.message}`, 400)
  }
  if (!st.isFile()) {
    throw new JobValidationError(`not a regular file: ${realPath}`, 400)
  }
  if (st.size > MAX_INPUT_BYTES) {
    throw new JobValidationError(`file too large: ${st.size} bytes > ${MAX_INPUT_BYTES}`, 413)
  }
  const mimeType = sniffMimeType(realPath)
  const allow = expectedKind === 'audio' ? AUDIO_MIME_ALLOW : VIDEO_MIME_ALLOW
  if (!allow.has(mimeType)) {
    throw new JobValidationError(`mime-type ${mimeType} not allowed for kind=${expectedKind}`, 415)
  }
  return { realPath, mimeType, sizeBytes: st.size }
}

// ─── Job ID + path helpers ─────────────────────────────────────────────────

export const JOB_ID_RE = /^[a-z0-9]{16,40}$/
const JOB_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** @returns {string} */
export function newJobId() {
  let out = ''
  for (let i = 0; i < 24; i++) {
    out += JOB_ID_ALPHABET[Math.floor(Math.random() * JOB_ID_ALPHABET.length)]
  }
  return out
}

/**
 * @param {string} id
 * @returns {string}
 */
export function jobFilePath(id) {
  if (!JOB_ID_RE.test(id)) {
    throw new JobValidationError(`invalid job id: ${id}`, 400)
  }
  return join(JOBS_DIR, `${id}.json`)
}

// ─── Read / write ──────────────────────────────────────────────────────────

/**
 * @param {string} id
 * @returns {JobState | null}
 */
export function loadJob(id) {
  const path = jobFilePath(id)
  if (!existsSync(path)) return null
  try {
    return /** @type {JobState} */ (JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    return null
  }
}

/**
 * @param {JobState} state
 */
export function writeJob(state) {
  mkdirSync(JOBS_DIR, { recursive: true })
  const path = jobFilePath(state.id)
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8')
  // Atomic on POSIX: rename within the same filesystem. The middleware's
  // GET handler always sees a complete JSON object.
  renameSync(tmp, path)
}

/**
 * Remove finished/failed/cancelled jobs whose finishedAt is older
 * than `JOB_RETENTION_MS`.
 * @param {number} [now]
 * @returns {number}
 */
export function purgeOldJobs(now = Date.now()) {
  if (!existsSync(JOBS_DIR)) return 0
  let removed = 0
  for (const name of readdirSync(JOBS_DIR)) {
    if (!name.endsWith('.json')) continue
    const id = name.slice(0, -5)
    if (!JOB_ID_RE.test(id)) continue
    const job = loadJob(id)
    if (!job) continue
    if (job.status === 'queued' || job.status === 'running') continue
    if (!job.finishedAt) continue
    const finished = Date.parse(job.finishedAt)
    if (!Number.isFinite(finished)) continue
    if (now - finished > JOB_RETENTION_MS) {
      try {
        rmSync(jobFilePath(id))
        removed += 1
      } catch {
        /* noop */
      }
    }
  }
  return removed
}

/**
 * Find any in-progress (status='running') job whose startedAt is recent.
 * Used by the runner to enforce the single-flight invariant.
 * @param {number} [now]
 * @param {number} [staleMs]
 * @returns {string | null}
 */
export function findInProgressJobId(now = Date.now(), staleMs = 30 * 60 * 1000) {
  if (!existsSync(JOBS_DIR)) return null
  for (const name of readdirSync(JOBS_DIR)) {
    if (!name.endsWith('.json')) continue
    const id = name.slice(0, -5)
    if (!JOB_ID_RE.test(id)) continue
    const job = loadJob(id)
    if (!job) continue
    if (job.status !== 'running') continue
    const startedMs = job.startedAt ? Date.parse(job.startedAt) : 0
    if (now - startedMs > staleMs) continue
    return id
  }
  return null
}

/**
 * Return all jobs, freshest first. Useful for the GET /api/curator/jobs
 * list endpoint — the dashboard uses this for queue display.
 * @returns {JobState[]}
 */
export function listJobs() {
  if (!existsSync(JOBS_DIR)) return []
  /** @type {JobState[]} */
  const out = []
  for (const name of readdirSync(JOBS_DIR)) {
    if (!name.endsWith('.json')) continue
    const id = name.slice(0, -5)
    if (!JOB_ID_RE.test(id)) continue
    const job = loadJob(id)
    if (job) out.push(job)
  }
  out.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  return out
}
