#!/usr/bin/env tsx
/**
 * compute:finding-quote-provenance — derive, for every verbatim published on
 * `/hallazgos`, two facts it did not carry: which transcript it actually comes
 * from, and what the editorial gate would do with the claim behind it.
 *
 *   npm run compute:finding-quote-provenance
 *   npm run compute:finding-quote-provenance -- --dry-run   # count, write nothing
 *
 * Writes `public/data/finding-quote-provenance.json`, keyed by finding id and
 * quote index. It is a `compute-*` pass in the sense CLAUDE.md means: a
 * snapshot derived from other snapshots, so the SPA reads ~20 KB instead of
 * fetching 300 KB of transcript per session and 9 MB of verifier output to
 * answer the same two questions.
 *
 * It does NOT touch `public/data/pleno-findings.json`, and there is no path by
 * which it could: it never opens that file for writing, and the only writer of
 * the published snapshot is `npm run correct-pleno-finding`. No quote is
 * rewritten here — a degraded verbatim is re-anchored by a person, through
 * `npm run triage:quote-reanchor` and then that CLI.
 *
 * The decision trees live in `src/scraper/quote-provenance.ts` (transcript) and
 * `src/scraper/quote-contrast.ts` (gate) and are shared with
 * `check:finding-quotes`, which re-derives both and refuses to pass if the
 * committed snapshot disagrees. One matcher, one classifier per axis, two
 * callers. The gate axis does not re-derive a verdict either: it hands the
 * merged verifier item to `classifyClaimVisibility` and records the answer.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { validateFindingsSnapshot } from '../src/scraper/pleno-finding'
import {
  buildQuoteProvenance,
  snapshotSanityFailure,
  type QuoteProvenanceSnapshot,
} from '../src/scraper/quote-provenance'
import { loadSessionTexts, SUPERSEDED_DIR, TRANSCRIPTS_DIR } from './lib/transcript-corpus'
import { loadVerifiedCorpus, VERIFIED_BASE, VERIFIED_OVERLAY } from './lib/verified-corpus'

const FINDINGS = 'public/data/pleno-findings.json'
export const OUT = 'public/data/finding-quote-provenance.json'

/** Reads disk, returns the snapshot. Exported so a test can drive it end-to-end. */
export function computeProvenance(now = new Date()): QuoteProvenanceSnapshot {
  const findingsPath = resolve(FINDINGS)
  if (!existsSync(findingsPath)) {
    throw new Error(`falta ${FINDINGS}`)
  }
  // Validate before deriving: a snapshot that fails its own validator would
  // give this pass a shape nobody guarantees, and the output is published.
  const snapshot = validateFindingsSnapshot(readFileSync(findingsPath, 'utf8'))
  const sessions = loadSessionTexts(snapshot.items.map((f) => f.plenoId))
  // base ⊕ overlay, never the base alone — see lib/verified-corpus.ts.
  const corpus = loadVerifiedCorpus()
  return buildQuoteProvenance(snapshot.items, sessions, corpus, {
    generatedAt: now.toISOString(),
    findingsGeneratedAt: snapshot.generatedAt,
    findingsPath: FINDINGS,
    transcriptsPath: TRANSCRIPTS_DIR,
    supersededPath: SUPERSEDED_DIR,
    basePath: VERIFIED_BASE,
    overlayPath: VERIFIED_OVERLAY,
  })
}

function main() {
  const dryRun = process.argv.includes('--dry-run')
  const snap = computeProvenance()
  const s = snap.stats
  const c = snap.contraste.stats

  const sanity = snapshotSanityFailure(snap)
  if (sanity) {
    console.error(`[quote-provenance] NO SE ESCRIBE — ${sanity}`)
    process.exit(1)
  }

  console.log(
    `[quote-provenance] ${s.quotes} cita(s) en ${s.findings} hallazgo(s), ` +
      `${s.sesionesConCitas} sesión(es) (${s.sesionesRetranscritas} re-transcritas)\n` +
      `  en la transcripción vigente : ${s.enVigente}\n` +
      `  sólo en la sustituida       : ${s.soloEnSustituida}\n` +
      `  sin determinar              : ${s.sinDeterminar} ` +
      `(${s.sinDeterminarPorTranscripcionMasCorta} porque la vigente es más corta, ` +
      `${s.sinDeterminarPorFaltaDeTranscripcion} sin transcripción)\n` +
      `  hallazgos con alguna marca  : ${s.findingsConCitaMarcada}/${s.findings}\n` +
      `  bytes de transcripción leídos: ${s.bytesLeidos.toLocaleString('es-ES')}`,
  )
  console.log(
    `[quote-provenance] puerta editorial (claim-public-gate) sobre las mismas ${c.citasConClaim} citas:\n` +
      `  la publicaría en /plenos    : ${c.porContraste.shown}\n` +
      `  sin contraste (no acusación): ${c.porContraste.toggle}\n` +
      `  acusación que retiene       : ${c.porContraste.hidden}\n` +
      `  hallazgos sin ninguna cita mostrable : ${c.hallazgosSinCitaMostrable}/${s.findings} ` +
      `(${c.hallazgosSoloConCitasOcultas} sólo con citas retenidas)\n` +
      `  corpus: ${c.claimsEnCorpus.toLocaleString('es-ES')} claims, ` +
      `${c.entradasDeOverlay.toLocaleString('es-ES')} entradas de overlay — ` +
      `${c.citasConVeredictoDeOverlay} cita(s) con veredicto del overlay, ` +
      `${c.citasReclasificadasPorElOverlay} que la base sola clasificaría distinto`,
  )

  // A quote in NEITHER transcript is not a provenance state — it is the
  // fabrication question, and `check:finding-quotes` is its gate. Writing a
  // snapshot with a hole in it would publish a page where that quote renders
  // unmarked, i.e. as sound.
  if (s.sinClasificar > 0) {
    console.error(
      `\n[quote-provenance] NO SE ESCRIBE — ${s.sinClasificar} cita(s) no aparecen en NINGUNA ` +
        `de las dos transcripciones. Eso no es procedencia degradada, es una cita sin origen ` +
        `localizable, y no lleva etiqueta: resuélvelo con \`npm run check:finding-quotes\` y ` +
        `\`npm run correct-pleno-finding\` antes de volver a generar.`,
    )
    for (const u of snap.unresolved.slice(0, 10)) {
      console.error(`  ✗ ${u.plenoId}  ${u.findingId} [${u.quoteIndex}]  (cobertura ${u.coverage})`)
    }
    process.exit(1)
  }

  if (dryRun) {
    console.log('[quote-provenance] --dry-run: no se escribe nada')
    return
  }
  const out = resolve(OUT)
  writeFileSync(out, JSON.stringify(snap, null, 2) + '\n')
  console.log(
    `[quote-provenance] escrito ${OUT} ` +
      `(${(readFileSync(out, 'utf8').length / 1024).toFixed(1)} KB)`,
  )
}

if (import.meta.url === `file://${process.argv[1]}`) main()
