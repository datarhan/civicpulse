#!/usr/bin/env tsx
/**
 * Transcribe one local audio/video file via Whisper. Used by the
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
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

/** OpenAI Whisper API branch. Splits into ≤24 MB chunks if needed.
 *  Mirrors transcribe-pleno.sh's chunking logic but runs via Node. */
async function transcribeOpenAI(opusPath: string, workdir: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY not set')
  const sizeBytes = (() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs: typeof import('node:fs') = require('node:fs')
    return fs.statSync(opusPath).size
  })()
  const CHUNK_BYTES = 24 * 1024 * 1024
  let chunkPaths: string[]
  if (sizeBytes <= CHUNK_BYTES) {
    chunkPaths = [opusPath]
  } else {
    logProgress(`splitting ${sizeBytes} bytes into chunks…`)
    const chunkDir = join(workdir, 'chunks')
    spawnSync('mkdir', ['-p', chunkDir])
    spawnSync('ffmpeg', [
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs: typeof import('node:fs') = require('node:fs')
    chunkPaths = fs
      .readdirSync(chunkDir)
      .filter((f) => f.startsWith('chunk-'))
      .sort()
      .map((f) => join(chunkDir, f))
  }

  const segments: string[] = []
  for (let idx = 0; idx < chunkPaths.length; idx++) {
    logProgress(`uploading chunk ${idx + 1}/${chunkPaths.length}…`)
    // OpenAI multipart upload via curl — same approach as the bash
    // pipeline so we stay close to a known-good code path.
    const respPath = join(workdir, `resp-${idx}.json`)
    const cr = spawnSync(
      'curl',
      [
        '-sS',
        '-o',
        respPath,
        '-w',
        '%{http_code}',
        'https://api.openai.com/v1/audio/transcriptions',
        '-H',
        `Authorization: Bearer ${apiKey}`,
        '-F',
        `file=@${chunkPaths[idx]}`,
        '-F',
        'model=whisper-1',
        '-F',
        'language=es',
        '-F',
        'response_format=verbose_json',
      ],
      { encoding: 'utf8' },
    )
    const httpCode = cr.stdout?.trim() ?? '000'
    if (cr.status !== 0 || httpCode !== '200') {
      const body = existsSync(respPath) ? readFileSync(respPath, 'utf8') : '(no body)'
      throw new Error(`OpenAI ${httpCode}: ${body.slice(0, 200)}`)
    }
    const data = JSON.parse(readFileSync(respPath, 'utf8')) as {
      text?: string
      segments?: Array<{ text?: string }>
    }
    if (Array.isArray(data.segments) && data.segments.length > 0) {
      for (const s of data.segments) if (s.text) segments.push(s.text.trim())
    } else if (data.text) {
      segments.push(data.text.trim())
    }
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
  logProgress(`engine=${opts.engine} model=${opts.whisperModel} file=${opts.path}`)
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

// Silence unused-import linter when fs is loaded via require above.
void writeFileSync
