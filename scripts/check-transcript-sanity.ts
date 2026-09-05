#!/usr/bin/env tsx
/**
 * Gate/sweep CLI over the degenerate-transcript detector.
 *
 *   npx tsx scripts/check-transcript-sanity.ts <transcript.txt> [more.txt …]
 *   npm run check:transcripts            # sweep every published transcript
 *
 * Exit 0 when every file passes, 1 when any fails — transcribe-pleno.sh
 * calls this on the freshly produced transcript and quarantines it on
 * failure instead of publishing (see the header of
 * src/scraper/transcript-sanity.ts for the July-2026 postmortem).
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assessTranscriptSanity } from '../src/scraper/transcript-sanity'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TRANSCRIPT_DIR = join(__dirname, '..', 'public/data/pleno-transcripts')

let paths = process.argv.slice(2).filter((a) => !a.startsWith('-'))
if (paths.length === 0) {
  paths = readdirSync(TRANSCRIPT_DIR)
    .filter((f) => f.endsWith('.txt'))
    .sort()
    .map((f) => join(TRANSCRIPT_DIR, f))
}

let failures = 0
for (const path of paths) {
  const r = assessTranscriptSanity(readFileSync(path, 'utf8'))
  const verdict = r.ok ? 'OK  ' : 'FAIL'
  const pct = (x: number) => `${Math.round(x * 100)}%`
  console.log(
    `${verdict} ${path.split('/').pop()} · lines=${r.lines} uniq=${r.uniqueLines} (${pct(
      r.uniqueRatio,
    )}) top=${r.topLineCount} (${pct(r.topLineShare)}) chars=${r.uniqueContentChars} en=${
      r.translatedLines
    } (${pct(r.translatedShare)}, racha ${r.longestTranslatedRun})${
      r.reasons.length ? ` · ${r.reasons.join(',')}` : ''
    }`,
  )
  if (!r.ok) failures++
}
if (failures > 0) {
  console.error(`[transcript-sanity] ${failures}/${paths.length} transcript(s) FAILED the gate`)
  process.exit(1)
}
