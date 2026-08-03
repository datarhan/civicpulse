#!/usr/bin/env tsx
/**
 * Do the verbatim quotes in published findings still appear in their
 * transcripts?
 *
 *   npm run check:finding-quotes            # summary + the drifted rows
 *   npm run check:finding-quotes -- --json  # machine-readable
 *
 * Why this exists: every published pleno finding quotes a councillor verbatim,
 * and those quotes were lifted from transcripts produced by whisper-1 — which
 * on this corpus invented speaker headers, garbled the contractor Hidraqua into
 * "hidracoa" and flattened a bilingual chamber into Spanish. So some published
 * quotes may be quoting the transcriber rather than the councillor.
 *
 * Re-transcribing with a better engine makes that checkable: a quote that no
 * longer appears in the corrected transcript is either (a) wording whisper
 * invented, which needs a logged correction, or (b) a benign rewording. Both
 * need a human, which is why this only reports.
 *
 * Run it BEFORE and AFTER a re-transcription and compare the counts.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const FINDINGS = resolve('public/data/pleno-findings.json')
const TRANSCRIPTS = resolve('public/data/pleno-transcripts')
const SUPERSEDED = resolve('public/data/pleno-transcripts/superseded')

// Hoisted to src/scraper/ when check:citations and repoint-source-url became
// the second and third callers. Re-exported so existing importers (and the
// test that pins the sliding-window behaviour) keep working unchanged.
export { normaliseForQuoteMatch, quoteAppearsIn, quoteCoverage } from '../src/scraper/quote-match'
import { quoteAppearsIn, quoteCoverage } from '../src/scraper/quote-match'

function main() {
  const asJson = process.argv.includes('--json')
  const findings = JSON.parse(readFileSync(FINDINGS, 'utf8')).items as Array<{
    id: string
    plenoId: string
    title: string
    quotes?: Array<{ text?: string; sourceClaimId?: string; speakerGroup?: string }>
  }>

  const cache = new Map<string, string | null>()
  const read = (plenoId: string) => {
    if (!cache.has(plenoId)) {
      const p = `${TRANSCRIPTS}/${plenoId}.txt`
      cache.set(plenoId, existsSync(p) ? readFileSync(p, 'utf8') : null)
    }
    return cache.get(plenoId) ?? null
  }

  // The transcript that was published when the quote was lifted, kept whenever
  // a session is re-transcribed. Re-transcription is an improvement, but it
  // rewrites punctuation, proper nouns and segmentation, so a perfectly honest
  // quote stops matching the current file. Without this, that is
  // indistinguishable from a fabrication — which is the thing this script
  // exists to find.
  const oldCache = new Map<string, string | null>()
  const readSuperseded = (plenoId: string) => {
    if (!oldCache.has(plenoId)) {
      const p = `${SUPERSEDED}/${plenoId}.txt`
      oldCache.set(plenoId, existsSync(p) ? readFileSync(p, 'utf8') : null)
    }
    return oldCache.get(plenoId) ?? null
  }

  const drifted: Array<Record<string, string>> = []
  const supersededOnly: Array<Record<string, string>> = []
  let checked = 0
  let ok = 0
  let noTranscript = 0

  for (const f of findings) {
    const t = read(f.plenoId)
    for (const q of f.quotes ?? []) {
      const text = (q.text ?? '').trim()
      if (!text) continue
      checked += 1
      if (t === null) {
        noTranscript += 1
        continue
      }
      const row = {
        findingId: f.id,
        plenoId: f.plenoId,
        title: f.title,
        quote: text.slice(0, 120),
        sourceClaimId: q.sourceClaimId ?? '',
        coverage: '',
      }
      const old = readSuperseded(f.plenoId)
      if (quoteAppearsIn(text, t)) ok += 1
      else if (old && quoteAppearsIn(text, old)) supersededOnly.push(row)
      else {
        const cov = Math.max(quoteCoverage(text, t), old ? quoteCoverage(text, old) : 0)
        drifted.push({ ...row, coverage: cov.toFixed(2) })
      }
    }
  }

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          checked,
          ok,
          supersededOnlyCount: supersededOnly.length,
          driftedCount: drifted.length,
          noTranscript,
          supersededOnly,
          drifted,
        },
        null,
        2,
      ),
    )
    return
  }

  console.log(
    `[finding-quotes] ${checked} quote(s) across ${findings.length} published finding(s)\n` +
      `  traceable to transcript : ${ok}\n` +
      `  only in the superseded  : ${supersededOnly.length}\n` +
      `  NOT found anywhere      : ${drifted.length}\n` +
      `  transcript missing      : ${noTranscript}\n`,
  )
  for (const d of drifted) {
    console.log(`  ✗ ${d.plenoId}  ${d.findingId}   (longest run present: ${d.coverage})`)
    console.log(`      “${d.quote}”`)
  }
  if (supersededOnly.length > 0) {
    console.log(
      `${supersededOnly.length} quote(s) match the transcript they were LIFTED from but not the\n` +
        `current one — the session was re-transcribed. The citation is sound; the finding\n` +
        `should be refreshed against the better text when a curator next touches it.\n`,
    )
  }
  if (drifted.length > 0) {
    // Non-zero so a caller (scrape-all, CI) can actually notice. This script
    // reported drift to nobody for months because it always exited 0 AND had
    // no caller.
    process.exitCode = 1
    console.log(
      `\nA quote that no longer appears is NOT automatically wrong — the curator decides\n` +
        `whether it was transcriber invention (log a correction with\n` +
        `\`npm run correct-pleno-finding\`) or a benign rewording.`,
    )
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main()
