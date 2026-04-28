#!/usr/bin/env tsx
/**
 * Enroll a councillor's voiceprint from a reference audio file.
 *
 *   npm run enroll-voice -- --slug <officials-slug> --audio <path>
 *   npm run enroll-voice -- --slug robert-raga-gadea \
 *       --audio .voiceprints/audio/robert-raga-gadea-reel-DXMxH6FjJEr.opus
 *
 * Pipeline:
 *   1. Validate `slug` matches an official in officials.json (so a
 *      voiceprint can never be enrolled under a non-existent identity).
 *   2. ffmpeg-convert the input audio to mono 16 kHz WAV (the format
 *      speechbrain's ECAPA-TDNN model expects). Strip silence at the
 *      ends to keep the embedding focused on speech.
 *   3. Spawn the python embedding worker (~/.local/civicpulse-voice/venv).
 *      The worker loads `speechbrain/spkrec-ecapa-voxceleb`, runs
 *      `encode_batch()` on the wav, and prints the 192-dim vector + L2
 *      norm as JSON on stdout.
 *   4. Write the vector to `.voiceprints/<slug>.npy` (binary float32
 *      array; tiny, gitignored).
 *   5. Update `.voiceprints/index.json`: a curator-readable manifest
 *      of who's enrolled, when, from what source, with what confidence.
 *
 * The voiceprint database is intentionally local-only (.voiceprints/
 * is gitignored). Enrollment + identification are dev-only operations
 * that produce derived data; the published outputs stay
 * bloc-attributed unless a curator explicitly promotes individual
 * attribution.
 */
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'

const OFFICIALS = resolve('public/data/officials.json')
const VOICEPRINTS_DIR = resolve('.voiceprints')
const INDEX_PATH = resolve(VOICEPRINTS_DIR, 'index.json')
const VOICE_PY = `${process.env.HOME}/.local/civicpulse-voice/venv/bin/python`
const VOICE_MODELS_DIR = `${process.env.HOME}/.local/civicpulse-voice/models/spkrec-ecapa-voxceleb`

interface CliArgs {
  slug: string
  /** Either --audio (local path) OR --url (Instagram/YouTube/etc., yt-dlp). */
  audio?: string
  url?: string
  /** When true, overwrite an existing voiceprint without --force prompt. */
  force: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const out: Partial<CliArgs> = { force: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--slug') out.slug = argv[++i]
    else if (a === '--audio') out.audio = argv[++i]
    else if (a === '--url') out.url = argv[++i]
    else if (a === '--force') out.force = true
    else {
      process.stderr.write(`[enroll-voice] unknown flag: ${a}\n`)
      process.exit(2)
    }
  }
  if (!out.slug || (!out.audio && !out.url)) {
    process.stderr.write(
      'usage: enroll-voice.ts --slug <slug> (--audio <path> | --url <url>) [--force]\n',
    )
    process.exit(2)
  }
  if (out.audio && out.url) {
    process.stderr.write('[enroll-voice] pass either --audio or --url, not both\n')
    process.exit(2)
  }
  return out as CliArgs
}

/**
 * Download audio from a public URL via yt-dlp. Lands as opus in
 * .voiceprints/audio/<slug>-<timestamp>.opus. Same downloader the
 * pleno-transcription pipeline uses, so format coverage is the same.
 */
function downloadAudioToCache(slug: string, url: string): string {
  mkdirSync(resolve(VOICEPRINTS_DIR, 'audio'), { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const stem = `${slug}-${ts}`
  const outTemplate = resolve(VOICEPRINTS_DIR, `audio/${stem}.%(ext)s`)
  process.stderr.write(`[enroll-voice]   yt-dlp ${url} → ${outTemplate}\n`)
  const r = spawnSync(
    'yt-dlp',
    [
      '--no-playlist',
      '--extract-audio',
      '--audio-format',
      'opus',
      '--audio-quality',
      '32k',
      '-o',
      outTemplate,
      '--no-warnings',
      url,
    ],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  )
  if (r.status !== 0) {
    throw new Error(`yt-dlp failed: ${r.stderr.slice(-500) || 'non-zero exit'}`)
  }
  // yt-dlp picks the extension; opus is what we asked for.
  const expected = resolve(VOICEPRINTS_DIR, `audio/${stem}.opus`)
  if (!existsSync(expected)) {
    throw new Error(`yt-dlp completed but ${expected} not found`)
  }
  return expected
}

interface Official {
  name: string
  slug: string
  party?: string
  role?: string
}

function loadOfficial(slug: string): Official {
  if (!existsSync(OFFICIALS)) {
    process.stderr.write(`[enroll-voice] officials.json missing: ${OFFICIALS}\n`)
    process.exit(1)
  }
  const raw = JSON.parse(readFileSync(OFFICIALS, 'utf8')) as {
    officials?: Official[]
    items?: Official[]
  }
  const list = raw.officials ?? raw.items ?? []
  const match = list.find((o) => o.slug === slug)
  if (!match) {
    process.stderr.write(
      `[enroll-voice] slug "${slug}" not found in officials.json. Known slugs:\n`,
    )
    for (const o of list.slice(0, 5)) process.stderr.write(`  · ${o.slug}\n`)
    process.stderr.write(`  · …${list.length - 5} more\n`)
    process.exit(1)
  }
  return match
}

interface IndexEntry {
  slug: string
  name: string
  party: string | null
  role: string | null
  enrolledAt: string
  /** Path to the (cached) audio file used for enrollment. */
  sourceAudio: string
  /** When enrolled via --url, the original public URL for audit. */
  sourceUrl: string | null
  durationSec: number
  embeddingDim: number
  embeddingNorm: number
  /** Tag for the model used. Re-enroll when this changes (different
   *  model = different vector space, can't compare across models). */
  model: 'speechbrain/spkrec-ecapa-voxceleb'
}

function loadIndex(): { entries: IndexEntry[]; generatedAt: string } {
  if (!existsSync(INDEX_PATH)) {
    return { entries: [], generatedAt: new Date(0).toISOString() }
  }
  return JSON.parse(readFileSync(INDEX_PATH, 'utf8'))
}

function writeIndex(entries: IndexEntry[]): void {
  mkdirSync(VOICEPRINTS_DIR, { recursive: true })
  const tmp = `${INDEX_PATH}.tmp`
  writeFileSync(
    tmp,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), entries },
      null,
      2,
    ) + '\n',
  )
  renameSync(tmp, INDEX_PATH)
}

