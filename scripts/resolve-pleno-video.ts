#!/usr/bin/env tsx
/**
 * Thin CLI for scripts/transcribe-pleno.sh: resolve the YouTube recording for
 * a pleno via the tested matcher. Prints the URL to stdout, warnings to stderr,
 * and exits non-zero (with a message) on any missing/ambiguous match so the
 * transcriber aborts rather than fetching the wrong video.
 *
 *   npx tsx scripts/resolve-pleno-video.ts <plenoId>
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveVideoForPleno } from '../src/scraper/pleno-video-match'

const plenoId = process.argv[2]
if (!plenoId) {
  process.stderr.write('usage: resolve-pleno-video.ts <plenoId>\n')
  process.exit(2)
}

try {
  const plenos = JSON.parse(readFileSync(resolve('public/data/plenos.json'), 'utf8')).items
  const videos = JSON.parse(readFileSync(resolve('public/data/pleno-videos.json'), 'utf8')).items
  const match = resolveVideoForPleno(plenoId, plenos, videos)
  for (const w of match.warnings) process.stderr.write(`[resolve-video] WARN: ${w}\n`)
  process.stdout.write(match.url)
} catch (err) {
  process.stderr.write(`[resolve-video] ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
}
