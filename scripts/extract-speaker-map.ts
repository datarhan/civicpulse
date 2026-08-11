#!/usr/bin/env tsx
/**
 * Recover a pleno's speaker map from its audio.
 *
 *   npm run extract:speaker-map -- <plenoId> [--chunks N] [--keep-audio]
 *   npm run extract:speaker-map -- <plenoId> --audio path/to/file.mp3
 *
 * Writes `pleno-speaker-map/<plenoId>.json`. Does NOT touch the published
 * transcript: this is an overlay that says who was speaking, not a
 * re-transcription. 169 published quotes are verbatim from the current
 * transcripts and stay that way.
 *
 * ## Why this does not use src/llm/client.ts
 *
 * That client is text-only — `claude -p` takes no attachments and the HTTP
 * backends are wired for chat, not media. More importantly its fallback chain
 * would be actively harmful here: a text model handed an audio job with no
 * audio does not fail, it invents a plausible map. There is no $0 fallback for
 * audio, so a rate-limited run **stops and resumes** instead of degrading.
 *
 * ## Why curl and not fetch
 *
 * Node's undici aborts after 300 s without response headers. A long audio
 * request exceeds that before the model has succeeded or failed, and the
 * failure surfaces as a zero-character transcript — which, written to disk,
 * is indistinguishable from a session where nobody spoke. Measured 2026-08-10:
 * the same file that produced 57,731 characters over curl produced 0 over
 * fetch. Requests go through curl with `--no-buffer` on the SSE endpoint.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  parseSpeakerMapResponse,
  globalLabel,
  referenceCoverage,
  speechSeconds,
  isUsableReference,
  resumableChunks,
  unattemptedChunks,
  chunksToAttempt,
  type RawSegment,
  type SpeakerMap,
  type SpeakerMapRow,
} from '../src/scraper/speaker-map'
import {
  validateSpeakerMap,
  rejectionTally,
  type RejectedCandidate,
} from '../src/scraper/speaker-map-validate'
import {
  buildSpeakerMapPrompt,
  SPEAKER_MAP_PROMPT_VERSION,
  SPEAKER_MAP_CHUNK_SECONDS,
  SPEAKER_MAP_COVERAGE_FLOOR,
} from '../src/scraper/speaker-map-prompt'
import { decideSnapshotWrite } from '../src/scraper/snapshot-write'
import {
  adjudicateWeakRows,
  applyAdjudications,
  type AdjudicationOutcome,
} from '../src/scraper/speaker-map-adjudicate'
import {
  seatsFromOfficials,
  type OfficialLike,
  type OfficialsDoc,
} from '../src/scraper/corporation-seats'
import { parseDiarizedTranscript } from '../src/scraper/voice-id'
import { startRun, formatManifest } from '../src/scraper/run-manifest'
import { getRunStats } from '../src/llm/client'

const OUT_DIR = resolve('pleno-speaker-map')
const MODEL = process.env.SPEAKER_MAP_MODEL || 'gemini-3.5-flash'
/**
 * Ceiling on back-reference adjudications per chunk. Costs Max-plan time
 * rather than money, but a session with many weak rows would otherwise sit in
 * the model for a long while with nothing telling you why.
 */
const ADJUDICATE_MAX = Number(process.env.SPEAKER_MAP_ADJUDICATE_MAX || 12)
const SKIP_ADJUDICATION = process.env.SPEAKER_MAP_ADJUDICATE === '0'
const BASE = 'https://generativelanguage.googleapis.com'

interface Args {
  plenoId: string
  maxChunks: number
  audio: string | null
  keepAudio: boolean
  /** Ignore any existing map and rebuild from chunk 0. */
  restart: boolean
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    plenoId: '',
    maxChunks: Infinity,
    audio: null,
    keepAudio: false,
    restart: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--chunks') out.maxChunks = Number(argv[++i])
    else if (a === '--audio') out.audio = argv[++i]
    else if (a === '--keep-audio') out.keepAudio = true
    else if (a === '--restart') out.restart = true
    else if (!a.startsWith('--') && !out.plenoId) out.plenoId = a
    else {
      process.stderr.write(`[speaker-map] unknown flag ${a}\n`)
      process.exit(2)
    }
  }
  return out
}

