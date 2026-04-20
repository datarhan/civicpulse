// Helper for scripts/transcribe-pleno-batch.sh — emits one plenoId per line
// for sessions that have a matched YouTube video but no transcript yet.
//
// Usage:
//   node transcribe-pleno-batch-list.mjs <videos.json> <plenos.json> <transcript_dir> <force 0|1>

import { readFileSync, readdirSync, existsSync } from 'node:fs'

const [videosPath, plenosPath, transcriptDir, forceFlag] = process.argv.slice(2)

if (!videosPath || !plenosPath || !transcriptDir) {
  process.stderr.write('usage: transcribe-pleno-batch-list.mjs <videos> <plenos> <transcripts> <force>\n')
  process.exit(2)
}

const videos = JSON.parse(readFileSync(videosPath, 'utf8')).items || []
const plenos = JSON.parse(readFileSync(plenosPath, 'utf8')).items || []
const byDate = new Map(plenos.map((p) => [p.date, p.id]))
const existing = existsSync(transcriptDir)
  ? new Set(readdirSync(transcriptDir).filter((f) => f.endsWith('.txt')).map((f) => f.replace(/\.txt$/, '')))
  : new Set()
const force = forceFlag === '1'

for (const v of videos) {
  const id = byDate.get(v.plenoDate)
  if (!id) continue
  if (!force && existing.has(id)) continue
  process.stdout.write(`${id}\n`)
}
