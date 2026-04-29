#!/usr/bin/env tsx
/**
 * Identify which enrolled councillor (if any) each diarized SPEAKER_NN
 * cluster belongs to.
 *
 *   npm run identify-pleno-speakers -- <plenoId>
 *   npm run identify-pleno-speakers -- <plenoId> --apply
 *
 * Pre-requisite: the transcript must already carry `(SPEAKER_NN)`
 * tags from `bash scripts/diarize-pleno.sh <plenoId>` (or from a
 * `WHISPER_DIARIZE=1` transcribe-pleno run).
 *
 * Pipeline:
 *   1. Parse the diarized transcript at
 *      `public/data/pleno-transcripts/<plenoId>.txt` and group its
 *      lines into SPEAKER_NN clusters. Drop UNKNOWN and clusters
 *      under 5s of total speech.
 *   2. For each cluster, pick the longest contiguous segments
 *      (capped at ~30s combined) and slice them out of the cached
 *      audio at `tmp/transcribe/<plenoId>/audio.mp3` via
 *      ffmpeg `-ss`/`-to` + concat — single 16 kHz mono WAV.
 *   3. Embed the WAV via the same speechbrain ECAPA-TDNN worker
 *      `scripts/enroll-voice.ts` uses (so the probe + the enrolled
 *      reference live in the same vector space).
 *   4. Cosine-rank the probe against every enrolled voiceprint in
 *      `.voiceprints/`. A match is "high" tier (named attribution
 *      defensible) when cosine ≥ 0.6 AND margin over second-best
 *      ≥ 0.15. Below that it stays SPEAKER_NN with a candidate hint.
 *   5. Write `pleno-speakers/<plenoId>.json` — the curator-readable
 *      mapping every downstream stage consults.
 *   6. With `--apply`: also rewrite the transcript replacing
 *      `(SPEAKER_NN)` markers with `(Robert Raga Gadea)` for high
 *      tier and `(SPEAKER_NN ≈ Robert Raga Gadea?)` for medium.
 *      Atomic rename, never overwrites without --apply.
 *
 * Editorial guard: the libel boundary documented in
 * CLAUDE.md (`speakerGroup` enum-gated to blocs) still applies for
 * the LLM extractor — voice-id results live in their own JSON file
 * and feed the prompt as a non-binding hint. Curator-only promote
 * via the dashboard when ready.
 */
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  parseDiarizedTranscript,
  clustersFromSegments,
  pickRepresentativeSegments,
  rankCandidates,
  bestMatch,
  rewriteTranscript,
  DEFAULT_MATCH_OPTS,
  type SpeakerAssignment,
  type IdentifyResult,
  type VoiceprintEntry,
  type DiarizedSegment,
} from '../src/scraper/voice-id'

const REPO_ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..')
const VOICEPRINTS_DIR = resolve(REPO_ROOT, '.voiceprints')
const VOICEPRINTS_INDEX = resolve(VOICEPRINTS_DIR, 'index.json')
const VOICE_PY = `${process.env.HOME}/.local/civicpulse-voice/venv/bin/python`
const VOICE_MODELS_DIR = `${process.env.HOME}/.local/civicpulse-voice/models/spkrec-ecapa-voxceleb`
const PLENO_SPEAKERS_DIR = resolve(REPO_ROOT, 'pleno-speakers')

interface CliArgs {
  plenoId: string
  apply: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const out: Partial<CliArgs> = { apply: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--apply') out.apply = true
    else if (!out.plenoId && !a.startsWith('-')) out.plenoId = a
    else {
      process.stderr.write(`[identify] unknown flag: ${a}\n`)
      process.exit(2)
    }
  }
  if (!out.plenoId) {
    process.stderr.write('usage: identify-pleno-speakers.ts <plenoId> [--apply]\n')
    process.exit(2)
  }
  return out as CliArgs
}

interface IndexEntry {
  slug: string
  name: string
  party: string | null
  embeddingDim: number
  model: string
}

function loadVoiceprints(): VoiceprintEntry[] {
  if (!existsSync(VOICEPRINTS_INDEX)) {
    process.stderr.write(
      `[identify] no voiceprints index at ${VOICEPRINTS_INDEX}.\n` +
        `[identify]   enroll councillors first: npm run enroll-voice -- --slug <slug> --url <url>\n`,
    )
    process.exit(1)
  }
  const idx = JSON.parse(readFileSync(VOICEPRINTS_INDEX, 'utf8')) as { entries: IndexEntry[] }
  const out: VoiceprintEntry[] = []
  for (const e of idx.entries) {
    const path = resolve(VOICEPRINTS_DIR, `${e.slug}.f32`)
    if (!existsSync(path)) {
      process.stderr.write(`[identify] WARN: ${e.slug} listed in index but ${path} missing\n`)
      continue
    }
    const buf = readFileSync(path)
    const dim = buf.length / 4
    if (dim !== e.embeddingDim) {
      process.stderr.write(
        `[identify] WARN: ${e.slug} dim mismatch: file=${dim}, index=${e.embeddingDim}; skipping\n`,
      )
      continue
    }
    const emb = new Float32Array(dim)
    for (let i = 0; i < dim; i++) emb[i] = buf.readFloatLE(i * 4)
    out.push({ slug: e.slug, name: e.name, party: e.party, embedding: emb })
  }
  if (out.length === 0) {
    process.stderr.write('[identify] no usable voiceprints — enroll some first.\n')
    process.exit(1)
  }
  return out
}

