// Helper for scripts/transcribe-pleno-batch.sh — emits one plenoId per line
// for sessions that have a matched YouTube video but no transcript yet.
//
// Usage:
//   node transcribe-pleno-batch-list.mjs <videos.json> <plenos.json> <transcript_dir> <force 0|1> [skip_csv]

import { readFileSync, readdirSync, existsSync } from 'node:fs'

const [videosPath, plenosPath, transcriptDir, forceFlag, skipCsv = ''] = process.argv.slice(2)

if (!videosPath || !plenosPath || !transcriptDir) {
  process.stderr.write(
    'usage: transcribe-pleno-batch-list.mjs <videos> <plenos> <transcripts> <force> [skip_csv]\n',
  )
  process.exit(2)
}

const videos = JSON.parse(readFileSync(videosPath, 'utf8')).items || []
const plenos = JSON.parse(readFileSync(plenosPath, 'utf8')).items || []
const byDate = new Map(plenos.map((p) => [p.date, p.id]))
const existing = existsSync(transcriptDir)
  ? new Set(
      readdirSync(transcriptDir)
        .filter((f) => f.endsWith('.txt'))
        .map((f) => f.replace(/\.txt$/, '')),
    )
  : new Set()
const force = forceFlag === '1'

// Comma-separated plenoIds to skip. Useful for deferring outlier sessions
// (e.g. an archived 4-hour live stream that would monopolise a whole batch).
const skip = new Set(
  skipCsv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
)

for (const v of videos) {
  const id = byDate.get(v.plenoDate)
  if (!id) continue
  if (!force && existing.has(id)) continue
  if (skip.has(id)) continue
  process.stdout.write(`${id}\n`)
}
