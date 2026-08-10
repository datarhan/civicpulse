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
 *
 * ── Two jobs, since the provenance snapshot exists ──────────────────────────
 *
 * 1. The original one: report where each published quote traces to, and exit 1
 *    on a quote that traces NOWHERE.
 * 2. Keep `public/data/finding-quote-provenance.json` honest. That file drives
 *    a marker next to 95 quotes on `/hallazgos`, and a marker is only worth the
 *    reader's trust while it tracks the corpus. This re-derives the same
 *    classification from the same transcripts and exits 1 when the committed
 *    file disagrees — so a corrected quote, a re-transcribed session or a new
 *    finding cannot leave a stale label on the page.
 *
 * Both halves share ONE classifier, `src/scraper/quote-provenance.ts`, with the
 * compute pass that writes the snapshot. A second copy of the decision tree
 * would let the gate and the page reach different verdicts about the same
 * quote, which is the failure this check exists to prevent.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Hoisted to src/scraper/ when check:citations and repoint-source-url became
// the second and third callers. Re-exported so existing importers (and the
// test that pins the sliding-window behaviour) keep working unchanged.
export { normaliseForQuoteMatch, quoteAppearsIn, quoteCoverage } from '../src/scraper/quote-match'
import {
  buildQuoteProvenance,
  classifyQuoteProvenance,
  diffProvenance,
  provenanceSanityFailure,
  type QuoteProvenanceSnapshot,
} from '../src/scraper/quote-provenance'
import { loadSessionTexts } from './lib/transcript-corpus'

const FINDINGS = resolve('public/data/pleno-findings.json')
const PROVENANCE = resolve('public/data/finding-quote-provenance.json')

function main() {
  const asJson = process.argv.includes('--json')
  const raw = JSON.parse(readFileSync(FINDINGS, 'utf8')) as {
    generatedAt?: string
    items: Array<{
      id: string
      plenoId: string
      title: string
      quotes?: Array<{ text?: string; sourceClaimId?: string; speakerGroup?: string }>
    }>
  }
  const findings = raw.items

  // The transcript that was published when the quote was lifted, kept whenever
  // a session is re-transcribed. Re-transcription is an improvement, but it
  // rewrites punctuation, proper nouns and segmentation, so a perfectly honest
  // quote stops matching the current file. Without this, that is
  // indistinguishable from a fabrication — which is the thing this script
  // exists to find.
  const sessions = loadSessionTexts(findings.map((f) => f.plenoId))

  const drifted: Array<Record<string, string>> = []
  const supersededOnly: Array<Record<string, string>> = []
  const undetermined: Array<Record<string, string>> = []
  let checked = 0
  let ok = 0
  let noTranscript = 0

  for (const f of findings) {
    const session = sessions.get(f.plenoId)!
    for (const q of f.quotes ?? []) {
      const text = (q.text ?? '').trim()
      if (!text) continue
      checked += 1
      const row = {
        findingId: f.id,
        plenoId: f.plenoId,
        title: f.title,
        quote: text.slice(0, 120),
        sourceClaimId: q.sourceClaimId ?? '',
        coverage: '',
      }
      const outcome = classifyQuoteProvenance(text, session)
      if (outcome.kind === 'no-localizada') {
        drifted.push({ ...row, coverage: outcome.coverage.toFixed(2) })
      } else if (outcome.status === 'en-vigente') {
        ok += 1
      } else if (outcome.status === 'solo-en-sustituida') {
        supersededOnly.push(row)
      } else {
        // «Cannot tell» is not «only in the superseded one»: for these sessions
        // the current transcript is SHORTER than the one it replaced, so the
        // absence may be missing coverage rather than reworded ASR. Counted on
        // its own — a sentinel is never a value.
        if (outcome.reason === 'sin-transcripcion-vigente') noTranscript += 1
        undetermined.push({ ...row, reason: outcome.reason ?? '' })
      }
    }
  }

  // Re-derive the published provenance snapshot and compare. Runs whatever the
  // output mode, because a stale marker on a published page is worse than a
  // drifted quote in a report nobody reads.
  const derived = buildQuoteProvenance(findings, sessions, {
    generatedAt: new Date().toISOString(),
    findingsGeneratedAt: raw.generatedAt ?? '',
  })
  const published = existsSync(PROVENANCE)
    ? (JSON.parse(readFileSync(PROVENANCE, 'utf8')) as QuoteProvenanceSnapshot)
    : null
  const provenanceDrift = diffProvenance(published, derived)
  // Assert the run MEASURED something before it reports what it found. A
  // matcher that silently matched nothing would mark all 177 quotes and read as
  // thorough — the same shape as the two front-end suites that were green while
  // evaluating nothing.
  const sanity = provenanceSanityFailure(derived.stats)

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          checked,
          ok,
          supersededOnlyCount: supersededOnly.length,
          undeterminedCount: undetermined.length,
          driftedCount: drifted.length,
          noTranscript,
          provenanceDrift,
          sanity,
          supersededOnly,
          undetermined,
          drifted,
        },
        null,
        2,
      ),
    )
    if (drifted.length > 0 || provenanceDrift.length > 0 || sanity) process.exitCode = 1
    return
  }

  console.log(
    `[finding-quotes] ${checked} quote(s) across ${findings.length} published finding(s)\n` +
      `  traceable to transcript : ${ok}\n` +
      `  only in the superseded  : ${supersededOnly.length}\n` +
      `  cannot tell             : ${undetermined.length}\n` +
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
        `should be refreshed against the better text when a curator next touches it.\n` +
        `They are marked as such on /hallazgos; queue them with \`npm run triage:quote-reanchor\`.\n`,
    )
  }
  if (undetermined.length > 0) {
    console.log(
      `${undetermined.length} quote(s) cannot be placed either way: their session's current\n` +
        `transcript is SHORTER than the one it replaced, so the absence may be coverage rather\n` +
        `than rewording. Not counted as superseded-only, and not counted as sound.\n`,
    )
  }

  if (sanity) {
    console.error(`[finding-quotes] LA PASADA NO MIDIÓ NADA — ${sanity}`)
    process.exitCode = 1
  }
  if (provenanceDrift.length > 0) {
    console.error(
      `\n[finding-quotes] public/data/finding-quote-provenance.json no coincide con las ` +
        `transcripciones (${provenanceDrift.length} diferencia(s)). /hallazgos estaría marcando ` +
        `un estado que ya no es cierto. Regenera con \`npm run compute:finding-quote-provenance\`:`,
    )
    for (const d of provenanceDrift.slice(0, 10)) console.error(`  · ${d}`)
    if (provenanceDrift.length > 10) console.error(`  · … y ${provenanceDrift.length - 10} más`)
    process.exitCode = 1
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