function ffmpegToWav(inPath: string, outPath: string): number {
  // 16 kHz mono PCM 16-bit — the format ECAPA-TDNN expects + that
  // soundfile can decode without extra deps. Trim silence at both
  // ends (≥-30 dB for ≥0.5 s) so the embedding focuses on speech.
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
      '-af',
      'silenceremove=start_periods=1:start_duration=0.5:start_threshold=-30dB:detection=peak,silenceremove=stop_periods=-1:stop_duration=0.5:stop_threshold=-30dB:detection=peak',
      outPath,
    ],
    { encoding: 'utf8' },
  )
  if (r.status !== 0) {
    throw new Error(`ffmpeg failed: ${r.stderr || 'non-zero exit'}`)
  }
  // Read duration from the output via ffprobe.
  const probe = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', outPath],
    { encoding: 'utf8' },
  )
  return Number(probe.stdout.trim())
}

interface EmbeddingResult {
  embedding: number[]
  norm: number
  dim: number
}

function computeEmbedding(wavPath: string): EmbeddingResult {
  if (!existsSync(VOICE_PY)) {
    throw new Error(
      `voice venv missing at ${VOICE_PY} — bootstrap with:\n` +
        `  python3.10 -m venv ~/.local/civicpulse-voice/venv\n` +
        `  ~/.local/civicpulse-voice/venv/bin/pip install speechbrain==1.0.2 'huggingface_hub<0.24' soundfile torchaudio==2.5.1 torch==2.5.1`,
    )
  }
  const py = `
import json
import os
import sys
import numpy as np
import torch
import soundfile as sf
from speechbrain.inference.speaker import EncoderClassifier

wav_path = sys.argv[1]
model_dir = sys.argv[2]

# Load the audio. speechbrain expects a (1, T) tensor at 16 kHz.
audio, sr = sf.read(wav_path, always_2d=False)
if audio.ndim > 1:
    audio = audio[:, 0]
assert sr == 16000, f"wav must be 16 kHz mono; got sr={sr}"
audio_t = torch.from_numpy(audio).float().unsqueeze(0)

# Load the encoder. Use CPU — model is tiny, faster than GPU spin-up.
clf = EncoderClassifier.from_hparams(
    source='speechbrain/spkrec-ecapa-voxceleb',
    savedir=model_dir,
    run_opts={'device': 'cpu'},
)
emb = clf.encode_batch(audio_t).squeeze(0).squeeze(0).detach().cpu().numpy()
# L2-normalise so cosine similarity reduces to a dot product downstream.
norm = float(np.linalg.norm(emb))
emb_normalised = emb / max(norm, 1e-9)

# Print JSON to stdout as the LAST line so any stderr noise above it is
# easy to skip when the caller parses.
print(json.dumps({
    'dim': int(emb_normalised.shape[0]),
    'norm': norm,
    'embedding': emb_normalised.tolist(),
}))
`
  const r = spawnSync(VOICE_PY, ['-c', py, wavPath, VOICE_MODELS_DIR], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  if (r.status !== 0) {
    throw new Error(`embedding worker failed: ${r.stderr.slice(-1000)}`)
  }
  // Last non-empty stdout line is the JSON.
  const lines = r.stdout.trim().split('\n').filter(Boolean)
  const last = lines[lines.length - 1]
  let parsed: EmbeddingResult
  try {
    parsed = JSON.parse(last) as EmbeddingResult
  } catch (err) {
    throw new Error(
      `embedding worker output not JSON: ${(err as Error).message}\nstdout tail: ${r.stdout.slice(-500)}`,
    )
  }
  if (!Array.isArray(parsed.embedding) || parsed.embedding.length < 100) {
    throw new Error(`embedding looks malformed: dim=${parsed.dim}`)
  }
  return parsed
}

function saveEmbedding(slug: string, emb: number[]): string {
  // Tiny binary float32 file. speechbrain's ECAPA-TDNN is 192-dim, so
  // 192 × 4 bytes = 768 bytes per voiceprint. Cheap to store, fast to load.
  mkdirSync(VOICEPRINTS_DIR, { recursive: true })
  const out = resolve(VOICEPRINTS_DIR, `${slug}.f32`)
  const tmp = `${out}.tmp`
  const buf = Buffer.alloc(emb.length * 4)
  for (let i = 0; i < emb.length; i++) buf.writeFloatLE(emb[i], i * 4)
  writeFileSync(tmp, buf)
  renameSync(tmp, out)
  return out
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const official = loadOfficial(opts.slug)

  // Resolve audio: either the local path the caller provided, or
  // download fresh via yt-dlp. The downloaded file lands in the
  // gitignored .voiceprints/audio/ directory and is preserved for
  // audit trail (sourceAudio in index.json points at it).
  let audioPath = opts.audio
  if (opts.url) {
    process.stderr.write(`[enroll-voice] downloading audio from ${opts.url}\n`)
    audioPath = downloadAudioToCache(opts.slug, opts.url)
    process.stderr.write(`[enroll-voice]   saved: ${audioPath}\n`)
  }
  if (!audioPath || !existsSync(audioPath)) {
    process.stderr.write(`[enroll-voice] audio missing: ${audioPath}\n`)
    process.exit(1)
  }
  const idx = loadIndex()
  const existing = idx.entries.find((e) => e.slug === opts.slug)
  if (existing && !opts.force) {
    process.stderr.write(
      `[enroll-voice] ${opts.slug} already enrolled (${existing.enrolledAt}). Pass --force to overwrite.\n`,
    )
    process.exit(1)
  }

  process.stderr.write(
    `[enroll-voice] enrolling ${official.name} (${official.party ?? '?'} · ${official.role ?? '?'})…\n`,
  )

  // ffmpeg → 16 kHz mono WAV with silence trim
  const wavPath = resolve(VOICEPRINTS_DIR, `audio/${opts.slug}.16k.wav`)
  mkdirSync(dirname(wavPath), { recursive: true })
  const duration = ffmpegToWav(audioPath, wavPath)
  process.stderr.write(
    `[enroll-voice]   trimmed audio: ${duration.toFixed(1)}s @ 16 kHz mono\n`,
  )
  if (duration < 3) {
    process.stderr.write(
      `[enroll-voice] WARNING: <3s of speech — voiceprint will be unreliable. Recommend ≥30s.\n`,
    )
  }

  // ECAPA-TDNN embedding
  process.stderr.write(`[enroll-voice]   computing ECAPA-TDNN embedding…\n`)
  const emb = computeEmbedding(wavPath)
  process.stderr.write(
    `[enroll-voice]   embedding: dim=${emb.dim}, raw L2 norm=${emb.norm.toFixed(3)}\n`,
  )

  // Persist
  const vectorPath = saveEmbedding(opts.slug, emb.embedding)
  process.stderr.write(`[enroll-voice]   wrote ${vectorPath}\n`)

  const newEntry: IndexEntry = {
    slug: opts.slug,
    name: official.name,
    party: official.party ?? null,
    role: official.role ?? null,
    enrolledAt: new Date().toISOString(),
    sourceAudio: audioPath,
    sourceUrl: opts.url ?? null,
    durationSec: Number(duration.toFixed(2)),
    embeddingDim: emb.dim,
    embeddingNorm: Number(emb.norm.toFixed(4)),
    model: 'speechbrain/spkrec-ecapa-voxceleb',
  }
  const updated = [...idx.entries.filter((e) => e.slug !== opts.slug), newEntry].sort(
    (a, b) => a.slug.localeCompare(b.slug),
  )
  writeIndex(updated)
  process.stderr.write(`[enroll-voice]   updated ${INDEX_PATH}\n`)

  // stdout: parseable summary line
  process.stdout.write(
    JSON.stringify({
      slug: opts.slug,
      name: official.name,
      vectorPath,
      durationSec: newEntry.durationSec,
      dim: newEntry.embeddingDim,
      enrolled: idx.entries.some((e) => e.slug === opts.slug) ? 're-enrolled' : 'enrolled',
    }) + '\n',
  )
}

main().catch((err) => {
  process.stderr.write(
    `[enroll-voice] fatal: ${err instanceof Error ? err.message : String(err)}\n`,
  )
  process.exit(1)
})
