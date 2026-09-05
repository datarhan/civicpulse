#!/usr/bin/env tsx
/**
 * Gate/sweep CLI over the degenerate-transcript detector.
 *
 *   npx tsx scripts/check-transcript-sanity.ts <transcript.txt> [more.txt …]
 *   npx tsx scripts/check-transcript-sanity.ts <nueva.txt> --frente-a <anterior.txt>
 *   npm run check:transcripts            # sweep every published transcript
 *
 * Exit 0 when every file passes, 1 when any fails — transcribe-pleno.sh
 * calls this on the freshly produced transcript and quarantines it on
 * failure instead of publishing (see the header of
 * src/scraper/transcript-sanity.ts for the July-2026 postmortem).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assessTranscriptSanity, empobreceLaTranscripcion } from '../src/scraper/transcript-sanity'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TRANSCRIPT_DIR = join(__dirname, '..', 'public/data/pleno-transcripts')

/**
 * `--frente-a <ruta>`: además de juzgar el fichero en sí, comprueba que no
 * EMPOBREZCA al que sustituye. Ver `empobreceLaTranscripcion` — todos los demás
 * umbrales miran el fichero suelto, y así pasó una re-transcripción que se
 * dejaba media sesión y toda la diarización.
 */
const iFrenteA = process.argv.indexOf('--frente-a')
const frenteA = iFrenteA === -1 ? null : process.argv[iFrenteA + 1]
/** Escotilla documentada, para cuando la pérdida sea la intención. */
const ANULAR = 'TRANSCRIBE_ALLOW_POORER'

let paths = process.argv
  .slice(2)
  .filter((a) => !a.startsWith('-'))
  .filter((a) => a !== frenteA)
if (paths.length === 0) {
  paths = readdirSync(TRANSCRIPT_DIR)
    .filter((f) => f.endsWith('.txt'))
    .sort()
    .map((f) => join(TRANSCRIPT_DIR, f))
}

let failures = 0
if (frenteA !== null && paths.length === 1) {
  if (!existsSync(frenteA)) {
    // Sin anterior no hay con qué comparar, y eso NO es un visto bueno: se dice.
    console.log(`[transcript-sanity] --frente-a ${frenteA} no existe — no se ha comparado`)
  } else {
    const motivo = empobreceLaTranscripcion(
      readFileSync(frenteA, 'utf8'),
      readFileSync(paths[0], 'utf8'),
    )
    if (motivo !== null) {
      if (process.env[ANULAR]) {
        console.log(`[transcript-sanity] EMPOBRECE, y se publica igual (${ANULAR}): ${motivo}`)
      } else {
        console.error(`FAIL ${paths[0].split('/').pop()} · empobrece-la-anterior`)
        console.error(`  ${motivo}`)
        console.error(
          `  Una transcripción nueva pisa la publicada, de la que ya se han sacado citas.\n` +
            `  Si la pérdida es lo que quieres, ${ANULAR}=1 y queda escrito.`,
        )
        failures += 1
      }
    }
  }
}
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
