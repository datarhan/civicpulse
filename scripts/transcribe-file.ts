#!/usr/bin/env tsx
/**
 * Transcribe one local audio/video file (Whisper locally, gpt-transcribe
 * on the `openai` engine). Used by the
 * curator dashboard (via the job runner) to ingest non-pleno
 * evidence — press conferences, citizen recordings, etc.
 *
 *   npm run transcribe-file -- --path /abs/path/file.mp4 [--engine mlx|local|openai]
 *
 * Output (stdout, last line is parseable JSON):
 *   {
 *     "kind": "transcript",
 *     "sourceUrl": "<basename>",
 *     "title": "<first sentence>",
 *     "snippet": "<≤1500 chars>",
 *     "fullTranscript": "<full text>"
 *   }
 *
 * Backend selection mirrors `scripts/transcribe-pleno.sh` but skips
 * yt-dlp (we work from a local file) and the auto-vote-extraction
 * trigger (curator transcripts aren't plenos).
 */
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

interface CliArgs {
  path: string
  engine: 'mlx' | 'local' | 'openai'
  whisperModel: string
}

function parseArgs(argv: string[]): CliArgs {
  const out: Partial<CliArgs> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--path') out.path = argv[++i]
    else if (a === '--engine') out.engine = argv[++i] as CliArgs['engine']
    else if (a === '--whisper-model') out.whisperModel = argv[++i]
    else {
      process.stderr.write(`[transcribe-file] unknown flag: ${a}\n`)
      process.exit(2)
    }
  }
  if (!out.path) {
    process.stderr.write('[transcribe-file] --path required\n')
    process.exit(2)
  }
  if (!out.path.startsWith('/')) {
    process.stderr.write('[transcribe-file] --path must be absolute\n')
    process.exit(2)
  }
  if (!existsSync(out.path)) {
    process.stderr.write(`[transcribe-file] file not found: ${out.path}\n`)
    process.exit(2)
  }
  out.engine = out.engine ?? (process.env.WHISPER_ENGINE as CliArgs['engine']) ?? 'local'
  if (!['mlx', 'local', 'openai'].includes(out.engine)) {
    process.stderr.write(`[transcribe-file] unsupported engine: ${out.engine}\n`)
    process.exit(2)
  }
  out.whisperModel = out.whisperModel ?? process.env.WHISPER_MODEL ?? 'large-v3'
  return out as CliArgs
}

function logProgress(msg: string) {
  // Stderr only — stdout reserved for the final JSON.
  process.stderr.write(`[transcribe-file] ${msg}\n`)
}

/** Re-encode the input file to 16 kHz mono opus — small + uniform.
 *  Used by all three engines, so the same file lands on all paths. */
function reencodeToOpus(inPath: string, outPath: string): void {
  const r = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      inPath,
      '-ac',
      '1',
      '-ar',
      '16000',
      '-c:a',
      'libopus',
      '-b:a',
      '24k',
      outPath,
    ],
    { stdio: 'inherit' },
  )
  if (r.status !== 0) throw new Error(`ffmpeg re-encode failed (exit ${r.status})`)
}

/** OpenAI transcription branch. Always splits into 20-min chunks, the
 *  same window transcribe-pleno.sh uses.
 *
 *  Chunked by DURATION, not by bytes. The old ≤24 MB test sent anything
 *  under ~2 h (24 kbps opus) as ONE request — the shape the 2026-07-29
 *  postmortem caught degenerating into hallucination loops.
 *
 *  gpt-transcribe, NOT whisper-1. Measured 2026-09-23 on 15uvjew
 *  [3600, 4810)s: whisper-1 with `language=es` put the Valencian turns
 *  into Spanish — «aprofitant el vot a favor que tenim» came back as
 *  «aprovechando el voto a favor que tenemos», a sentence the councillor
 *  never said — while gpt-transcribe kept it verbatim. `languages[]=ca`
 *  + `es` declares the chamber's two tongues without forcing either.
 *  No `keywords`: this path ingests arbitrary recordings, and a fixed
 *  vocabulary biases every one of them toward names that may not be
 *  in the audio. */
