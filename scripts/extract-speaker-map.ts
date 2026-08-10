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
  SPEAKER_MAP_CHUNK_SECONDS,
  SPEAKER_MAP_COVERAGE_FLOOR,
} from '../src/scraper/speaker-map-prompt'
import { decideSnapshotWrite } from '../src/scraper/snapshot-write'
import {
  seatsFromOfficials,
  type OfficialLike,
  type OfficialsDoc,
} from '../src/scraper/corporation-seats'

const OUT_DIR = resolve('pleno-speaker-map')
const MODEL = process.env.SPEAKER_MAP_MODEL || 'gemini-3.5-flash'
const BASE = 'https://generativelanguage.googleapis.com'

interface Args {
  plenoId: string
  maxChunks: number
  audio: string | null
  keepAudio: boolean
}

function parseArgs(argv: string[]): Args {
  const out: Args = { plenoId: '', maxChunks: Infinity, audio: null, keepAudio: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--chunks') out.maxChunks = Number(argv[++i])
    else if (a === '--audio') out.audio = argv[++i]
    else if (a === '--keep-audio') out.keepAudio = true
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

    const planned = Math.min(chunks.length, args.maxChunks)
    process.stdout.write(
      `[speaker-map] ${Math.round(total)}s · ${chunks.length} chunk(s) of ` +
        `${SPEAKER_MAP_CHUNK_SECONDS}s · processing ${planned} · model ${MODEL}\n`,
    )

    const prompt = buildSpeakerMapPrompt()
    const segments: RawSegment[] = []
    const rows: SpeakerMapRow[] = []
    const rejected: RejectedCandidate[] = []
    const failedChunks: Array<{ chunk: number; why: string }> = []
    let quotaExhausted: string | null = null
    let labelsSeen = 0
    let done = 0

    for (let i = 0; i < planned; i++) {
      const path = join(chunkDir, chunks[i])
      const offset = i * SPEAKER_MAP_CHUNK_SECONDS
      const chunkDur = durationOf(path)
      process.stdout.write(`[speaker-map]   chunk ${i + 1}/${planned} (${Math.round(chunkDur)}s)… `)

      // Coverage, per chunk, before anything is kept. The same floor the
      // OpenAI path already applies — a partial chunk reads downstream as a
      // stretch where nobody spoke.
      //
      // Early truncation is FLAKY, not deterministic: measured 2026-08-10, two
      // runs over byte-identical audio returned 83% and 101% of the same chunk.
      // So a short answer earns a retry; only a chunk that keeps coming back
      // short is recorded as missing.
      let parsed: ReturnType<typeof parseSpeakerMapResponse> | null = null
      let coverage = 0
      let lastWhy = ''
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const candidate = parseSpeakerMapResponse(transcribeChunk(path, apiKey, prompt))
          const spanned = candidate.segments.length ? candidate.segments.at(-1)!.end : 0
          coverage = chunkDur > 0 ? spanned / chunkDur : 0
          if (coverage >= SPEAKER_MAP_COVERAGE_FLOOR) {
            parsed = candidate
            break
          }
          lastWhy = `covered ${(coverage * 100).toFixed(0)}% (floor ${SPEAKER_MAP_COVERAGE_FLOOR * 100}%)`
        } catch (err) {
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
        process.stdout.write(`QUOTA\n`)
        break
      }

      if (!parsed) {
        // Record the gap and carry on. Aborting would throw away every other
        // chunk, and a stretch with no map simply produces no attribution —
        // which is the honest outcome, not a wrong one.
        failedChunks.push({ chunk: i, why: lastWhy })
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
      done += 1
      process.stdout.write(
        `${parsed.segments.length} seg · ${v.rows.length} row(s) · ${v.rejected.length} rejected\n`,
      )
    }

    if (quotaExhausted) {
      for (let i = done + failedChunks.length; i < planned; i++) {
        failedChunks.push({ chunk: i, why: 'never attempted (quota exhausted earlier in the run)' })
      }
    }

    const spanned = segments.length ? segments.at(-1)!.end : 0
    const map: SpeakerMap = {
      plenoId: args.plenoId,
      generatedAt: new Date().toISOString(),
      model: MODEL,
      chunkSeconds: SPEAKER_MAP_CHUNK_SECONDS,
      segments,
      rows,
      rejected,
      stats: {
        chunksExpected: planned,
        chunksTranscribed: done,
        failedChunks,
        labelsSeen,
        rowsAccepted: rows.length,
        rowsRejected: rejected.length,
        rejectedBy: rejectionTally(rejected),
        coverage: total > 0 ? Math.min(1, spanned / total) : 0,
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
        `  chunks        ${done}/${planned} transcribed` +
        `${failedChunks.length ? `, ${failedChunks.length} GAP(S): ${failedChunks.map((f) => f.chunk).join(', ')}` : ''}` +
        `${planned < chunks.length ? ` (${chunks.length} in session, limited by --chunks)` : ''}\n` +
        `  coverage      ${(map.stats.coverage * 100).toFixed(1)}% of ${Math.round(total)}s\n` +
        `  labels seen   ${labelsSeen}\n` +
        `  rows accepted ${rows.length}  (${rows.filter((r) => r.weak).length} weak)\n` +
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
          : failedChunks.length === planned
            ? `\n  No rows because no chunk produced a usable transcript. See failedChunks.\n`
            : `\n  No rows, and that is a real finding rather than a silent pass:\n` +
              `  ${labelsSeen} labels were seen and every candidate failed a gate.\n` +
              `  See rejectedBy above for which.\n`,
      )
    }
  } finally {
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
