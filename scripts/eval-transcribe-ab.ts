#!/usr/bin/env tsx
/**
 * A/B one transcription engine against the PUBLISHED transcript of the same
 * pleno, over the same slice of audio.
 *
 *   npm run eval:transcribe -- <plenoId> [--start 1800] [--secs 1200]
 *                                        [--engine gemini] [--audio /path.mp3]
 *
 * Why this exists, and what it does NOT claim
 * -------------------------------------------
 * There is no human-verified reference transcript for any pleno here, so this
 * cannot report a word error rate and does not pretend to. What it reports is
 * DISAGREEMENT between two engines plus a handful of marker counts, and the
 * markers are the decision: a party name, a contractor, or a chair's turn grant
 * either survives the transcription or it does not, and that is checkable
 * without a reference.
 *
 * The markers are not decoration. The published transcript of the 27-jul-2026
 * session contains "EU-Podem" zero times and "Hidraqua" zero times across 1,962
 * lines — a group and the town's biggest concessionaire, both dissolved by the
 * ASR into something else. Every claim this repo publishes is checked against
 * the transcript by `quoteAppearsIn`, so a name the engine cannot hear is a
 * quote that can never be cited and an attribution that silently goes null.
 *
 * Read the output as: which engine loses fewer of the things we have to be able
 * to quote. Nothing here promotes anything — it prints a table.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const PROJECT_ROOT = join(import.meta.dirname, '..')
const TRANSCRIPTS = join(PROJECT_ROOT, 'public/data/pleno-transcripts')

/**
 * Things the corpus has to be able to quote. Party names and the chair's turn
 * grants carry attribution; the contractors and the town's own name are the
 * proper nouns an ASR most often invents a spelling for (measured: "hidracoa",
 * "Riva Roja").
 */
const MARKERS = [
  'Compromís',
  'EU-Podem',
  'Esquerra Unida',
  'Podem',
  'PSOE',
  'Partit Socialista',
  'VOX',
  'Hidraqua',
  'Riba-roja',
  'té la paraula',
  'tiene la palabra',
  'passem a la votació',
] as const

interface Line {
  start: number
  end: number
  speaker: string
  text: string
}

/** The published format is `[start → end] (SPEAKER_NN) text`. */
function parseTranscript(raw: string): Line[] {
  const out: Line[] = []
  for (const line of raw.split('\n')) {
    const m = line.match(/^\[\s*([\d.]+)\s*→\s*([\d.]+)\s*\]\s*\(([^)]*)\)\s*(.*)$/)
    if (m) out.push({ start: Number(m[1]), end: Number(m[2]), speaker: m[3], text: m[4] })
  }
  return out
}

