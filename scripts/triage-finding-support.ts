#!/usr/bin/env tsx
/**
 * triage:finding-support — construye la cola de revisión de los 52 hallazgos
 * publicados en `/hallazgos`, para que una persona pueda responder, hallazgo a
 * hallazgo: **¿el extracto citado sostiene el sumario, o sólo se le parece?**
 *
 * Escribe `editorial/finding-support-queue.json`. **editorial/, nunca public/**:
 * Vercel sirve `public/` entero, así que un fichero ahí es fetchable por URL
 * esté enlazado o no — esa suposición dejó 24 borradores sin revisar sobre
 * concejales nombrados accesibles durante semanas. Este fichero es prosa sin
 * revisar sobre grupos políticos; se queda en el portátil.
 *
 * NO escribe en `public/data/pleno-findings.json` y no existe ninguna ruta por
 * la que pueda hacerlo: el único escritor sigue siendo
 * `npm run correct-pleno-finding`, que exige un motivo de ≥20 caracteres y
 * revalida el snapshot entero. Tampoco puntúa, ordena por fuerza ni recomienda
 * — el porqué está en la cabecera de `src/scraper/finding-support.ts`.
 *
 *   npm run triage:finding-support
 *   npm run triage:finding-support -- --dry-run   # cuenta, no escribe
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  buildSupportQueue,
  carriedReviewsFrom,
  type SupportQueue,
} from '../src/scraper/finding-support'
import { validateFindingsSnapshot } from '../src/scraper/pleno-finding'

const SNAPSHOT = 'public/data/pleno-findings.json'
const OUT = 'editorial/finding-support-queue.json'

function main() {
  const dryRun = process.argv.includes('--dry-run')
  const snapshotPath = resolve(SNAPSHOT)
  if (!existsSync(snapshotPath)) {
    console.error(`[triage-finding-support] falta ${SNAPSHOT}`)
    process.exit(2)
  }
  // Validar antes de leer: si el snapshot publicado no pasa su propio
  // validador, la cola se construiría sobre una forma que nadie garantiza.
  const snapshot = validateFindingsSnapshot(readFileSync(snapshotPath, 'utf8'))

  const outPath = resolve(OUT)
  const previous = existsSync(outPath)
    ? carriedReviewsFrom(JSON.parse(readFileSync(outPath, 'utf8')))
    : new Map()

  const queue: SupportQueue = buildSupportQueue(snapshot, {
    generatedAt: new Date().toISOString(),
    snapshotPath: SNAPSHOT,
    previous,
  })

  const s = queue.stats
  // Una ejecución tiene que demostrar que hizo trabajo: se informa de lo
  // encolado frente a lo que trae el snapshot, no sólo de lo encolado.
  if (s.queued !== snapshot.items.length) {
    console.error(
      `[triage-finding-support] la cola tiene ${s.queued} filas y el snapshot ${snapshot.items.length} — se aborta`,
    )
    process.exit(1)
  }
  console.log(
    `[triage-finding-support] ${s.queued}/${snapshot.items.length} hallazgos encolados\n` +
      `  · ${s.afirmativaDocumental} afirman un vínculo documental sin matizarlo\n` +
      `  · ${s.documentalMatizada} lo afirman con un matiz o una negación explícita\n` +
      `  · ${s.sinAfirmacionDocumental} no afirman vínculo documental (sólo informan de lo dicho)\n` +
      `  · ${s.conRevisionPrevia} con revisión previa constatada en la prosa de un commit\n` +
      `  · ${s.conVeredictoDelCurador} con veredicto de un curador ` +
      `(${s.veredictosArrastrados} arrastrados, ${s.veredictosInvalidadosPorCambio} invalidados porque el sumario cambió)`,
  )
  console.log(
    '[triage-finding-support] la cola PRESENTA evidencia; no puntúa ni recomienda. ' +
      'Decide una persona, y escribe `npm run correct-pleno-finding`.',
  )

  if (dryRun) {
    console.log('[triage-finding-support] --dry-run: no se escribe nada')
    return
  }
  mkdirSync(resolve('editorial'), { recursive: true })
  writeFileSync(outPath, JSON.stringify(queue, null, 2) + '\n')
  console.log(`[triage-finding-support] escrito ${OUT} (gitignored, nunca bajo public/)`)
}

main()
