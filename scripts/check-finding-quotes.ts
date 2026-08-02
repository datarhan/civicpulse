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
 * Is `quote` present in `transcript`?
 *
 * Slides a word window across the whole quote rather than testing only its
 * start. The leading-window-only version reported four published quotes as
 * untraceable that were verbatim in the transcript, because a curator had
 * trimmed the opening differently:
 *
 *   quote      "los 50-60% que sí que se retiran de contenedores al día"
 *   transcript "pasar esos 50-60% que sí que se retiran de contenedores al día"
 *
 * Every word after the first two matches. Anchoring on the first eight made
 * that indistinguishable from an invented sentence — and this script exists
 * precisely to tell those apart, so a false positive here is not a cosmetic
 * problem: it spends a curator's attention on a sound citation and, worse,
 * trains everyone to discount the ones that are real.
 */
export function quoteAppearsIn(quote: string, transcript: string, words = 8): boolean {
  const q = normaliseForQuoteMatch(quote).split(' ').filter(Boolean)
  if (q.length === 0) return false
  const hay = normaliseForQuoteMatch(transcript)
  const n = Math.min(words, q.length)
  for (let i = 0; i + n <= q.length; i += 1) {
    if (hay.includes(q.slice(i, i + n).join(' '))) return true
  }
  return false
}

/**
 * Longest contiguous run of the quote's words present in the transcript, as a
 * share of the quote. Reported for the ones that fail, because "0.15 of it is
 * there" and "0.85 of it is there" are different editorial problems: the first
 * is an invented sentence, the second is a quote welded together from two
 * separate passages.
 */
export function quoteCoverage(quote: string, transcript: string): number {
  const q = normaliseForQuoteMatch(quote).split(' ').filter(Boolean)
  if (q.length === 0) return 0
  const hay = normaliseForQuoteMatch(transcript)
  let best = 0
  for (let i = 0; i < q.length; i += 1) {
    for (let n = q.length - i; n > best; n -= 1) {
      if (hay.includes(q.slice(i, i + n).join(' '))) {
        best = n
        break
      }
    }
  }
  return best / q.length
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