async function transcribeOpenAI(opusPath: string, workdir: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY not set')
  // The key goes in a 0600 header file, not on curl's argv: the process
  // table is world-readable for the whole upload.
  const authHeader = join(workdir, 'auth.header')
  writeFileSync(authHeader, `Authorization: Bearer ${apiKey}\n`, { mode: 0o600 })
  const chunkDir = join(workdir, 'chunks')
  mkdirSync(chunkDir, { recursive: true })
  const seg = spawnSync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    opusPath,
    '-f',
    'segment',
    '-segment_time',
    '1200',
    '-c',
    'copy',
    join(chunkDir, 'chunk-%03d.ogg'),
  ])
  if (seg.status !== 0) throw new Error(`ffmpeg segment failed (exit ${seg.status})`)
  const chunkPaths = readdirSync(chunkDir)
    .filter((f) => f.startsWith('chunk-'))
    .sort()
    .map((f) => join(chunkDir, f))
  if (chunkPaths.length === 0) throw new Error('ffmpeg produced no chunks')
  if (chunkPaths.length > 1) logProgress(`split into ${chunkPaths.length} chunks of ≤20 min`)

  const segments: string[] = []
  for (let idx = 0; idx < chunkPaths.length; idx++) {
    logProgress(`uploading chunk ${idx + 1}/${chunkPaths.length}…`)
    // OpenAI multipart upload via curl — same approach as the bash
    // pipeline so we stay close to a known-good code path.
    const respPath = join(workdir, `resp-${idx}.json`)
    // Retries with backoff, as in transcribe-pleno.sh: a dropped upload
    // (curl exit, HTTP 000) happens on a 20-min chunk and is not a verdict.
    let httpCode = '000'
    let curlErr = ''
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) {
        logProgress(`chunk ${idx + 1} retry ${attempt}/3 (prev HTTP ${httpCode})`)
        await new Promise((r) => setTimeout(r, 2 ** attempt * 1000))
      }
      rmSync(respPath, { force: true })
      const cr = spawnSync(
        'curl',
        [
          '-sS',
          '--connect-timeout',
          '30',
          '--max-time',
          '1800',
          '-o',
          respPath,
          '-w',
          '%{http_code}',
          'https://api.openai.com/v1/audio/transcriptions',
          '-H',
          `@${authHeader}`,
          '-F',
          `file=@${chunkPaths[idx]}`,
          '-F',
          `model=${process.env.OPENAI_TRANSCRIBE_FILE_MODEL || 'gpt-transcribe'}`,
          '-F',
          'languages[]=ca',
          '-F',
          'languages[]=es',
          '-F',
          'response_format=json',
        ],
        { encoding: 'utf8' },
      )
      httpCode = cr.stdout?.trim() || '000'
      curlErr = cr.stderr?.trim() ?? ''
      if (cr.status === 0 && httpCode === '200') break
      // A 4xx other than 429 is the request itself; retrying repeats it.
      if (/^4\d\d$/.test(httpCode) && httpCode !== '429') break
    }
    if (httpCode !== '200') {
      const body = existsSync(respPath) ? readFileSync(respPath, 'utf8') : '(no body)'
      throw new Error(`OpenAI ${httpCode}: ${body.slice(0, 200)} ${curlErr.slice(0, 200)}`.trim())
    }
    const data = JSON.parse(readFileSync(respPath, 'utf8')) as { text?: string }
    // An empty chunk is a hole in the middle of the transcript, not
    // silence: fail rather than join around it.
    if (!data.text?.trim()) throw new Error(`chunk ${idx + 1} came back with no text`)
    segments.push(data.text.trim())
  }
  return segments.join(' ').replace(/\s+/g, ' ').trim()
}

