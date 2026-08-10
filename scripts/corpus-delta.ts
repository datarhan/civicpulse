#!/usr/bin/env tsx
/**
 * Compare a `check:finding-quotes --json` run against the accepted baseline.
 *
 *   npx tsx scripts/corpus-delta.ts <current.json> <baseline.json> [--baseline]
 *
 * Exits 1 when a quote became untraceable in this run. Called by
 * `scripts/verify-transcript-corpus.sh`, which owns the temp file and the
 * `check:*` invocations.
 *
 * This used to be a `node -e` string inside that shell script. The set
 * arithmetic it does is the part with a wrong answer available, and no test
 * could reach it in there.
 *
 * Three things have to be true before a delta is printed at all, and none of
 * them were: the run must have cotejado something, the baseline must have been
 * written by the same classifier, and a recovery must be RETIRED rather than
 * re-announced for ever. See `src/scraper/corpus-baseline.ts`.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import {
  acceptedBaseline,
  baselineAcceptedAt,
  baselineIncomparable,
  baselineRows,
  compareCorpus,
  corpusDeltaBlocks,
  healedBaseline,
  runMeasuredNothing,
  type DriftedQuote,
} from '../src/scraper/corpus-baseline'

/** Just the date: the hour a baseline was accepted is noise in a one-line report. */
const day = (iso: string) => (iso ? iso.slice(0, 10) : 'fecha desconocida')

function main() {
  const [curPath, basePath, flag] = process.argv.slice(2)
  if (!curPath || !basePath) {
    console.error('Usage: corpus-delta <current.json> <baseline.json> [--baseline]')
    process.exit(2)
  }
  const accept = flag === '--baseline'
  const cur = JSON.parse(readFileSync(curPath, 'utf8')) as {
    checked?: number
    ok?: number
    sanity?: string | null
    driftedCount?: number
    supersededOnlyCount?: number
    undeterminedCount?: number
    drifted?: DriftedQuote[]
  }
  const current = cur.drifted ?? []
  const now = new Date().toISOString()

  // «cannot tell» is printed on its own and never added to superseded-only: for
  // those sessions the current transcript is SHORTER than the one it replaced,
  // so the absence may be missing coverage rather than reworded ASR, and
  // folding the two would publish a confidence the bytes do not support.
  console.log(
    `  traceable ${cur.ok ?? 0} · superseded-only ${cur.supersededOnlyCount ?? 0} · ` +
      `cannot tell ${cur.undeterminedCount ?? 0} · NOT found ${cur.driftedCount ?? 0}`,
  )

  if (accept || !existsSync(basePath)) {
    writeFileSync(basePath, `${JSON.stringify(acceptedBaseline(current, now), null, 2)}\n`)
    console.log(accept ? '  línea base aceptada.' : '  línea base creada (primera pasada).')
    return
  }

  // Before subtracting: did this run measure anything? An empty `drifted`
  // because the pass fell over looks exactly like an empty `drifted` because
  // nothing is broken, and subtracted from a populated baseline the first one
  // prints a wall of recoveries that never happened.
  const unmeasured = runMeasuredNothing(cur)
  if (unmeasured) {
    console.error(`\n  ⚠︎ delta NO calculado — ${unmeasured}`)
    process.exitCode = 1
    return
  }

  const raw = JSON.parse(readFileSync(basePath, 'utf8')) as unknown
  // Two lists built by different classifiers do not subtract to anything. This
  // is the check saying «no lo sé», which is the answer that was missing when
  // 22 re-filed quotes were reported as 22 recoveries.
  const incomparable = baselineIncomparable(raw)
  if (incomparable) {
    console.error(`\n  ⚠︎ delta NO calculado — ${incomparable}.`)
    console.error(
      '  Revisa el estado actual arriba y acéptalo con:\n' +
        '      bash scripts/verify-transcript-corpus.sh --baseline',
    )
    process.exitCode = 1
    return
  }

  const baseline = baselineRows(raw)
  const since = day(baselineAcceptedAt(raw))
  const delta = compareCorpus(current, baseline)

  // Healed rows are RETIRED, not just announced. Left in place they were
  // re-announced every run for ever — and «vuelven a ser rastreables» in a
  // run report reads as «en esta pasada», which the delta cannot know.
  if (delta.healed.length > 0) {
    writeFileSync(basePath, `${JSON.stringify(healedBaseline(current, baseline, now), null, 2)}\n`)
    console.log(
      `  ✓ ${delta.healed.length} cita(s) han vuelto a ser rastreables desde la línea base ` +
        `del ${since}\n    (en cuál de las pasadas, esto no puede saberlo); se retiran de la línea base.`,
    )
  }
  if (!corpusDeltaBlocks(delta)) {
    if (delta.healed.length === 0) {
      console.log(
        `  · sin cambios desde la línea base del ${since}: ` +
          (delta.carried.length === 0
            ? 'ninguna cita sin rastro, tampoco entonces.'
            : `las mismas ${delta.carried.length} cita(s) sin rastro.`),
      )
    }
    return
  }

  console.log(`\n  ⚠︎ ${delta.appeared.length} cita(s) se han quedado SIN RASTRO en esta pasada:`)
  for (const k of delta.appeared.slice(0, 10)) {
    const [id, q] = k.split('|')
    console.log(`      ${id}  «${q}…»`)
  }
  if (delta.appeared.length > 10) {
    console.log(`      … y ${delta.appeared.length - 10} más`)
  }
  // NOT «cita un transcript reemplazado», which is what this said while
  // `drifted` still meant «ausente de la vigente». Since 8a4ef92 that case is
  // `solo-en-sustituida`, a published state with its own queue, and what lands
  // here is the harder question: the words are in no transcript we hold.
  console.log(
    '\n  No constan ni en la transcripción vigente ni en la que sustituyó, así que\n' +
      '  no hay texto contra el que cotejarlas. Eso NO las hace falsas — decide una\n' +
      '  persona, y la corrección se registra con `npm run correct-pleno-finding`.\n' +
      '  Mientras siga sin resolverse, `compute:finding-quote-provenance` se niega a\n' +
      '  escribir el snapshot que marca las citas en /hallazgos.\n' +
      '  Aceptar el nuevo estado: bash scripts/verify-transcript-corpus.sh --baseline',
  )
  process.exitCode = 1
}

main()
