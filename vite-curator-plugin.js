/**
 * Vite dev-server plugin that mounts two endpoints for the local-only
 * curator dashboard:
 *
 *   POST /api/curator/run     — execute one allowlisted CLI
 *   POST /api/curator/commit  — git add + commit + push pleno-findings.json
 *
 * The plugin is registered ONLY when `mode === 'development'` so the
 * production build never ships these endpoints. The dashboard route is
 * guarded the same way at the React layer.
 *
 * Threat model: this plugin spawns the curator's own CLIs from a browser
 * request. The browser is the curator's local Vite dev server, so the
 * trust boundary is the laptop's OS login + repo access. Defence-in-depth
 * is layered:
 *
 *   1. allowlist — only three actions, each tied to a specific npm script
 *   2. zod-validated args — strict, additionalProperties:false, length-bounded
 *   3. argv-array execution via child_process.execFile — no shell, no
 *      template-literal command construction
 *   4. shell-metachar regex reject on every string arg as belt-and-suspenders
 *   5. Origin header lock to localhost:5173 / 127.0.0.1:5173
 *   6. POST only · 10 KB body cap · 30 s per-CLI timeout · single-flight queue
 *
 * Returns { exitCode, stdout, stderr, durationMs } on success, or a
 * structured error JSON on validation failures.
 */
import { execFile, spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
// curator-jobs is a JSDoc-typed JS module so plain Node ESM can
// import it from the plugin. The CLI runner imports the same file
// via tsx.
import {
  JOB_ID_RE,
  listJobs,
  loadJob,
  newJobId,
  validateInputPath,
  writeJob,
  JobValidationError,
} from './src/scraper/curator-jobs.js'

const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  // IPv6 loopback — some macOS setups resolve `localhost` to ::1 first,
  // which the browser then surfaces as the page origin. Treat it as
  // equivalent to 127.0.0.1.
  'http://[::1]:5173',
])

/**
 * Validate the Origin header against the allowlist.
 *   · POST/DELETE: Origin MUST be present + on the allowlist (CSRF guard).
 *   · GET: Origin MAY be missing (browsers omit it on some same-origin
 *     GETs). When present, it must still be on the allowlist.
 *
 * Returns null when allowed, or a short reason string when refused.
 */
function checkOrigin(req) {
  const origin = req.headers.origin
  if (origin) {
    return ALLOWED_ORIGINS.has(origin) ? null : 'origin not allowed'
  }
  // Origin absent → only acceptable for GET (idempotent + read-only).
  if (req.method === 'GET') return null
  return 'origin header required'
}
// 32 KB headroom for the `draft-finding` extra-evidence payload
// (≤10 snippets × ≤1500 chars + JSON wrapping). Other actions stay
// well under this.
const MAX_BODY_BYTES = 32 * 1024
// 60s gives the LLM-backed `draft-finding` action enough headroom on
// gemini cold starts (the CLI shells out to `gemini` which spins up
// a Node subprocess of its own). Other actions complete in 1-5s.
const CLI_TIMEOUT_MS = 60_000

