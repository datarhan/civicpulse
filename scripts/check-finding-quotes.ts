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

/**
 * Normalise for comparison: transcripts carry `[12.3 → 15.6] (SPEAKER_00)`
 * prefixes and line breaks that a quote never does, and engines differ on
 * punctuation and casing. Collapsing both sides to bare lowercase words
 * compares what was SAID, not how it was formatted.
 */
export function normaliseForQuoteMatch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\[\d+\.?\d*\s*→\s*\d+\.?\d*\]/g, ' ')
    .replace(/\((?:SPEAKER_\d+|UNKNOWN)[^)]*\)/gi, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Is `quote` present in `transcript`? Compares a leading window rather than the
 * whole quote: a curator often trims or joins across a segment boundary, and
 * requiring an exact full-length hit would flag those as drift.
 */
export function quoteAppearsIn(quote: string, transcript: string, words = 8): boolean {
  const q = normaliseForQuoteMatch(quote).split(' ').filter(Boolean)
  if (q.length === 0) return false
  const needle = q.slice(0, Math.min(words, q.length)).join(' ')
  return normaliseForQuoteMatch(transcript).includes(needle)
}

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

  const drifted: Array<Record<string, string>> = []
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
      if (quoteAppearsIn(text, t)) ok += 1
      else
        drifted.push({
          findingId: f.id,
          plenoId: f.plenoId,
          title: f.title,
          quote: text.slice(0, 120),
          sourceClaimId: q.sourceClaimId ?? '',
        })
    }
  }

  if (asJson) {
    console.log(
      JSON.stringify({ checked, ok, driftedCount: drifted.length, noTranscript, drifted }, null, 2),
    )
    return
  }

  console.log(
    `[finding-quotes] ${checked} quote(s) across ${findings.length} published finding(s)\n` +
      `  traceable to transcript : ${ok}\n` +
      `  NOT found               : ${drifted.length}\n` +
      `  transcript missing      : ${noTranscript}\n`,
  )
  for (const d of drifted) {
    console.log(`  ✗ ${d.plenoId}  ${d.findingId}`)
    console.log(`      “${d.quote}”`)
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