/** Apple Neural Engine (lightning-whisper-mlx). */
function transcribeMlx(opusPath: string, model: string): string {
  const py = `${process.env.HOME}/.local/civicpulse-mlx/venv/bin/python`
  if (!existsSync(py)) {
    throw new Error(`MLX venv missing at ${py}. Bootstrap per docs/CLAUDE.md`)
  }
  // Inline Python: load model, transcribe, print JSON.
  const script = `
import json, sys
from lightning_whisper_mlx import LightningWhisperMLX
m = LightningWhisperMLX(model="${model}", batch_size=12, quant=None)
r = m.transcribe(audio_path="${opusPath}", language="es")
text = r.get("text", "").strip()
print(json.dumps({"text": text}))
`
  const r = spawnSync(py, ['-c', script], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0) {
    throw new Error(`MLX failed: ${r.stderr || 'non-zero exit'}`)
  }
  const data = JSON.parse(r.stdout) as { text?: string }
  return (data.text ?? '').replace(/\s+/g, ' ').trim()
}

/** faster-whisper CPU int8 — slowest but always available. */
function transcribeLocal(opusPath: string, model: string): string {
  const py = `${process.env.HOME}/.local/civicpulse-fw/venv/bin/python`
  if (!existsSync(py)) {
    throw new Error(`faster-whisper venv missing at ${py}`)
  }
  const script = `
import json, sys
from faster_whisper import WhisperModel
m = WhisperModel("${model}", device="cpu", compute_type="int8")
segs, info = m.transcribe("${opusPath}", language="es")
text = " ".join(s.text.strip() for s in segs)
print(json.dumps({"text": text.strip()}))
`
  const r = spawnSync(py, ['-c', script], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0) {
    throw new Error(`faster-whisper failed: ${r.stderr || 'non-zero exit'}`)
  }
  const data = JSON.parse(r.stdout) as { text?: string }
  return (data.text ?? '').replace(/\s+/g, ' ').trim()
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const startedAt = Date.now()
  const workdir = mkdtempSync(join(tmpdir(), 'cp-curator-trx-'))
  const model =
    opts.engine === 'openai'
      ? process.env.OPENAI_TRANSCRIBE_FILE_MODEL || 'gpt-transcribe'
      : opts.whisperModel
  logProgress(`engine=${opts.engine} model=${model} file=${opts.path}`)
  try {
    const opus = join(workdir, 'audio.ogg')
    logProgress('re-encoding to 16 kHz mono opus…')
    reencodeToOpus(opts.path, opus)
    let text: string
    if (opts.engine === 'openai') text = await transcribeOpenAI(opus, workdir)
    else if (opts.engine === 'mlx') text = transcribeMlx(opus, opts.whisperModel)
    else text = transcribeLocal(opus, opts.whisperModel)
    if (!text || text.length < 10) {
      throw new Error(`transcript too short (${text.length} chars) — likely empty audio`)
    }
    // Title: first sentence-ish, capped at 200 chars.
    const titleSlice =
      text
        .split(/[.!?\n]/)
        .map((s) => s.trim())
        .find((s) => s.length > 5) ?? text.slice(0, 200)
    const title = titleSlice.slice(0, 200)
    const snippet = text.slice(0, 1500)
    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1)
    logProgress(`done · ${text.length} chars · ${elapsedSec}s`)
    process.stdout.write(
      JSON.stringify({
        kind: 'transcript',
        sourceUrl: basename(opts.path),
        title,
        snippet,
        fullTranscript: text,
      }) + '\n',
    )
  } finally {
    try {
      rmSync(workdir, { recursive: true, force: true })
    } catch {
      /* noop */
    }
  }
}

main().catch((err) => {
  process.stderr.write(
    `[transcribe-file] fatal: ${err instanceof Error ? err.message : String(err)}\n`,
  )
  process.exit(1)
})