// Reject any user-supplied string containing characters that would let a
// theoretical shell-injection succeed if execFile ever changed to exec.
// Belt + suspenders. Newlines too — argv arrays don't need them and they
// confuse downstream commit messages.
const SHELL_METACHAR_RE = /[;&|`$(){}<>\n\r]/

const SafeStringShort = z
  .string()
  .min(1)
  .max(500)
  .refine((s) => !SHELL_METACHAR_RE.test(s), {
    message: 'string contains forbidden characters',
  })
const SafeStringLong = z
  .string()
  .min(1)
  .max(2000)
  .refine((s) => !SHELL_METACHAR_RE.test(s), {
    message: 'string contains forbidden characters',
  })
const ClaimIdRe = /^[a-z0-9-]{3,64}$/
const FindingIdRe = /^f-[a-z0-9-]{3,80}$/
const PartyEnum = z.enum(['PSOE', 'PP', 'VOX', 'Compromís', 'Ciudadanos', 'Otro'])
const SeverityEnum = z.enum(['informational', 'notable', 'critical'])

// Files the commit endpoint is allowed to `git add`. Generalized from
// the original hard-coded pleno-findings.json so the promise-review
// dashboard can also commit promises.json — but strictly allowlisted so
// a crafted request body can never stage an arbitrary path (defence in
// depth alongside the argv-array `git add`, which already blocks shell
// tricks).
const COMMIT_FILE_ALLOWLIST = ['public/data/pleno-findings.json', 'public/data/promises.json']

// Per-evidence ref the curator opts in to publishing as
// `crossChecked[]` on the finding. Kind is restricted to the three
// curator-only values; the verifier-only kinds (tender / bdns / etc.)
// flow through the deterministic + LLM pipelines, never the dashboard.
const CuratorRefKind = z.enum(['press', 'document', 'transcript'])
const ExtraCorroborationEntry = z
  .object({
    kind: CuratorRefKind,
    ref: z.string().url().max(2000),
    snippet: z
      .string()
      .min(1)
      .max(240)
      .refine((s) => !SHELL_METACHAR_RE.test(s), {
        message: 'snippet contains forbidden characters',
      }),
  })
  .strict()

const ActionSchemas = {
  'promote-claim': z
    .object({
      claimIds: z.array(z.string().regex(ClaimIdRe)).min(1).max(10),
      title: SafeStringShort,
      summary: SafeStringLong,
      severity: SeverityEnum.optional(),
      relatedPromiseId: z
        .string()
        .regex(/^[a-z0-9-]{3,80}$/)
        .optional(),
      // Optional curator-supplied corroboration entries (≤10). Each
      // entry lands in `crossChecked[]` on the published finding.
      extraCorroboration: z.array(ExtraCorroborationEntry).max(10).optional(),
      force: z.boolean().optional(),
    })
    .strict(),
  'finding-reply': z
    .object({
      findingId: z.string().regex(FindingIdRe),
      party: PartyEnum,
      quote: SafeStringLong.refine((s) => s.length >= 20, {
        message: 'quote must be ≥20 chars (verbatim)',
      }),
      sourceUrl: z.string().url().optional(),
      respondedAt: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    })
    .strict(),
  'refresh-gh-issues': z.object({}).strict(),
  'refresh-curate-queue': z.object({}).strict(),
  // «Encaje declarado» — promote / reject / retract ONE (official × área) row.
  // Names a living person, so `curator` is required on the publish path and the
  // CLI refuses without it; reject and retract only ever remove.
  'promote-area-fit': z
    .object({
      official: z.string().regex(/^[a-z0-9-]{3,60}$/),
      area: z.string().min(2).max(120),
      action: z.enum(['publish', 'reject', 'retract']),
      curator: z.string().min(2).max(80).optional(),
      note: z.string().max(400).optional(),
    })
    .strict(),
  // Draft a title + summary via LLM for one bundle. Read-only — does
  // not write to pleno-findings.json. Output is the LLM's JSON; the
  // dashboard parses it and pre-fills the editorial form. Optional
  // `extraEvidence` carries curator-added URL/PDF snippets so the
  // re-draft uses them as additional context.
  'draft-finding': z
    .object({
      plenoId: z.string().regex(/^[a-z0-9-]{3,40}$/),
      topic: z.string().regex(/^[a-z-]{3,40}$/),
      extraEvidence: z
        .array(
          z
            .object({
              kind: z.enum(['url', 'pdf']),
              sourceUrl: z.string().url().optional(),
              title: z.string().max(300).optional(),
              snippet: z.string().min(20).max(1500),
            })
            .strict(),
        )
        .max(10)
        .optional(),
    })
    .strict(),
  // Archive a (plenoId, topic) bundle. Curator marks it "reviewed,
  // unclear, no finding". Writes to public/data/curator-archive.json.
  'archive-bundle': z
    .object({
      plenoId: z.string().regex(/^[a-z0-9-]{3,40}$/),
      topic: z.string().regex(/^[a-z-]{3,40}$/),
      reason: z
        .string()
        .max(500)
        .refine((s) => !SHELL_METACHAR_RE.test(s), {
          message: 'reason contains forbidden characters',
        })
        .optional(),
    })
    .strict(),
  // Un-archive a previously archived bundle.
  'unarchive-bundle': z
    .object({
      plenoId: z.string().regex(/^[a-z0-9-]{3,40}$/),
      topic: z.string().regex(/^[a-z-]{3,40}$/),
    })
    .strict(),
  // Fetch a URL, extract text via cheerio (HTML) or pdftotext (PDF).
  // Returns {kind, sourceUrl, title, snippet} JSON the dashboard adds
  // to the modal's evidence list. SSRF-guarded against private IPs.
  'fetch-url-evidence': z
    .object({
      url: z
        .string()
        .url()
        .max(2000)
        .refine((s) => !SHELL_METACHAR_RE.test(s), {
          message: 'url contains forbidden characters',
        }),
    })
    .strict(),
  // Enroll a councillor's voiceprint from a public URL (Instagram /
  // YouTube / direct mp3). Spawns yt-dlp + ffmpeg + speechbrain via
  // the enroll-voice CLI. Output JSON lands in
  // .voiceprints/<slug>.f32 + index.json — both gitignored.
  'enroll-voice': z
    .object({
      slug: z.string().regex(/^[a-z0-9-]{3,80}$/),
      audioUrl: z
        .string()
        .url()
        .max(2000)
        .refine((s) => !SHELL_METACHAR_RE.test(s), {
          message: 'url contains forbidden characters',
        }),
      force: z.boolean().optional(),
    })
    .strict(),
  // Remove a voiceprint (the .f32 vector + the index entry). Used
  // by the dashboard's "Re-enroll" / "Clear" affordance.
  'delete-voiceprint': z
    .object({
      slug: z.string().regex(/^[a-z0-9-]{3,80}$/),
    })
    .strict(),
  // Apply a curator override to a single SPEAKER_NN cluster in
  // pleno-speakers/<plenoId>.json. Used by the dashboard's voice-id
  // assignment review surface to correct medium/low-confidence
  // matches before the LLM extractor consumes them.
  'override-speaker-assignment': z
    .object({
      plenoId: z.string().regex(/^[a-z0-9]{3,40}$/),
      speaker: z.string().regex(/^SPEAKER_\d{1,3}$/),
      mode: z.enum(['assign', 'clear', 'remove-override']),
      slug: z
        .string()
        .regex(/^[a-z0-9-]{3,80}$/)
        .optional(),
      reason: z.string().min(1).max(500).optional(),
      by: z.string().min(1).max(80).optional(),
    })
    .strict()
    .refine((d) => d.mode !== 'assign' || typeof d.slug === 'string', {
      message: "mode='assign' requires slug",
    })
    .refine((d) => d.mode === 'assign' || !d.slug, {
      message: 'slug only allowed with mode=assign',
    }),
  // ─── Promise auto-curator review queue (Plan B) ──────────────────────
  // Apply one auto-curator draft → promises.json. The apply-promise-draft
  // CLI does the read→validate→mutate→re-validate→write + LOREG freeze
  // fail-closed; the dashboard only invokes it. `draftId` is the
  // auto-curator's `dnp-<slug>` (new-promise) or `dsc-<slug>` (status-change) identifier.
  'apply-promise-draft': z
    .object({
      draftId: z.string().regex(/^(?:dnp|dsc)-[a-z0-9-]{3,120}$/),
    })
    .strict(),
  // Reject a draft → the CLI moves it to the local-only review archive.
  // Optional curator reason (short, shell-metachar-guarded like every
  // other free-text arg in this file).
  'reject-promise-draft': z
    .object({
      draftId: z.string().regex(/^(?:dnp|dsc)-[a-z0-9-]{3,120}$/),
      reason: SafeStringShort.optional(),
    })
    .strict(),
  // Retract an already auto-published promise from promises.json (the CLI
  // tombstones it in the archive). Keyed by the published promise id.
  'retract-promise': z
    .object({
      promiseId: z.string().regex(/^[a-z0-9-]{3,80}$/),
    })
    .strict(),
  // Mark an auto-published promise as human-reviewed (clears the
  // pending-review badge). Keyed by the published promise id.
  'mark-reviewed-promise': z
    .object({
      promiseId: z.string().regex(/^[a-z0-9-]{3,80}$/),
    })
    .strict(),
}

/** Schema for the `POST /api/curator/jobs` body — separate from
 *  ActionSchemas because /jobs is a different endpoint. */
const TranscribeEvidenceJobSchema = z
  .object({
    action: z.literal('transcribe-evidence'),
    args: z
      .object({
        filePath: z
          .string()
          .min(3)
          .max(2000)
          .refine((s) => !SHELL_METACHAR_RE.test(s), {
            message: 'filePath contains forbidden characters',
          }),
        expectedKind: z.enum(['audio', 'video']),
        engine: z.enum(['mlx', 'local', 'openai']).optional(),
      })
      .strict(),
  })
  .strict()

/**
 * Schema for the `POST /api/curator/commit` body. `message` is the commit
 * message; optional `files` selects which allowlisted snapshot(s) to stage
 * (defaults to pleno-findings.json for back-compat). Every entry must be on
 * COMMIT_FILE_ALLOWLIST — the refine rejects anything else with a 400, so a
 * crafted body can never `git add` an arbitrary path.
 */
const CommitBodySchema = z
  .object({
    message: SafeStringLong.refine((s) => s.length >= 5, {
      message: 'message must be ≥5 chars',
    }),
    files: z
      .array(
        z.string().refine((f) => COMMIT_FILE_ALLOWLIST.includes(f), {
          message: 'file not on commit allowlist',
        }),
      )
      .min(1)
      .max(COMMIT_FILE_ALLOWLIST.length)
      .optional(),
  })
  .strict()

/**
 * Build the argv array for a validated payload. The script names are
 * hard-coded; the dynamic part is only data, never command structure.
 */
function buildArgv(action, args) {
  switch (action) {
    case 'promote-claim': {
      const argv = ['run', 'promote-claim', '--']
      for (const id of args.claimIds) argv.push(id)
      argv.push('--title', args.title, '--summary', args.summary)
      if (args.severity) argv.push('--severity', args.severity)
      if (args.relatedPromiseId) argv.push('--related-promise', args.relatedPromiseId)
      if (Array.isArray(args.extraCorroboration) && args.extraCorroboration.length > 0) {
        argv.push('--extra-corroboration', JSON.stringify(args.extraCorroboration))
      }
      if (args.force) argv.push('--force')
      return argv
    }
    case 'finding-reply': {
      const argv = ['run', 'finding-reply', '--', args.findingId, args.party, args.quote]
      if (args.sourceUrl) argv.push(args.sourceUrl)
      if (args.respondedAt) argv.push(args.respondedAt)
      return argv
    }
    case 'refresh-gh-issues': {
      return ['run', 'refresh:gh-issues']
    }
    case 'refresh-curate-queue': {
      return ['run', 'refresh:curate-queue']
    }
    case 'promote-area-fit': {
      const argv = ['run', 'promote-area-fit', '--', '--official', args.official, '--area', args.area]
      if (args.action === 'reject') argv.push('--reject')
      else if (args.action === 'retract') argv.push('--retract', '--curator', args.curator)
      else {
        argv.push('--curator', args.curator)
        if (args.note) argv.push('--note', args.note)
      }
      return argv
    }
    case 'draft-finding': {
      const argv = ['run', 'draft-finding', '--', '--pleno-id', args.plenoId, '--topic', args.topic]
      if (Array.isArray(args.extraEvidence) && args.extraEvidence.length > 0) {
        argv.push('--extra-evidence-json', JSON.stringify(args.extraEvidence))
      }
      return argv
    }
    case 'archive-bundle': {
      const argv = ['run', 'archive-bundle', '--', args.plenoId, args.topic]
      if (typeof args.reason === 'string' && args.reason.trim()) {
        argv.push(args.reason.trim())
      }
      return argv
    }
    case 'unarchive-bundle': {
      return ['run', 'unarchive-bundle', '--', args.plenoId, args.topic]
    }
    case 'fetch-url-evidence': {
      return ['run', 'fetch-url-evidence', '--', args.url]
    }
    case 'enroll-voice': {
      const argv = ['run', 'enroll-voice', '--', '--slug', args.slug, '--url', args.audioUrl]
      if (args.force) argv.push('--force')
      return argv
    }
    case 'delete-voiceprint': {
      return ['run', 'delete-voiceprint', '--', '--slug', args.slug]
    }
    case 'override-speaker-assignment': {
      const argv = [
        'run',
        'override-speaker-assignment',
        '--',
        '--pleno-id',
        args.plenoId,
        '--speaker',
        args.speaker,
      ]
      if (args.mode === 'assign') argv.push('--slug', args.slug)
      else if (args.mode === 'clear') argv.push('--clear')
      else if (args.mode === 'remove-override') argv.push('--remove-override')
      if (args.reason) argv.push('--reason', args.reason)
      if (args.by) argv.push('--by', args.by)
      return argv
    }
    case 'apply-promise-draft': {
      return ['run', 'apply-promise-draft', '--', args.draftId]
    }
    case 'reject-promise-draft': {
      const argv = ['run', 'apply-promise-draft', '--', '--reject', args.draftId]
      if (args.reason) argv.push(args.reason)
      return argv
    }
    case 'retract-promise': {
      return ['run', 'apply-promise-draft', '--', '--retract', args.promiseId]
    }
    case 'mark-reviewed-promise': {
      return ['run', 'apply-promise-draft', '--', '--mark-reviewed', args.promiseId]
    }
    default:
      throw new Error(`unknown action ${action}`)
  }
}

function readBodyWithLimit(req, maxBytes) {
  return new Promise((resolveP, reject) => {
    let received = 0
    let tooLarge = false
    const chunks = []
    req.on('data', (chunk) => {
      if (tooLarge) return // discard further bytes; reject already fired
      received += chunk.length
      if (received > maxBytes) {
        tooLarge = true
        // Reject synchronously so the handler can send 413 NOW, while the
        // socket is still writable. We deliberately do NOT call req.destroy()
        // here — destroying the socket cuts off our own response. Letting
        // the request stream finish naturally is harmless: the handler has
        // already replied and ignores the late 'end' event.
        reject(Object.assign(new Error('payload too large'), { httpStatus: 413 }))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (!tooLarge) resolveP(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', reject)
  })
}

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

/**
 * Single-flight queue: ensures two simultaneous Run clicks serialise. We
 * use a chained promise to coordinate — the second request awaits the
 * first's settlement before its own execFile runs.
 */
let inflight = Promise.resolve()
function enqueue(work) {
  const next = inflight.then(work, work)
  // Don't propagate errors to the chain — every queued caller gets its own.
  inflight = next.catch(() => undefined)
  return next
}

function runCli(argv, cwd) {
  return new Promise((resolveP) => {
    const startedAt = Date.now()
    const child = execFile(
      'npm',
      argv,
      {
        cwd,
        timeout: CLI_TIMEOUT_MS,
        maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, npm_config_color: 'false' },
      },
      (err, stdout, stderr) => {
        const durationMs = Date.now() - startedAt
        if (err && err.killed) {
          resolveP({
            exitCode: 124,
            stdout: String(stdout ?? ''),
            stderr: `[curator] CLI killed after ${CLI_TIMEOUT_MS}ms timeout`,
            durationMs,
            timedOut: true,
          })
          return
        }
        const exitCode = err && typeof err.code === 'number' ? err.code : err ? 1 : 0
        resolveP({
          exitCode,
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? ''),
          durationMs,
          timedOut: false,
        })
      },
    )
    // Defensive: if execFile fails to spawn at all.
    child.on('error', (err) => {
      resolveP({
        exitCode: 1,
        stdout: '',
        stderr: `[curator] spawn failed: ${err.message}`,
        durationMs: Date.now() - startedAt,
        timedOut: false,
      })
    })
  })
}

async function handleRun(req, res, cwd) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method not allowed' })
    return
  }
  {
    const originErr = checkOrigin(req)
    if (originErr) {
      sendJson(res, 403, { error: originErr })
      return
    }
  }
  let raw
  try {
    raw = await readBodyWithLimit(req, MAX_BODY_BYTES)
  } catch (err) {
    sendJson(res, err && err.httpStatus === 413 ? 413 : 400, {
      error: err?.message || 'bad request',
    })
    return
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    sendJson(res, 400, { error: 'invalid JSON body' })
    return
  }
  if (!parsed || typeof parsed !== 'object') {
    sendJson(res, 400, { error: 'body must be an object' })
    return
  }
  const action = parsed.action
  const schema = ActionSchemas[action]
  if (!schema) {
    sendJson(res, 400, { error: `unknown action: ${action}` })
    return
  }
  const argsParse = schema.safeParse(parsed.args ?? {})
  if (!argsParse.success) {
    sendJson(res, 400, {
      error: 'invalid args',
      issues: argsParse.error.issues.map((i) => ({ path: i.path, message: i.message })),
    })
    return
  }
  let argv
  try {
    argv = buildArgv(action, argsParse.data)
  } catch (err) {
    sendJson(res, 500, { error: err.message })
    return
  }
  const result = await enqueue(() => runCli(argv, cwd))
  sendJson(res, 200, { action, ...result })
}

async function handleCommit(req, res, cwd) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method not allowed' })
    return
  }
  {
    const originErr = checkOrigin(req)
    if (originErr) {
      sendJson(res, 403, { error: originErr })
      return
    }
  }
  let raw
  try {
    raw = await readBodyWithLimit(req, MAX_BODY_BYTES)
  } catch (err) {
    sendJson(res, err && err.httpStatus === 413 ? 413 : 400, {
      error: err?.message || 'bad request',
    })
    return
  }
  let parsed = {}
  if (raw) {
    try {
      parsed = JSON.parse(raw)
    } catch {
      sendJson(res, 400, { error: 'invalid JSON body' })
      return
    }
  }
  const bodyParse = CommitBodySchema.safeParse(parsed)
  if (!bodyParse.success) {
    sendJson(res, 400, {
      error: 'invalid args',
      issues: bodyParse.error.issues.map((i) => ({ path: i.path, message: i.message })),
    })
    return
  }
  const message = bodyParse.data.message
  // Default to pleno-findings.json for back-compat with the original
  // single-file commit endpoint. `files` is already allowlist-restricted
  // by the schema; re-assert here (belt + suspenders) so a future schema
  // change can never silently widen what `git add` touches.
  const files = bodyParse.data.files ?? ['public/data/pleno-findings.json']
  for (const f of files) {
    if (!COMMIT_FILE_ALLOWLIST.includes(f)) {
      sendJson(res, 400, { error: `file not on commit allowlist: ${f}` })
      return
    }
  }
  const result = await enqueue(async () => {
    const startedAt = Date.now()
    const steps = [
      ['add', ['add', ...files]],
      ['commit', ['commit', '-m', message]],
      ['push', ['push']],
    ]
    let stdout = ''
    let stderr = ''
    for (const [label, args] of steps) {
      const r = await new Promise((resolveP) => {
        execFile(
          'git',
          args,
          { cwd, timeout: CLI_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
          (err, out, errOut) => {
            resolveP({
              code: err && typeof err.code === 'number' ? err.code : err ? 1 : 0,
              out: String(out ?? ''),
              err: String(errOut ?? ''),
              label,
            })
          },
        )
      })
      stdout += `[${r.label}]\n${r.out}\n`
      stderr += r.err ? `[${r.label} stderr]\n${r.err}\n` : ''
      if (r.code !== 0) {
        return {
          exitCode: r.code,
          stdout,
          stderr,
          durationMs: Date.now() - startedAt,
          failedAt: r.label,
        }
      }
    }
    return {
      exitCode: 0,
      stdout,
      stderr,
      durationMs: Date.now() - startedAt,
    }
  })
  sendJson(res, 200, { action: 'commit', ...result })
}

// ─── Async transcription job endpoints ─────────────────────────────────────

/**
 * POST /api/curator/jobs — create a transcription job.
 *
 * Validates the body against `TranscribeEvidenceJobSchema`, validates
 * the file path via `validateInputPath` (path traversal, magic-byte
 * sniff, size cap), writes the initial job state, then spawns the
 * runner as a detached child process. Returns `{jobId, status}` in
 * <200 ms. The dashboard polls GET for completion.
 */
async function handleJobCreate(req, res, cwd) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method not allowed' })
    return
  }
  {
    const originErr = checkOrigin(req)
    if (originErr) {
      sendJson(res, 403, { error: originErr })
      return
    }
  }
  let raw
  try {
    raw = await readBodyWithLimit(req, MAX_BODY_BYTES)
  } catch (err) {
    sendJson(res, err && err.httpStatus === 413 ? 413 : 400, {
      error: err?.message || 'bad request',
    })
    return
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    sendJson(res, 400, { error: 'invalid JSON body' })
    return
  }
  const bodyParse = TranscribeEvidenceJobSchema.safeParse(parsed)
  if (!bodyParse.success) {
    sendJson(res, 400, {
      error: 'invalid args',
      issues: bodyParse.error.issues.map((i) => ({ path: i.path, message: i.message })),
    })
    return
  }
  // Path / magic-byte / size validation.
  let validated
  try {
    validated = validateInputPath(bodyParse.data.args.filePath, bodyParse.data.args.expectedKind)
  } catch (err) {
    if (err instanceof JobValidationError) {
      sendJson(res, err.status, { error: err.message })
    } else {
      sendJson(res, 500, { error: err.message })
    }
    return
  }

  const jobId = newJobId()
  const state = {
    id: jobId,
    action: 'transcribe-evidence',
    args: {
      filePath: validated.realPath,
      expectedKind: bodyParse.data.args.expectedKind,
      ...(bodyParse.data.args.engine ? { engine: bodyParse.data.args.engine } : {}),
    },
    status: 'queued',
    createdAt: new Date().toISOString(),
  }
  try {
    writeJob(state)
  } catch (err) {
    sendJson(res, 500, { error: `failed to write job state: ${err.message}` })
    return
  }

  // Detach the runner so the dev server isn't tied to its lifetime.
  // Inherit env so WHISPER_ENGINE / OPENAI_API_KEY / etc. flow through.
  try {
    const runner = spawn('npx', ['tsx', resolve(cwd, 'scripts/curator-job-runner.ts'), jobId], {
      cwd,
      detached: true,
      stdio: 'ignore',
      env: process.env,
    })
    runner.unref()
  } catch (err) {
    // Mark the job failed inline so the dashboard surfaces it.
    state.status = 'failed'
    state.error = `failed to spawn runner: ${err.message}`
    state.finishedAt = new Date().toISOString()
    try {
      writeJob(state)
    } catch {
      /* noop */
    }
    sendJson(res, 500, { error: `failed to spawn runner: ${err.message}` })
    return
  }

  sendJson(res, 202, {
    jobId,
    status: 'queued',
    sizeBytes: validated.sizeBytes,
    mimeType: validated.mimeType,
  })
}

/**
 * GET /api/curator/jobs/:id — read the job state JSON.
 * GET /api/curator/jobs    — list recent jobs (newest first).
 *
 * The list endpoint helps the dashboard render the queue when more
 * than one job is in-flight.
 */
function handleJobRead(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'method not allowed' })
    return
  }
  {
    const originErr = checkOrigin(req)
    if (originErr) {
      sendJson(res, 403, { error: originErr })
      return
    }
  }
  // Path: '/' (list) or '/<id>' (single).
  const path = (req.url || '/').split('?')[0]
  if (path === '/' || path === '') {
    sendJson(res, 200, { jobs: listJobs().slice(0, 20) })
    return
  }
  const id = path.replace(/^\//, '')
  if (!JOB_ID_RE.test(id)) {
    sendJson(res, 400, { error: 'invalid job id' })
    return
  }
  const job = loadJob(id)
  if (!job) {
    sendJson(res, 404, { error: 'job not found' })
    return
  }
  sendJson(res, 200, job)
}

/**
 * DELETE /api/curator/jobs/:id — request cancellation.
 *
 * Sets status='cancelled' on the job file. The runner polls this
 * file every ~2s and SIGTERMs its child when the flag flips.
 */
function handleJobCancel(req, res) {
  if (req.method !== 'DELETE') {
    sendJson(res, 405, { error: 'method not allowed' })
    return
  }
  {
    const originErr = checkOrigin(req)
    if (originErr) {
      sendJson(res, 403, { error: originErr })
      return
    }
  }
  const path = (req.url || '/').split('?')[0]
  const id = path.replace(/^\//, '')
  if (!JOB_ID_RE.test(id)) {
    sendJson(res, 400, { error: 'invalid job id' })
    return
  }
  const job = loadJob(id)
  if (!job) {
    sendJson(res, 404, { error: 'job not found' })
    return
  }
  if (job.status === 'done' || job.status === 'failed' || job.status === 'cancelled') {
    sendJson(res, 200, { jobId: id, status: job.status, alreadyTerminal: true })
    return
  }
  job.status = 'cancelled'
  job.finishedAt = new Date().toISOString()
  writeJob(job)
  sendJson(res, 200, { jobId: id, status: 'cancelled' })
}

/**
 * GET /api/curator/voiceprints — return the full councillor list with
 * per-councillor enrollment status. Joins officials.json (the public
 * source-of-truth roster of 21 elected officials) with the local
 * voiceprint index (.voiceprints/index.json, gitignored). Used by the
 * dashboard's voice-enrollment section to render the 21-row table
 * with a "✓ enrolled" / "✗ not enrolled" affordance per row.
 *
 * The .voiceprints/ directory is local-only — never deployed — but
 * this endpoint is dev-mode-only too (apply:'serve'), so the join is
 * symmetric: the data path stays on the curator's machine.
 */
function handleVoiceprintsRead(req, res, cwd) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'method not allowed' })
    return
  }
  {
    const originErr = checkOrigin(req)
    if (originErr) {
      sendJson(res, 403, { error: originErr })
      return
    }
  }
  const officialsPath = resolve(cwd, 'public/data/officials.json')
  if (!existsSync(officialsPath)) {
    sendJson(res, 500, { error: 'officials.json missing — run scrape:officials' })
    return
  }
  let officialsRaw
  try {
    officialsRaw = JSON.parse(readFileSync(officialsPath, 'utf8'))
  } catch (err) {
    sendJson(res, 500, { error: `officials.json unreadable: ${err.message}` })
    return
  }
  /** @type {Array<{slug:string,name:string,party?:string,role?:string}>} */
  const officials = officialsRaw.officials ?? officialsRaw.items ?? []

  // Read voiceprint index (local-only). Missing file → empty enrollment.
  const indexPath = resolve(cwd, '.voiceprints/index.json')
  /** @type {Map<string, object>} */
  const enrollmentBySlug = new Map()
  if (existsSync(indexPath)) {
    try {
      const idx = JSON.parse(readFileSync(indexPath, 'utf8'))
      for (const e of idx.entries ?? []) enrollmentBySlug.set(e.slug, e)
    } catch (err) {
      // Don't fail the whole list on a corrupt index — the dashboard
      // should still show the 21 unenrolled councillors.
      process.stderr.write(`[voiceprints] index unreadable: ${err.message}\n`)
    }
  }

  const rows = officials.map((o) => ({
    slug: o.slug,
    name: o.name,
    party: o.party ?? null,
    role: o.role ?? null,
    enrollment: enrollmentBySlug.get(o.slug) ?? null,
  }))
  // Stable sort: alcalde first, then by party + name. Curators see the
  // most consequential councillor at the top.
  rows.sort((a, b) => {
    if (a.role === 'alcalde' && b.role !== 'alcalde') return -1
    if (b.role === 'alcalde' && a.role !== 'alcalde') return 1
    return (a.party ?? '').localeCompare(b.party ?? '') || a.name.localeCompare(b.name)
  })

  sendJson(res, 200, {
    generatedAt: new Date().toISOString(),
    totalCouncillors: officials.length,
    enrolledCount: enrollmentBySlug.size,
    rows,
  })
}

/**
 * GET /api/curator/promise-queue — return the local-only promise
 * auto-curator review queue for the dashboard.
 *
 * Reads editorial/promise-review-queue.json (the pending DraftNewPromise
 * rows the auto-curator emitted) plus editorial/promise-review-archive.json
 * (applied / rejected / tombstoned history) from the repo root. BOTH live
 * under the gitignored editorial/ directory — they carry UNREVIEWED party
 * attributions that must never leave the laptop, so (exactly like
 * handleVoiceprintsRead) this endpoint is dev-mode-only + origin-checked and
 * reads a purely local file. The curator dashboard is the only consumer.
 *
 * Either file may be absent (the auto-curator hasn't run yet) → returns an
 * empty queue rather than an error. Corrupt JSON is logged + treated as
 * empty so a single bad file never blanks the dashboard.
 */
/**
 * GET /api/curator/area-fit-queue — the local-only «encaje declarado» review
 * queue.
 *
 * Reads editorial/area-fit-queue.json, which is GITIGNORED and never served by
 * Vercel. That is the whole point: these rows are unreviewed machine judgements
 * about whether a NAMED councillor's declared training relates to the área they
 * run. Under public/ they would be fetchable by URL the moment they were
 * written, reviewed or not.
 *
 * Also returns what is already published so the dashboard can mark each row,
 * and the officials roster so it can show names rather than slugs.
 */
function handleAreaFitQueueRead(req, res, cwd) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'method not allowed' })
    return
  }
  {
    const originErr = checkOrigin(req)
    if (originErr) {
      sendJson(res, 403, { error: originErr })
      return
    }
  }
  const read = (rel, fallback) => {
    const path = resolve(cwd, rel)
    if (!existsSync(path)) return fallback
    try {
      return JSON.parse(readFileSync(path, 'utf8'))
    } catch (err) {
      // Corrupt file → an empty list, never a crashed dashboard.
      process.stderr.write(`[area-fit-queue] ${rel} unreadable: ${err.message}\n`)
      return fallback
    }
  }
  const queue = read('editorial/area-fit-queue.json', {})
  const published = read('public/data/area-fit.json', {})
  const officials = read('public/data/officials.json', {})
  sendJson(res, 200, {
    generatedAt: typeof queue.generatedAt === 'string' ? queue.generatedAt : null,
    promptVersion: queue.promptVersion ?? null,
    backend: queue.backend ?? null,
    rows: Array.isArray(queue.rows) ? queue.rows : [],
    published: Array.isArray(published.rows) ? published.rows : [],
    officials: Array.isArray(officials.officials) ? officials.officials : [],
  })
}

function handlePromiseQueueRead(req, res, cwd) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'method not allowed' })
    return
  }
  {
    const originErr = checkOrigin(req)
    if (originErr) {
      sendJson(res, 403, { error: originErr })
      return
    }
  }
  // Pending drafts + the queue's own generatedAt (when it was last built).
  const queuePath = resolve(cwd, 'editorial/promise-review-queue.json')
  let generatedAt = null
  /** @type {Array<object>} */
  let drafts = []
  if (existsSync(queuePath)) {
    try {
      const q = JSON.parse(readFileSync(queuePath, 'utf8'))
      generatedAt = typeof q.generatedAt === 'string' ? q.generatedAt : null
      drafts = Array.isArray(q.drafts) ? q.drafts : []
    } catch (err) {
      // Corrupt queue → surface an empty list rather than crashing the
      // dashboard. Mirrors the defensive reads in handleVoiceprintsRead.
      process.stderr.write(`[promise-queue] queue unreadable: ${err.message}\n`)
    }
  }
  // Archive → the dashboard only needs its count for a header stat.
  const archivePath = resolve(cwd, 'editorial/promise-review-archive.json')
  let archivedCount = 0
  if (existsSync(archivePath)) {
    try {
      const a = JSON.parse(readFileSync(archivePath, 'utf8'))
      if (Array.isArray(a.drafts)) archivedCount = a.drafts.length
    } catch (err) {
      process.stderr.write(`[promise-queue] archive unreadable: ${err.message}\n`)
    }
  }
  sendJson(res, 200, {
    generatedAt: generatedAt ?? new Date().toISOString(),
    drafts,
    archivedCount,
  })
}

/**
 * GET /api/curator/pleno-speakers — directory of every pleno that has
 * a voice-id assignment file at `pleno-speakers/<plenoId>.json`.
 *
 * Each row carries enough summary stats to populate the dashboard
 * without round-tripping for the detail JSON: speaker counts per tier,
 * how many lines have curator overrides, when it was last regenerated.
 *
 * Plenos without a JSON file are omitted (the curator hasn't run
 * identify-pleno-speakers on them yet).
 */
function handlePlenoSpeakersList(req, res, cwd) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'method not allowed' })
    return
  }
  {
    const originErr = checkOrigin(req)
    if (originErr) {
      sendJson(res, 403, { error: originErr })
      return
    }
  }
  const dir = resolve(cwd, 'pleno-speakers')
  if (!existsSync(dir)) {
    sendJson(res, 200, { generatedAt: new Date().toISOString(), plenos: [] })
    return
  }
  let files
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json'))
  } catch (err) {
    sendJson(res, 500, { error: `cannot read ${dir}: ${err.message}` })
    return
  }
  const plenosPath = resolve(cwd, 'public/data/plenos.json')
  /** @type {Record<string, {date?: string, title?: string}>} */
  const plenoMeta = {}
  if (existsSync(plenosPath)) {
    try {
      const items = JSON.parse(readFileSync(plenosPath, 'utf8')).items ?? []
      for (const p of items) plenoMeta[p.id] = { date: p.date, title: p.title }
    } catch (err) {
      // Non-fatal; the dashboard just won't get pleno titles.
      process.stderr.write(`[pleno-speakers] plenos.json unreadable: ${err.message}\n`)
    }
  }
  const rows = []
  for (const f of files) {
    const plenoId = f.replace(/\.json$/, '')
    let doc
    try {
      doc = JSON.parse(readFileSync(resolve(dir, f), 'utf8'))
    } catch (err) {
      process.stderr.write(`[pleno-speakers] ${f} unreadable: ${err.message}\n`)
      continue
    }
    const assignments = doc?.assignments ?? []
    let curatorOverrideCount = 0
    for (const a of assignments) {
      if (a.curatorOverride !== undefined && a.curatorOverride !== null) curatorOverrideCount += 1
    }
    rows.push({
      plenoId,
      plenoDate: plenoMeta[plenoId]?.date ?? null,
      plenoTitle: plenoMeta[plenoId]?.title ?? null,
      generatedAt: doc?.generatedAt ?? null,
      totalSpeakers: doc?.totalSpeakers ?? assignments.length,
      highConfidenceCount: doc?.highConfidenceCount ?? 0,
      mediumConfidenceCount: doc?.mediumConfidenceCount ?? 0,
      unmatchedCount: doc?.unmatchedCount ?? 0,
      curatorOverrideCount,
    })
  }
  // Most recent pleno on top — date when known, else id.
  rows.sort((a, b) => {
    if (a.plenoDate && b.plenoDate) return b.plenoDate.localeCompare(a.plenoDate)
    return b.plenoId.localeCompare(a.plenoId)
  })
  sendJson(res, 200, { generatedAt: new Date().toISOString(), plenos: rows })
}

/**
 * GET /api/curator/pleno-speakers/<plenoId>/audio/<SPEAKER_NN>
 *
 * Stream an ~8-second slice of the cluster's longest segment from the
 * cached pleno audio so the curator can spot-check the voice before
 * applying an override. Strict validation — plenoId and speaker pass
 * regex gates, ffmpeg argv is fixed shape (no shell), audio file path
 * is computed from the regex-matched plenoId so directory traversal
 * is impossible. Encoded as audio/mpeg via ffmpeg piped to res.
 *
 * Response is short (≤8s mp3 ≈ 30-60 KB), so we stream directly with
 * no length header; the browser shows progressive playback.
 */
function handlePlenoSpeakersAudio(req, res, cwd, plenoId, speaker) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'method not allowed' })
    return
  }
  {
    const originErr = checkOrigin(req)
    if (originErr) {
      sendJson(res, 403, { error: originErr })
      return
    }
  }
  if (!/^[a-z0-9]{3,40}$/.test(plenoId)) {
    sendJson(res, 400, { error: 'invalid plenoId' })
    return
  }
  if (!/^SPEAKER_\d{1,3}$/.test(speaker)) {
    sendJson(res, 400, { error: 'invalid speaker' })
    return
  }
  const docPath = resolve(cwd, `pleno-speakers/${plenoId}.json`)
  if (!existsSync(docPath)) {
    sendJson(res, 404, { error: `no assignment file for ${plenoId}` })
    return
  }
  let doc
  try {
    doc = JSON.parse(readFileSync(docPath, 'utf8'))
  } catch (err) {
    sendJson(res, 500, { error: `cannot read ${docPath}: ${err.message}` })
    return
  }
  // Find the cluster + its segments. We don't store segments on the
  // assignment after identify-pleno-speakers (only durations); we
  // re-derive by re-reading the diarized transcript.
  const a = (doc.assignments ?? []).find((x) => x.speaker === speaker)
  if (!a) {
    sendJson(res, 404, { error: `speaker ${speaker} not in ${plenoId}` })
    return
  }
  const transcriptPath = resolve(cwd, `public/data/pleno-transcripts/${plenoId}.txt`)
  if (!existsSync(transcriptPath)) {
    sendJson(res, 404, { error: `transcript missing: ${transcriptPath}` })
    return
  }
  const transcript = readFileSync(transcriptPath, 'utf8')
  // Parse for the SPEAKER_NN tag — also accepts the override-applied
  // (Full Name) form by falling back to first segment on the cluster.
  // Original tag must be in the transcript when this is the diarized
  // baseline; if not (curator already applied --apply), we look at any
  // line and find one starting with the curator-assigned full name.
  const escapedSpeaker = speaker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const reSpeaker = new RegExp(
    `^\\[(\\d+\\.?\\d*)\\s*→\\s*(\\d+\\.?\\d*)\\]\\s*\\(${escapedSpeaker}\\)`,
  )
  const segments = []
  for (const line of transcript.split('\n')) {
    const m = line.match(reSpeaker)
    if (!m) continue
    const start = Number(m[1])
    const end = Number(m[2])
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      segments.push({ start, end, dur: end - start })
    }
  }
  if (segments.length === 0) {
    sendJson(res, 404, { error: `no segments tagged ${speaker} in transcript` })
    return
  }
  // Pick the longest segment, slice 8s from its midpoint (so we skip
  // the speaker-change boundary at the start where pyannote sometimes
  // labels the wrong half-second).
  segments.sort((p, q) => q.dur - p.dur)
  const best = segments[0]
  const sliceDur = Math.min(8, best.dur)
  const sliceStart = Math.max(best.start, best.start + (best.dur - sliceDur) / 2)
  // Find the cached audio. The transcribe pipeline may have left it as
  // audio.mp3 or audio-clean.mp3 (when WHISPER_DENOISE=1 was on).
  const audioCandidates = [
    resolve(cwd, `tmp/transcribe/${plenoId}/audio.mp3`),
    resolve(cwd, `tmp/transcribe/${plenoId}/audio-clean.mp3`),
  ]
  const audioPath = audioCandidates.find((p) => existsSync(p))
  if (!audioPath) {
    sendJson(res, 404, {
      error:
        `cached audio missing for ${plenoId} — re-run transcribe-pleno (the WORKDIR is ` +
        'auto-cleaned after a successful run).',
    })
    return
  }
  res.statusCode = 200
  res.setHeader('content-type', 'audio/mpeg')
  res.setHeader('cache-control', 'no-store')
  // Spawn ffmpeg with a fixed argv — no shell. -ss before -i is the
  // input-seek form (fast) which is plenty accurate for an 8s preview.
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-ss',
    sliceStart.toFixed(3),
    '-t',
    sliceDur.toFixed(3),
    '-i',
    audioPath,
    '-ac',
    '1',
    '-ar',
    '22050',
    '-b:a',
    '64k',
    '-f',
    'mp3',
    '-',
  ]
  const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] })
  let stderrBuf = ''
  child.stderr.on('data', (d) => {
    stderrBuf += d.toString()
    if (stderrBuf.length > 4096) stderrBuf = stderrBuf.slice(-4096)
  })
  child.stdout.pipe(res)
  child.on('error', (err) => {
    if (!res.headersSent) sendJson(res, 500, { error: `ffmpeg spawn: ${err.message}` })
  })
  child.on('close', (code) => {
    if (code !== 0) {
      // Best-effort error tail — at this point headers already went
      // out, but the stream just terminates cleanly with bad data
      // truncated. Log on server side for diagnosis.
      process.stderr.write(`[pleno-speakers/audio] ffmpeg exit ${code}: ${stderrBuf.slice(-300)}\n`)
    }
  })
  req.on('close', () => {
    if (!child.killed) child.kill('SIGTERM')
  })
}

/**
 * GET /api/curator/pleno-speakers/<plenoId> — full assignment doc.
 * Returns the raw JSON the matcher writes (assignments[], topCandidates,
 * curator overrides, totals). The dashboard renders the per-cluster table
 * from this payload.
 */
function handlePlenoSpeakersDetail(req, res, cwd, plenoId) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'method not allowed' })
    return
  }
  {
    const originErr = checkOrigin(req)
    if (originErr) {
      sendJson(res, 403, { error: originErr })
      return
    }
  }
  if (!/^[a-z0-9]{3,40}$/.test(plenoId)) {
    sendJson(res, 400, { error: 'invalid plenoId' })
    return
  }
  const path = resolve(cwd, `pleno-speakers/${plenoId}.json`)
  if (!existsSync(path)) {
    sendJson(res, 404, { error: `no assignment file for ${plenoId}` })
    return
  }
  try {
    const doc = JSON.parse(readFileSync(path, 'utf8'))
    sendJson(res, 200, doc)
  } catch (err) {
    sendJson(res, 500, { error: `cannot read ${path}: ${err.message}` })
  }
}

/**
 * @param {{ cwd?: string }} [opts]
 * @returns {import('vite').Plugin}
 */
export function viteCuratorPlugin(opts = {}) {
  const cwd = resolve(opts.cwd ?? process.cwd())
  return {
    name: 'civicpulse:curator-middleware',
    apply: 'serve', // dev only — never in production builds
    configureServer(server) {
      server.middlewares.use('/api/curator/run', (req, res, next) => {
        if (!req.url || req.url === '/' || req.url === '') {
          handleRun(req, res, cwd).catch((err) => {
            sendJson(res, 500, { error: err.message })
          })
        } else {
          next()
        }
      })
      server.middlewares.use('/api/curator/commit', (req, res, next) => {
        if (!req.url || req.url === '/' || req.url === '') {
          handleCommit(req, res, cwd).catch((err) => {
            sendJson(res, 500, { error: err.message })
          })
        } else {
          next()
        }
      })
      server.middlewares.use('/api/curator/voiceprints', (req, res, next) => {
        if (!req.url || req.url === '/' || req.url === '') {
          try {
            handleVoiceprintsRead(req, res, cwd)
          } catch (err) {
            sendJson(res, 500, { error: err.message })
          }
        } else {
          next()
        }
      })
      server.middlewares.use('/api/curator/area-fit-queue', (req, res, next) => {
        if (!req.url || req.url === '/' || req.url === '') {
          try {
            handleAreaFitQueueRead(req, res, cwd)
          } catch (err) {
            sendJson(res, 500, { error: err.message })
          }
        } else {
          next()
        }
      })
      server.middlewares.use('/api/curator/promise-queue', (req, res, next) => {
        if (!req.url || req.url === '/' || req.url === '') {
          try {
            handlePromiseQueueRead(req, res, cwd)
          } catch (err) {
            sendJson(res, 500, { error: err.message })
          }
        } else {
          next()
        }
      })
      // /api/curator/pleno-speakers
      //   /                                        list
      //   /<plenoId>                               detail JSON
      //   /<plenoId>/audio/<SPEAKER_NN>            ffmpeg-streamed snippet
      server.middlewares.use('/api/curator/pleno-speakers', (req, res, next) => {
        const path = (req.url || '/').split('?')[0]
        try {
          if (path === '/' || path === '') {
            handlePlenoSpeakersList(req, res, cwd)
            return
          }
          const audioMatch = path.match(/^\/([a-z0-9]{3,40})\/audio\/(SPEAKER_\d{1,3})$/)
          if (audioMatch) {
            handlePlenoSpeakersAudio(req, res, cwd, audioMatch[1], audioMatch[2])
            return
          }
          const m = path.match(/^\/([a-z0-9]{3,40})$/)
          if (m) {
            handlePlenoSpeakersDetail(req, res, cwd, m[1])
            return
          }
          next()
        } catch (err) {
          sendJson(res, 500, { error: err.message })
        }
      })
      // POST /api/curator/jobs (create) and GET /api/curator/jobs (list).
      // Note: `connect`-style middleware strips the mount prefix from req.url,
      // so the handler sees req.url === '/' for the bare path.
      server.middlewares.use('/api/curator/jobs', (req, res, next) => {
        const path = (req.url || '/').split('?')[0]
        // Bare path: POST=create, GET=list.
        if (path === '/' || path === '') {
          if (req.method === 'POST') {
            handleJobCreate(req, res, cwd).catch((err) =>
              sendJson(res, 500, { error: err.message }),
            )
          } else if (req.method === 'GET') {
            try {
              handleJobRead(req, res)
            } catch (err) {
              sendJson(res, 500, { error: err.message })
            }
          } else {
            sendJson(res, 405, { error: 'method not allowed' })
          }
          return
        }
        // Sub-path: /<id> — GET reads, DELETE cancels.
        if (req.method === 'GET') {
          try {
            handleJobRead(req, res)
          } catch (err) {
            sendJson(res, 500, { error: err.message })
          }
          return
        }
        if (req.method === 'DELETE') {
          try {
            handleJobCancel(req, res)
          } catch (err) {
            sendJson(res, 500, { error: err.message })
          }
          return
        }
        next()
      })
    },
  }
}

// Test-only exports for unit tests.
export const __test = {
  ActionSchemas,
  TranscribeEvidenceJobSchema,
  CommitBodySchema,
  COMMIT_FILE_ALLOWLIST,
  buildArgv,
  ALLOWED_ORIGINS,
  MAX_BODY_BYTES,
  SHELL_METACHAR_RE,
}