function loadDiarizedTranscript(plenoId: string): { text: string; path: string } {
  const path = resolve(REPO_ROOT, `public/data/pleno-transcripts/${plenoId}.txt`)
  if (!existsSync(path)) {
    process.stderr.write(`[identify] transcript missing: ${path}\n`)
    process.stderr.write(`[identify]   run transcribe-pleno first: bash scripts/transcribe-pleno.sh ${plenoId}\n`)
    process.exit(1)
  }
  const text = readFileSync(path, 'utf8')
  if (!text.includes('(SPEAKER_')) {
    process.stderr.write(
      `[identify] transcript ${plenoId}.txt has no (SPEAKER_NN) tags — diarize first:\n` +
        `[identify]   bash scripts/diarize-pleno.sh ${plenoId}\n`,
    )
    process.exit(1)
  }
  return { text, path }
}

function findCachedAudio(plenoId: string): string {
  const candidates = [
    resolve(REPO_ROOT, `tmp/transcribe/${plenoId}/audio.mp3`),
    resolve(REPO_ROOT, `tmp/transcribe/${plenoId}/audio-clean.mp3`),
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  // Fallback: scan tmp/transcribe/<plenoId>/ for any audio file.
  const dir = resolve(REPO_ROOT, `tmp/transcribe/${plenoId}`)
  if (existsSync(dir)) {
    const file = readdirSync(dir).find((f) => /\.(mp3|opus|wav|m4a|aac)$/i.test(f))
    if (file) return resolve(dir, file)
  }
  process.stderr.write(
    `[identify] cached audio missing for ${plenoId}.\n` +
      `[identify]   tried: ${candidates.join(', ')}\n` +
      `[identify]   re-run transcribe-pleno (the WORKDIR is auto-cleaned after a successful run).\n`,
  )
  process.exit(1)
}

/**
 * Slice the picked segments out of the source audio and concatenate
 * them into a single 16 kHz mono WAV ready for the embedder.
 *
 * Uses ffmpeg's `concat` demuxer for clean stitching — each slice is
 * decoded once and fed in order, so prosody isn't broken by encoder
 * resync gaps.
 */
function spliceSegmentsToWav(
  audioPath: string,
  segments: DiarizedSegment[],
  outPath: string,
): number {
  // Single ffmpeg invocation: -ss before each input + -filter_complex concat.
  // For ≤5 segments this is fine; we cap at ~5–6 long segments anyway.
  const inputs: string[] = []
  for (const s of segments) {
    inputs.push('-ss', s.start.toFixed(3), '-to', s.end.toFixed(3), '-i', audioPath)
  }
  const filter = segments.map((_, i) => `[${i}:a]`).join('') + `concat=n=${segments.length}:v=0:a=1[out]`
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    ...inputs,
    '-filter_complex',
    filter,
    '-map',
    '[out]',
    '-ac',
    '1',
    '-ar',
    '16000',
    outPath,
  ]
  const r = spawnSync('ffmpeg', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  if (r.status !== 0) {
    throw new Error(`ffmpeg splice failed: ${r.stderr.slice(-500) || 'non-zero exit'}`)
  }
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
import json, sys
import numpy as np
import torch
import soundfile as sf
from speechbrain.inference.speaker import EncoderClassifier

wav_path, model_dir = sys.argv[1], sys.argv[2]
audio, sr = sf.read(wav_path, always_2d=False)
if audio.ndim > 1:
    audio = audio[:, 0]
assert sr == 16000, f"wav must be 16 kHz mono; got sr={sr}"
audio_t = torch.from_numpy(audio).float().unsqueeze(0)
clf = EncoderClassifier.from_hparams(
    source='speechbrain/spkrec-ecapa-voxceleb',
    savedir=model_dir,
    run_opts={'device': 'cpu'},
)
emb = clf.encode_batch(audio_t).squeeze(0).squeeze(0).detach().cpu().numpy()
norm = float(np.linalg.norm(emb))
emb_normalised = emb / max(norm, 1e-9)
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
  const lines = r.stdout.trim().split('\n').filter(Boolean)
  const last = lines[lines.length - 1]
  return JSON.parse(last) as EmbeddingResult
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2))
  const enrolled = loadVoiceprints()
  process.stderr.write(`[identify] ${enrolled.length} enrolled voiceprint(s)\n`)
  for (const e of enrolled) {
    process.stderr.write(`[identify]   · ${e.slug.padEnd(28)} ${e.party ?? '?'} · ${e.name}\n`)
  }

  const { text: transcript, path: transcriptPath } = loadDiarizedTranscript(opts.plenoId)
  const segments = parseDiarizedTranscript(transcript)
  const clusters = clustersFromSegments(segments)
  if (clusters.length === 0) {
    process.stderr.write(`[identify] no usable speaker clusters in ${opts.plenoId}\n`)
    process.exit(1)
  }
  process.stderr.write(`[identify] ${clusters.length} speaker cluster(s) in ${opts.plenoId}\n`)

  const audioPath = findCachedAudio(opts.plenoId)
  process.stderr.write(`[identify] audio source: ${audioPath}\n`)

  const tmpDir = resolve(REPO_ROOT, `tmp/identify/${opts.plenoId}`)
  mkdirSync(tmpDir, { recursive: true })

  const assignments: SpeakerAssignment[] = []
  for (const c of clusters) {
    const picked = pickRepresentativeSegments(c)
    if (picked.length === 0) {
      process.stderr.write(
        `[identify]   · ${c.speaker}: no segments long enough to embed; skipping\n`,
      )
      assignments.push({
        speaker: c.speaker,
        durationSec: Number(c.totalDurationSec.toFixed(1)),
        segmentCount: c.segments.length,
        match: null,
        topCandidates: [],
      })
      continue
    }
    const probedSec = picked.reduce((a, s) => a + (s.end - s.start), 0)
    process.stderr.write(
      `[identify]   · ${c.speaker} ` +
        `(total ${c.totalDurationSec.toFixed(0)}s, probe ${probedSec.toFixed(1)}s · ${picked.length} seg) — embedding…\n`,
    )
    const wavPath = resolve(tmpDir, `${c.speaker}.wav`)
    spliceSegmentsToWav(audioPath, picked, wavPath)
    const probe = computeEmbedding(wavPath)
    const probeVec = new Float32Array(probe.embedding)
    const ranking = rankCandidates(probeVec, enrolled)
    const match = bestMatch(ranking, DEFAULT_MATCH_OPTS)
    const topCandidates = ranking.slice(0, 3).map((r) => ({
      slug: r.slug,
      name: r.name,
      cosine: Number(r.cosine.toFixed(4)),
    }))
    if (match) {
      process.stderr.write(
        `[identify]       → ${match.tier.toUpperCase().padEnd(6)} ${match.name} ` +
          `(cos=${match.cosine.toFixed(3)}, margin=${match.margin.toFixed(3)})\n`,
      )
    } else {
      const top = ranking[0]
      process.stderr.write(
        `[identify]       → no match (best=${top?.name ?? '?'} cos=${top?.cosine.toFixed(3) ?? '?'})\n`,
      )
    }
    assignments.push({
      speaker: c.speaker,
      durationSec: Number(c.totalDurationSec.toFixed(1)),
      segmentCount: c.segments.length,
      match,
      topCandidates,
    })
  }

  const result: IdentifyResult = {
    generatedAt: new Date().toISOString(),
    plenoId: opts.plenoId,
    totalSpeakers: assignments.length,
    highConfidenceCount: assignments.filter((a) => a.match?.tier === 'high').length,
    mediumConfidenceCount: assignments.filter((a) => a.match?.tier === 'medium').length,
    unmatchedCount: assignments.filter((a) => !a.match).length,
    assignments,
  }
  mkdirSync(PLENO_SPEAKERS_DIR, { recursive: true })
  const outPath = resolve(PLENO_SPEAKERS_DIR, `${opts.plenoId}.json`)
  const tmp = `${outPath}.tmp`
  writeFileSync(tmp, JSON.stringify(result, null, 2) + '\n')
  renameSync(tmp, outPath)
  process.stderr.write(
    `[identify] wrote ${outPath} ` +
      `(${result.highConfidenceCount} high, ${result.mediumConfidenceCount} medium, ${result.unmatchedCount} unmatched)\n`,
  )

  if (opts.apply) {
    const rewritten = rewriteTranscript(transcript, assignments)
    if (rewritten === transcript) {
      process.stderr.write(`[identify] --apply: no high/medium-tier matches; transcript untouched\n`)
    } else {
      const tmpT = `${transcriptPath}.identified.tmp`
      writeFileSync(tmpT, rewritten)
      renameSync(tmpT, transcriptPath)
      process.stderr.write(`[identify] --apply: rewrote ${transcriptPath}\n`)
    }
  } else {
    process.stderr.write(
      `[identify] dry run — pass --apply to rewrite the transcript with named tags.\n`,
    )
  }

  process.stdout.write(JSON.stringify(result) + '\n')
}

main().catch((err) => {
  process.stderr.write(`[identify] fatal: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