function slice(lines: Line[], from: number, to: number): Line[] {
  return lines.filter((l) => l.start >= from && l.start < to)
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s·-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function countMarker(text: string, marker: string): number {
  // Accent- and case-insensitive: an engine that writes "Compromis" for
  // "Compromís" has still HEARD the group, and scoring that as a miss would
  // measure orthography instead of comprehension. `quoteAppearsIn` normalises
  // the same way.
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const h = norm(text)
  const n = norm(marker)
  let i = 0
  let c = 0
  for (;;) {
    const at = h.indexOf(n, i)
    if (at === -1) break
    c += 1
    i = at + n.length
  }
  return c
}

/** Jaccard over the multiset-free word sets — a blunt "are these the same speech" check. */
function overlap(a: string, b: string): number {
  const A = new Set(words(a))
  const B = new Set(words(b))
  if (A.size === 0 && B.size === 0) return 1
  let inter = 0
  for (const w of A) if (B.has(w)) inter += 1
  return inter / (A.size + B.size - inter)
}

function arg(flag: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i === -1 ? fallback : process.argv[i + 1]
}

async function main() {
  const plenoId = process.argv[2]
  if (!plenoId || plenoId.startsWith('--')) {
    console.error('usage: npm run eval:transcribe -- <plenoId> [--start S] [--secs S] [--engine E]')
    process.exit(2)
  }
  const start = Number(arg('--start', '1800'))
  const secs = Number(arg('--secs', '1200'))
  const engine = arg('--engine', 'gemini')!
  const published = join(TRANSCRIPTS, `${plenoId}.txt`)
  if (!existsSync(published)) {
    console.error(
      `[eval-transcribe] no published transcript at ${published} — nothing to compare against`,
    )
    process.exit(1)
  }

  const baseline = parseTranscript(readFileSync(published, 'utf8'))
  const window = slice(baseline, start, start + secs)
  if (window.length === 0) {
    const last = baseline.length ? baseline[baseline.length - 1].end : 0
    console.error(
      `[eval-transcribe] the published transcript has no lines in [${start}, ${start + secs})s ` +
        `(it ends at ${last.toFixed(0)}s). Pick a --start inside it.`,
    )
    process.exit(1)
  }

  const work = join(tmpdir(), `civicpulse-eval-${plenoId}`)
  mkdirSync(work, { recursive: true })
  let audio = arg('--audio')
  if (!audio) {
    audio = join(work, 'audio.mp3')
    if (!existsSync(audio)) {
      const url = execFileSync(
        'npx',
        ['tsx', join(PROJECT_ROOT, 'scripts/resolve-pleno-video.ts'), plenoId],
        {
          encoding: 'utf8',
        },
      ).trim()
      console.log(`[eval-transcribe] downloading audio · ${url}`)
      execFileSync(
        'yt-dlp',
        [
          '-x',
          '--audio-format',
          'mp3',
          '--audio-quality',
          '5',
          '-o',
          join(work, 'audio.%(ext)s'),
          '--quiet',
          '--no-warnings',
          url,
        ],
        { stdio: 'inherit' },
      )
    } else {
      console.log(`[eval-transcribe] reusing cached audio ${audio}`)
    }
  }

  // Cut exactly the window the baseline covers, so both sides describe the same
  // seconds of speech. Comparing an engine's whole run against a slice of the
  // other is how you "measure" an engine and actually measure an offset.
  const clip = join(work, `clip-${start}-${secs}.ogg`)
  console.log(`[eval-transcribe] cutting [${start}, ${start + secs})s → ${clip}`)
  execFileSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-ss',
      String(start),
      '-t',
      String(secs),
      '-i',
      audio,
      '-ac',
      '1',
      '-ar',
      '16000',
      '-c:a',
      'libopus',
      '-b:a',
      '64k',
      clip,
    ],
    { stdio: 'inherit' },
  )

  let candidateText = ''
  if (engine === 'gemini') {
    const key = process.env.GEMINI_API_KEY
    if (!key) {
      console.error('[eval-transcribe] GEMINI_API_KEY not set (run: set -a; source .env; set +a)')
      process.exit(1)
    }
    const body = {
      model: process.env.GEMINI_TRANSCRIBE_MODEL || 'gemini-3.5-transcribe',
      input: [
        { type: 'audio', mime_type: 'audio/ogg', data: readFileSync(clip).toString('base64') },
      ],
      generation_config: {
        transcription_config: { mode: { type: 'verbatim', timestamp_granularities: ['word'] } },
      },
    }
    console.log(
      `[eval-transcribe] sending ${(readFileSync(clip).length / 1e6).toFixed(1)} MB to ${body.model}…`,
    )
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/interactions?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(1_800_000),
      },
    )
    const json: any = await res.json()
    if (!res.ok) {
      const v = json?.error?.details?.find((d: any) => d.violations)?.violations?.[0]
      console.error(
        `[eval-transcribe] HTTP ${res.status}: ${String(json?.error?.message ?? '').slice(0, 200)}` +
          (v ? `\n[eval-transcribe] quota ${v.quotaId} = ${v.quotaValue}` : ''),
      )
      // The free tier is 25 requests/day per model; a run that dies here has
      // not measured anything and must not be reported as a result.
      process.exit(1)
    }
    const parts: string[] = []
    for (const step of json.steps || [])
      for (const c of step.content || []) if (c.text) parts.push(c.text)
    candidateText = parts.join(' ')
    writeFileSync(join(work, `candidate-${engine}-${start}.txt`), candidateText)
  } else {
    console.error(`[eval-transcribe] engine "${engine}" not wired into this harness yet`)
    process.exit(2)
  }

  const baseText = window.map((l) => l.text).join(' ')
  const bw = words(baseText).length
  const cw = words(candidateText).length

  console.log(
    `\n  pleno ${plenoId} · window [${start}, ${start + secs})s · ${(secs / 60).toFixed(0)} min\n`,
  )
  console.log(`  ${'metric'.padEnd(24)} ${'published'.padStart(12)} ${String(engine).padStart(12)}`)
  console.log(`  ${'-'.repeat(24)} ${'-'.repeat(12)} ${'-'.repeat(12)}`)
  console.log(`  ${'words'.padEnd(24)} ${String(bw).padStart(12)} ${String(cw).padStart(12)}`)
  console.log(
    `  ${'words vs published'.padEnd(24)} ${'—'.padStart(12)} ${(bw ? `${((cw / bw) * 100).toFixed(0)}%` : '—').padStart(12)}`,
  )
  console.log(
    `  ${'word-set overlap'.padEnd(24)} ${'—'.padStart(12)} ${`${(overlap(baseText, candidateText) * 100).toFixed(0)}%`.padStart(12)}`,
  )
  console.log(`\n  markers (accent-insensitive occurrences)\n`)
  console.log(
    `  ${'marker'.padEnd(24)} ${'published'.padStart(12)} ${String(engine).padStart(12)}  verdict`,
  )
  console.log(`  ${'-'.repeat(24)} ${'-'.repeat(12)} ${'-'.repeat(12)}  ${'-'.repeat(18)}`)
  let recovered = 0
  let lost = 0
  for (const m of MARKERS) {
    const b = countMarker(baseText, m)
    const c = countMarker(candidateText, m)
    let verdict = ''
    if (b === 0 && c > 0) {
      verdict = 'RECUPERADO'
      recovered += 1
    } else if (b > 0 && c === 0) {
      verdict = 'PERDIDO'
      lost += 1
    } else if (b !== c) {
      verdict = c > b ? `+${c - b}` : `${c - b}`
    }
    console.log(`  ${m.padEnd(24)} ${String(b).padStart(12)} ${String(c).padStart(12)}  ${verdict}`)
  }
  console.log(
    `\n  ${recovered} marker(s) the published transcript missed and ${engine} heard · ` +
      `${lost} the other way round.`,
  )
  console.log(`  full candidate text: ${join(work, `candidate-${engine}-${start}.txt`)}\n`)
  console.log(
    '  This is a disagreement report, not an accuracy score: neither side is a\n' +
      '  verified reference. Read a RECUPERADO/PERDIDO row by listening to that\n' +
      '  passage before concluding anything about which engine was right.\n',
  )
}

main().catch((err) => {
  console.error('[eval-transcribe] failed:', err)
  process.exit(1)
})