function sh(cmd: string, args: string[], opts: { input?: string } = {}): string {
  return execFileSync(cmd, args, {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    input: opts.input,
  })
}

/**
 * An HTTP-level failure from the API, carrying its code.
 *
 * The code matters for control flow: 429 on the free tier is a daily quota
 * wall (measured 2026-08-10: 20 requests/day on gemini-3.5-flash), and
 * retrying against it is pure waste. 503 is transient and worth another go.
 */
class ApiError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(`HTTP ${code}: ${message}`)
    this.name = 'ApiError'
  }
}

/** Seconds of audio, measured with ffprobe — never inferred from bytes. */
function durationOf(path: string): number {
  const out = sh('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=nw=1:nk=1',
    path,
  ])
  const d = Number(out.trim())
  if (!Number.isFinite(d) || d <= 0) throw new Error(`ffprobe gave no duration for ${path}`)
  return d
}

/**
 * One chunk → the model's raw response.
 *
 * Throws on anything that is not a complete answer. An empty or truncated
 * response must NOT become an empty map row: the caller aborts the pleno
 * rather than publish a map that says the chamber was silent.
 */
function transcribeChunk(path: string, apiKey: string, prompt: string): string {
  const bytes = Number(sh('stat', ['-f%z', path]).trim())

  // Resumable upload. The two-step dance is the documented protocol; a plain
  // POST silently truncates large bodies.
  const headers = sh('curl', [
    '-s',
    '-D',
    '-',
    '-o',
    '/dev/null',
    '-X',
    'POST',
    `${BASE}/upload/v1beta/files?key=${apiKey}`,
    '-H',
    'X-Goog-Upload-Protocol: resumable',
    '-H',
    'X-Goog-Upload-Command: start',
    '-H',
    `X-Goog-Upload-Header-Content-Length: ${bytes}`,
    '-H',
    'X-Goog-Upload-Header-Content-Type: audio/ogg',
    '-H',
    'Content-Type: application/json',
    '-d',
    JSON.stringify({ file: { display_name: 'chunk.ogg' } }),
  ])
  const uploadUrl = /x-goog-upload-url:\s*(\S+)/i.exec(headers)?.[1]
  if (!uploadUrl) throw new Error('upload start returned no URL')

  const fileJson = JSON.parse(
    sh('curl', [
      '-s',
      '--max-time',
      '900',
      '-X',
      'POST',
      uploadUrl,
      '-H',
      `Content-Length: ${bytes}`,
      '-H',
      'X-Goog-Upload-Offset: 0',
      '-H',
      'X-Goog-Upload-Command: upload, finalize',
      '--data-binary',
      `@${path}`,
    ]),
  )
  const fileUri: string | undefined = fileJson?.file?.uri
  const fileName: string | undefined = fileJson?.file?.name
  if (!fileUri || !fileName)
    throw new Error(`upload failed: ${JSON.stringify(fileJson).slice(0, 200)}`)

  // Audio arrives PROCESSING; generateContent 400s on a file that is not
  // ACTIVE, so poll rather than assume.
  let state = 'PROCESSING'
  for (let i = 0; i < 120 && state === 'PROCESSING'; i++) {
    spawnSync('sleep', ['3'])
    state = JSON.parse(sh('curl', ['-s', `${BASE}/v1beta/${fileName}?key=${apiKey}`]))?.state ?? '?'
  }
  if (state !== 'ACTIVE') throw new Error(`uploaded file stuck in ${state}`)

  const body = JSON.stringify({
    contents: [
      {
        role: 'user',
        parts: [{ file_data: { mime_type: 'audio/ogg', file_uri: fileUri } }, { text: prompt }],
      },
    ],
    generationConfig: { temperature: 0, maxOutputTokens: 65536 },
  })
  const sse = sh(
    'curl',
    [
      '-s',
      '--no-buffer',
      '--max-time',
      '3600',
      '-X',
      'POST',
      `${BASE}/v1beta/models/${MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`,
      '-H',
      'Content-Type: application/json',
      '--data-binary',
      '@-',
    ],
    { input: body },
  )

  let text = ''
  let finish: string | null = null
  let sawData = false
  for (const line of sse.split('\n')) {
    if (!line.startsWith('data: ')) continue
    sawData = true
    let j: any
    try {
      j = JSON.parse(line.slice(6))
    } catch {
      continue
    }
    if (j.error) throw new ApiError(j.error.code ?? 0, String(j.error.message ?? '').slice(0, 300))
    for (const p of j.candidates?.[0]?.content?.parts ?? []) if (p.text) text += p.text
    if (j.candidates?.[0]?.finishReason) finish = j.candidates[0].finishReason
  }

  // An HTTP error is NOT served as SSE — it comes back as a bare JSON body, so
  // a parser that only reads `data:` lines sees zero events and reports "empty
  // response". That mislabels a quota wall as a model that had nothing to say,
  // which is the same confusion that let a dead backend print an all-clear.
  if (!sawData) {
    try {
      const err = JSON.parse(sse)?.error
      if (err) throw new ApiError(err.code ?? 0, String(err.message ?? '').slice(0, 300))
    } catch (e) {
      if (e instanceof ApiError) throw e
    }
    throw new Error(`no SSE events and no error body (${sse.length} bytes)`)
  }

  // A null result is not "found nothing". Refuse it loudly.
  if (!text.trim()) throw new Error(`empty response (finishReason=${finish ?? 'none'})`)
  return text
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.plenoId) {
    process.stderr.write('usage: extract-speaker-map.ts <plenoId> [--chunks N] [--audio FILE]\n')
    process.exit(2)
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    process.stderr.write(
      '[speaker-map] GEMINI_API_KEY not set. This step needs audio, and no $0\n' +
        '              text backend can substitute — it would invent the map.\n' +
        '              Run: set -a; . ./.env; set +a\n',
    )
    process.exit(1)
  }

  const doc = JSON.parse(
    readFileSync(resolve('public/data/officials.json'), 'utf8'),
  ) as OfficialsDoc
  const officials = (doc.officials ?? []) as OfficialLike[]
  const seats = seatsFromOfficials(doc)

  const work = join(tmpdir(), `speaker-map-${args.plenoId}-${process.pid}`)
  mkdirSync(work, { recursive: true })

  // Transcription goes out over curl, NOT through src/llm/client, so
  // `getRunStats()` cannot see it — it only counts the adjudication calls.
  // Reporting the raw stats would leave a run with judged>0 and calls===0,
  // which `assessManifest` flags as `judged-without-calls`: an ERROR, on
  // every successful run. A check that is always red is one everybody
  // switches off. These are real API calls; count them as such and add the
  // client's own on top.
  let apiCalls = 0
  let apiOk = 0
  let apiFailed = 0
  const runLog = startRun('extract-speaker-map', {
    backend: 'gemini-api',
    model: MODEL,
    getStats: () => {
      const s = getRunStats()
      return {
        ...s,
        calls: s.calls + apiCalls,
        ok: s.ok + apiOk,
        failed: s.failed + apiFailed,
      }
    },
  })

  try {
    let audio = args.audio
    if (!audio) {
      const url = sh('npx', ['tsx', resolve('scripts/resolve-pleno-video.ts'), args.plenoId]).trim()
      if (!url) throw new Error('could not resolve the session video')
      process.stdout.write(`[speaker-map] ${args.plenoId} → ${url}\n[speaker-map] downloading…\n`)
      sh('yt-dlp', [
        '-x',
        '--audio-format',
        'mp3',
        '--audio-quality',
        '5',
        '--output',
        join(work, 'audio.%(ext)s'),
        '--quiet',
        '--no-warnings',
        url,
      ])
      audio = join(work, 'audio.mp3')
    }
    if (!existsSync(audio)) throw new Error(`no audio at ${audio}`)

    // The published transcript is the reference the coverage gate scores
    // against: it is the record of WHERE SPEECH IS, so a chunk that is mostly
    // silence is not mistaken for a chunk that was mostly missed. Required,
    // not optional — without it the gate cannot tell those apart, and guessing
    // either way is how 15uvjew chunk 0 was misjudged twice. Every session in
    // the backlog has one.
    const transcriptPath = resolve('public/data/pleno-transcripts', `${args.plenoId}.txt`)
    const reference: RawSegment[] = existsSync(transcriptPath)
      ? parseDiarizedTranscript(readFileSync(transcriptPath, 'utf8'))
      : []
    // Fail CLOSED. The file existing proves nothing: 23 of the 44 files in that
    // directory are acta text with placeholder [0.0 → 0.0] stamps and no
    // speaker labels, which parse to zero segments. An empty reference makes
    // every window look silent, and referenceCoverage answers 1 for silence —
    // so the gate would pass precisely the truncated chunks it exists to stop.
    if (!isUsableReference(reference)) {
      throw new Error(
        `no usable diarized transcript for ${args.plenoId} at ${transcriptPath} ` +
          `(${reference.length} parsed line(s)). The coverage gate scores against it and cannot ` +
          `run without one — transcribe this session before mapping its speakers.`,
      )
    }
    process.stdout.write(
      `[speaker-map] reference: ${reference.length} published line(s), ` +
        `${Math.round(speechSeconds(reference, 0, Number.MAX_SAFE_INTEGER))}s of speech\n`,
    )

    const total = durationOf(audio)
    const chunkDir = join(work, 'chunks')
    mkdirSync(chunkDir, { recursive: true })
    sh('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      audio,
      '-f',
      'segment',
      '-segment_time',
      String(SPEAKER_MAP_CHUNK_SECONDS),
      '-reset_timestamps',
      '1',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-c:a',
      'libopus',
      '-b:a',
      '64k',
      join(chunkDir, 'chunk-%03d.ogg'),
    ])
    const chunks = readdirSync(chunkDir)
      .filter((f) => f.endsWith('.ogg'))
      .sort()

    // A truncated download decodes to less audio than its header claims, and
    // ffmpeg then emits fewer segments without failing. Comparing the two
    // numbers costs nothing and is how a 7%-of-a-session transcript shipped.
    const expected = Math.ceil(total / SPEAKER_MAP_CHUNK_SECONDS)
    if (chunks.length < expected) {
      throw new Error(
        `${Math.round(total)}s should split into ${expected} chunk(s), got ${chunks.length} — ` +
          `the download is truncated. Refusing to publish a partial map.`,
      )
    }

    process.stdout.write(
      `[speaker-map] ${Math.round(total)}s · ${chunks.length} chunk(s) of ` +
        `${SPEAKER_MAP_CHUNK_SECONDS}s · budget ${args.maxChunks === Infinity ? 'unlimited' : `${args.maxChunks} attempt(s)`} · model ${MODEL}\n`,
    )

    const prompt = buildSpeakerMapPrompt()

    // ── Resume ──────────────────────────────────────────────────────────
    // A 25-chunk session against a 20-request daily quota cannot finish in one
    // run, so an unfinished map is the NORMAL state, not an error. Carry the
    // previous run's work forward and skip the chunks it already covered;
    // without this the run restarts at chunk 0 every day and the tail of a long
    // session is unreachable at any quota.
    //
    // Chunks are keyed by index, which is stable because the same audio split
    // at the same `SPEAKER_MAP_CHUNK_SECONDS` yields the same segments. A
    // change to that constant invalidates the resume, so it is recorded in the
    // map and checked here.
    const priorPath = join(OUT_DIR, `${args.plenoId}.json`)
    let prior: SpeakerMap | null = null
    if (!args.restart && existsSync(priorPath)) {
      try {
        const p = JSON.parse(readFileSync(priorPath, 'utf8')) as SpeakerMap
        if (p.chunkSeconds === SPEAKER_MAP_CHUNK_SECONDS) prior = p
        else {
          process.stdout.write(
            `[speaker-map] existing map used ${p.chunkSeconds}s chunks, now ${SPEAKER_MAP_CHUNK_SECONDS}s — starting over\n`,
          )
        }
      } catch {
        process.stdout.write('[speaker-map] existing map unreadable — starting over\n')
      }
    }

    // A chunk is done when the previous run's segments for it clear the SAME
    // coverage floor a fresh chunk must clear. Deriving it from the segments
    // rather than trusting a counter means a truncated write cannot make the
    // run skip work it never did — and scoring them means a chunk admitted by
    // the old last-timestamp metric is re-opened rather than inherited. See
    // `resumableChunks`.
    const doneChunks = prior
      ? resumableChunks(
          prior.segments,
          reference,
          SPEAKER_MAP_CHUNK_SECONDS,
          chunks.length,
          SPEAKER_MAP_COVERAGE_FLOOR,
        )
      : new Set<number>()

    // Carry forward ONLY the re-verified chunks. A chunk being re-attempted
    // must not keep its old segments as well as gain new ones, or the map ends
    // up holding both readings of the same minutes.
    const chunkOfLabel = (label: string): number => Number(label.slice(1, label.indexOf('/')))
    const keptSegments = prior
      ? prior.segments.filter((s) =>
          doneChunks.has(Math.floor(s.start / SPEAKER_MAP_CHUNK_SECONDS)),
        )
      : []
    const keptRows = prior ? prior.rows.filter((r) => doneChunks.has(chunkOfLabel(r.label))) : []
    if (prior) {
      const reopened = new Set(
        prior.segments
          .map((s) => Math.floor(s.start / SPEAKER_MAP_CHUNK_SECONDS))
          .filter((i) => !doneChunks.has(i)),
      )
      process.stdout.write(
        `[speaker-map] resuming: ${doneChunks.size} chunk(s) already mapped, ` +
          `${keptRows.length} row(s) carried forward` +
          (reopened.size
            ? ` · ${reopened.size} chunk(s) RE-OPENED below the ${SPEAKER_MAP_COVERAGE_FLOOR * 100}% floor ` +
              `(${[...reopened].sort((a, b) => a - b).join(', ')}), ` +
              `${prior.rows.length - keptRows.length} row(s) dropped with them`
            : '') +
          `\n`,
      )
    }

    const segments: RawSegment[] = [...keptSegments]
    const rows: SpeakerMapRow[] = [...keptRows]
    const rejected: RejectedCandidate[] = prior
      ? prior.rejected.map((r) => ({ ...r }) as RejectedCandidate)
      : []
    const failedChunks: Array<{ chunk: number; why: string }> = []
    let quotaExhausted: string | null = null
    const adjudicated: Record<AdjudicationOutcome, number> = {
      accepted: 0,
      rejected: 0,
      'not-adjudicated': 0,
    }
    let adjudicationSkipped = 0
    let labelsSeen = 0
    // Chunk INDICES that hold a usable transcript, carried-forward or new — not
    // a counter. A counter cannot say WHICH, and the quota break needs to know.
    const completed = new Set<number>()
    /** Chunks this run actually sent to the model — what it cost, not what it holds. */
    let attempted = 0

    for (const i of doneChunks) completed.add(i)
    // The budget limits ATTEMPTS, never how far into the session we look —
    // capping the index range is what left 8 of 21 sessions with a permanently
    // unreachable tail. See `chunksToAttempt`.
    const toAttempt = chunksToAttempt(chunks.length, doneChunks, args.maxChunks)
    if (toAttempt.length) {
      process.stdout.write(
        `[speaker-map] attempting ${toAttempt.length} chunk(s): ${toAttempt.join(', ')}\n`,
      )
    }
    // What this run SET OUT to do. The four manifest buckets below must add
    // back up to it, which is what makes "it did nothing" impossible to hide.
    runLog.attempt(toAttempt.length)
    for (const i of toAttempt) {
      attempted += 1
      const path = join(chunkDir, chunks[i])
      const offset = i * SPEAKER_MAP_CHUNK_SECONDS
      const chunkDur = durationOf(path)
      process.stdout.write(
        `[speaker-map]   chunk ${i + 1}/${chunks.length} (${Math.round(chunkDur)}s)… `,
      )

      // Coverage, per chunk, before anything is kept. The same floor the
      // OpenAI path already applies — a partial chunk reads downstream as a
      // stretch where nobody spoke.
      //
      // Early truncation is FLAKY, not deterministic: measured 2026-08-10, two
      // runs over byte-identical audio returned 83% and 101% of the same chunk.
      // So a short answer earns a retry; only a chunk that keeps coming back
      // short is recorded as missing.
      //
      // Coverage is measured against the speech the PUBLISHED transcript puts
      // in this window, not against the window's length — silence is not
      // missing data. 15uvjew does not begin until 545 s, so chunk 0 holds 34 s
      // of speech in 600 s; both the old last-timestamp rule and a naive
      // union/duration rule get it wrong, in opposite directions. See
      // `referenceCoverage`.
      let parsed: ReturnType<typeof parseSpeakerMapResponse> | null = null
      let coverage = 0
      let lastWhy = ''
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          apiCalls += 1
          const candidate = parseSpeakerMapResponse(transcribeChunk(path, apiKey, prompt))
          apiOk += 1
          coverage = referenceCoverage(
            candidate.segments.map((s) => ({ ...s, start: s.start + offset, end: s.end + offset })),
            reference,
            offset,
            offset + chunkDur,
          )
          if (coverage >= SPEAKER_MAP_COVERAGE_FLOOR) {
            parsed = candidate
            break
          }
          lastWhy = `covered ${(coverage * 100).toFixed(0)}% (floor ${SPEAKER_MAP_COVERAGE_FLOOR * 100}%)`
        } catch (err) {
          apiFailed += 1
          // A daily quota is not a flake. Retrying burns nothing but time and
          // makes the log lie about what happened, so stop the whole run and
          // say plainly that it must resume later.
          if (err instanceof ApiError && err.code === 429) {
            quotaExhausted = err.message
            break
          }
          lastWhy = err instanceof Error ? err.message : String(err)
        }
        if (attempt < 3) process.stdout.write(`retry ${attempt} (${lastWhy})… `)
      }
      if (quotaExhausted) {
        failedChunks.push({ chunk: i, why: 'quota exhausted, never attempted further' })
        runLog.skip('quota-exhausted')
        // The rest of the plan was never reached — a different fact from a
        // chunk the model looked at and failed.
        runLog.neverAttempt(toAttempt.length - toAttempt.indexOf(i) - 1)
        process.stdout.write(`QUOTA\n`)
        break
      }

      if (!parsed) {
        // Record the gap and carry on. Aborting would throw away every other
        // chunk, and a stretch with no map simply produces no attribution —
        // which is the honest outcome, not a wrong one.
        failedChunks.push({ chunk: i, why: lastWhy })
        // Bucket by KIND, not by the formatted message — «covered 9%» and
        // «covered 2%» are one failure mode, and a reason-per-percentage
        // makes the tally unreadable.
        runLog.skip(lastWhy.startsWith('covered ') ? 'below-coverage-floor' : 'transcribe-failed')
        process.stdout.write(`GAP · ${lastWhy}\n`)
        continue
      }

      // Validate against THIS chunk's own segments — labels are chunk-local,
      // so a cross-chunk check would compare unrelated speakers.
      const v = validateSpeakerMap({
        candidates: parsed.candidates,
        segments: parsed.segments,
        officials,
        seats,
      })
      labelsSeen += new Set(parsed.segments.map((s) => s.speaker)).size

      // A back-reference resolves but cannot be confirmed positionally, so the
      // validator keeps it `weak` and `blocForLabel` refuses it. Ask a text
      // model whether the cited line identifies that speaker or merely mentions
      // them. It never proposes anyone, and a backend that does not answer
      // leaves the row exactly as weak as it was.
      if (!SKIP_ADJUDICATION && v.rows.some((r) => r.weak)) {
        const adj = await adjudicateWeakRows({
          rows: v.rows,
          segments: parsed.segments,
          max: ADJUDICATE_MAX,
        })
        v.rows = applyAdjudications(v.rows, adj.results)
        for (const k of Object.keys(adj.tally) as AdjudicationOutcome[]) {
          adjudicated[k] += adj.tally[k]
        }
        adjudicationSkipped += adj.skipped
      }

      for (const s of parsed.segments) {
        segments.push({
          start: s.start + offset,
          end: s.end + offset,
          speaker: globalLabel(i, s.speaker),
          text: s.text,
        })
      }
      for (const r of v.rows) {
        rows.push({
          ...r,
          label: globalLabel(i, r.label),
          evidence: r.evidence.map((e) => ({
            ...e,
            spokenBy: globalLabel(i, e.spokenBy),
            at: e.at + offset,
          })),
        })
      }
      for (const rj of v.rejected) rejected.push({ ...rj, label: globalLabel(i, rj.label) })
      completed.add(i)
      runLog.judge()
      process.stdout.write(
        `${parsed.segments.length} seg · ${v.rows.length} row(s) · ${v.rejected.length} rejected\n`,
      )
    }

    // Every chunk with no verdict yet, by INDEX. The old arithmetic
    // (`done + failedChunks.length`) assumed the loop had walked in order from
    // zero, which a resume makes false — see `unattemptedChunks`. This runs
    // unconditionally now: a run stopped by its BUDGET left those chunks
    // unaccounted for entirely, which reads downstream as "nothing there".
    const failedIdx = new Set(failedChunks.map((f) => f.chunk))
    const leftover = unattemptedChunks(chunks.length, completed, failedIdx)
    // Stopped by its own budget rather than by the API. Worth saying out loud:
    // it is the one "incomplete" outcome that costs nothing and needs no fix.
    const budgetSpent = !quotaExhausted && leftover.length > 0
    if (leftover.length) {
      // Two different facts, and a resumable one must not read as a failure.
      const why = quotaExhausted
        ? 'never attempted (quota exhausted earlier in the run)'
        : 'never attempted (chunk budget spent; resumes next run)'
      for (const i of leftover) failedChunks.push({ chunk: i, why })
    }

    const map: SpeakerMap = {
      plenoId: args.plenoId,
      generatedAt: new Date().toISOString(),
      model: MODEL,
      promptVersion: SPEAKER_MAP_PROMPT_VERSION,
      chunkSeconds: SPEAKER_MAP_CHUNK_SECONDS,
      segments,
      rows,
      rejected,
      stats: {
        // The SESSION's chunk count, not this run's plan. A capped run that
        // wrote 16 of 25 must not look complete — that is what tells the
        // backlog to come back tomorrow.
        chunksExpected: chunks.length,
        chunksTranscribed: completed.size,
        failedChunks,
        labelsSeen,
        rowsAccepted: rows.length,
        rowsRejected: rejected.length,
        rejectedBy: rejectionTally(rejected),
        // What this run COST, as opposed to what the map now holds. The
        // nightly budget subtracts this; chunksTranscribed would charge it for
        // chunks carried forward at no cost.
        attemptedThisRun: attempted,
        // Share of the session's SPEECH the map recovered, on the same basis
        // as the per-chunk gate. The last timestamp over the duration reported
        // 68.5% for a run holding 7 of 17 chunks — it measured how far into
        // the session the final segment fell, which one late chunk maximises
        // however much is missing before it.
        coverage: referenceCoverage(segments, reference, 0, total),
      },
    }

    mkdirSync(OUT_DIR, { recursive: true })
    const out = join(OUT_DIR, `${args.plenoId}.json`)

    // A run cut short must not delete what a complete run found. This already
    // happened once during development: a quota-blocked run wrote a 0-row map
    // over a good 5-row one. `decideSnapshotWrite` is the repo's existing
    // answer — complete runs always write, incomplete runs may add but never
    // remove. It counts `.items`, so the existing rows are presented under
    // that name; nothing else about the file changes.
    const existingRaw = existsSync(out) ? readFileSync(out, 'utf8') : null
    let existingAsItems: string | null = null
    if (existingRaw) {
      try {
        existingAsItems = JSON.stringify({ items: JSON.parse(existingRaw).rows ?? [] })
      } catch {
        existingAsItems = null
      }
    }
    // Nothing transcribed and nothing carried forward means there is no map to
    // write. `decideSnapshotWrite` would allow it — 0 over 0 does not shrink
    // anything — but a 0-row file on disk looks like a result, and the backlog,
    // the reconciler and a reader all have to special-case it. No file is the
    // honest representation of "this never ran".
    if (completed.size === 0 && !prior) {
      process.stdout.write(
        `\n[speaker-map] NOT WRITING ${out}\n` +
          `  no chunk produced a transcript and there was no earlier map, so there is\n` +
          `  nothing to record. An empty map would read as "nobody was identifiable".\n` +
          `  ${quotaExhausted ? 'Cause: quota. Retry after the free tier rolls over (00:00 Pacific).' : 'See the failures above.'}\n`,
      )
      process.exitCode = 1
      return
    }

    const decision = decideSnapshotWrite({
      incomingCount: rows.length,
      // Any chunk without a transcript means this run is not evidence that a
      // previously-found speaker has gone away.
      unresolvedCount: failedChunks.length,
      existingRaw: existingAsItems,
      itemNoun: 'speaker row',
    })
    if (!decision.write) {
      process.stdout.write(
        `\n[speaker-map] NOT WRITING ${out}\n` +
          `  ${decision.reason}\n` +
          `  ${decision.existingCount} row(s) already on disk, this run produced ${decision.incomingCount}.\n` +
          `  Re-run when the quota resets; the existing map is untouched.\n`,
      )
      process.exitCode = 1
      return
    }
    writeFileSync(out, JSON.stringify(map, null, 2) + '\n')

    const bySlug = new Map<string, string[]>()
    for (const r of rows) if (r.slug) bySlug.set(r.slug, [...(bySlug.get(r.slug) ?? []), r.label])

    process.stdout.write(
      `\n[speaker-map] ${out}\n` +
        `  chunks        ${completed.size}/${chunks.length} transcribed` +
        `${failedChunks.length ? `, ${failedChunks.length} GAP(S): ${failedChunks.map((f) => f.chunk).join(', ')}` : ''}` +
        `${budgetSpent ? ` · budget spent (${args.maxChunks} attempt(s)), rest resumes next run` : ''}\n` +
        `  coverage      ${(map.stats.coverage * 100).toFixed(1)}% of ${Math.round(total)}s\n` +
        `  labels seen   ${labelsSeen}\n` +
        `  rows accepted ${rows.length}  (${rows.filter((r) => r.weak).length} weak)\n` +
        `  back-refs     ${adjudicated.accepted} confirmed · ${adjudicated.rejected} rejected · ` +
        `${adjudicated['not-adjudicated']} NOT adjudicated (backend silent — still weak)` +
        `${adjudicationSkipped ? ` · ${adjudicationSkipped} never sent (cap ${ADJUDICATE_MAX})` : ''}\n` +
        `  rows rejected ${rejected.length}  ${JSON.stringify(map.stats.rejectedBy)}\n` +
        `  councillors   ${bySlug.size} identified across chunks\n`,
    )
    for (const [slug, labels] of bySlug) {
      process.stdout.write(`    ${slug.padEnd(34)} ${labels.join(' ')}\n`)
    }
    if (rows.length === 0) {
      // "Nobody was identifiable" and "the run never got to look" are different
      // facts and must not print the same sentence.
      process.stdout.write(
        quotaExhausted
          ? `\n  No rows because the run never ran: the API quota was exhausted before\n` +
              `  any chunk completed. This says nothing about who spoke.\n  ${quotaExhausted}\n`
          : failedChunks.length === chunks.length
            ? `\n  No rows because no chunk produced a usable transcript. See failedChunks.\n`
            : `\n  No rows, and that is a real finding rather than a silent pass:\n` +
              `  ${labelsSeen} labels were seen and every candidate failed a gate.\n` +
              `  See rejectedBy above for which.\n`,
      )
    }
  } finally {
    // In `finally` so EVERY exit path records — including the early return
    // when `decideSnapshotWrite` refuses, and a throw. A pass that dies
    // silently is the one `check:runs` exists to notice, so it must not be the
    // one path that writes no manifest.
    const { manifest, findings } = runLog.finish({
      exitCode: typeof process.exitCode === 'number' ? process.exitCode : 0,
    })
    process.stdout.write(`\n${formatManifest(manifest)}\n`)
    for (const f of findings) {
      process.stdout.write(`  ${f.level.toUpperCase()} [${f.code}] ${f.message}\n`)
    }
    if (!args.keepAudio) rmSync(work, { recursive: true, force: true })
    else process.stdout.write(`[speaker-map] kept working dir ${work}\n`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`[speaker-map] FAILED: ${err instanceof Error ? err.message : err}\n`)
    process.exit(1)
  })
}
