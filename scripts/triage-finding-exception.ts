#!/usr/bin/env tsx
/**
 * triage:finding-exception — construye la cola de los hallazgos publicados que
 * no citan ni un solo literal que la puerta editorial mostraría, para que una
 * persona pueda responder, ficha a ficha, la pregunta de la propia puerta:
 * **¿merece este hallazgo la excepción?**
 *
 *   npm run triage:finding-exception
 *   npm run triage:finding-exception -- --dry-run   # cuenta, no escribe
 *
 * Escribe `editorial/finding-exception-queue.json`. **editorial/, nunca
 * public/**: Vercel sirve `public/` entero, así que un fichero ahí es fetchable
 * por URL esté enlazado o no — esa suposición dejó 24 borradores sin revisar
 * sobre concejales nombrados accesibles durante semanas. Esta cola reúne
 * acusaciones sin contrastar junto a atribuciones de grupo político y al nombre
 * de quien las firmó; se queda en el portátil.
 *
 * NO escribe en `public/data/pleno-findings.json` y no existe ninguna ruta por
 * la que pueda hacerlo: el único escritor sigue siendo
 * `npm run correct-pleno-finding`. Tampoco puntúa, ordena por gravedad ni
 * recomienda — el porqué está en la cabecera de
 * `src/scraper/finding-exception.ts`.
 *
 * Lee la puerta del snapshot derivado que ya publica la marca de /hallazgos, en
 * vez de volver a clasificar aquí: dos clasificadores es como empiezan a
 * discrepar la página y la cola.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isReviewed, type ExceptionReviewLog } from '../src/scraper/finding-exception-review'
import { resolve } from 'node:path'

import {
  buildExceptionQueue,
  type ExceptionClaimFacts,
  type ExceptionQueue,
} from '../src/scraper/finding-exception'
import { validateFindingsSnapshot } from '../src/scraper/pleno-finding'
import type { QuoteProvenanceSnapshot } from '../src/scraper/quote-provenance'
import { loadVerifiedCorpus } from './lib/verified-corpus'

const FINDINGS = 'public/data/pleno-findings.json'
const PROVENANCE = 'public/data/finding-quote-provenance.json'
const OUT = 'editorial/finding-exception-queue.json'

function main() {
  const dryRun = process.argv.includes('--dry-run')
  const findingsPath = resolve(FINDINGS)
  if (!existsSync(findingsPath)) {
    console.error(`[finding-exception] falta ${FINDINGS}`)
    process.exit(2)
  }
  const provenancePath = resolve(PROVENANCE)
  if (!existsSync(provenancePath)) {
    console.error(
      `[finding-exception] falta ${PROVENANCE} — genéralo con ` +
        '`npm run compute:finding-quote-provenance`. Sin él, esta cola tendría que volver a ' +
        'decidir qué citas retendría la puerta, y dos decisores es como empiezan a discrepar la ' +
        'página y la cola.',
    )
    process.exit(2)
  }
  // Validar antes de leer: si el snapshot publicado no pasa su propio
  // validador, la cola se construiría sobre una forma que nadie garantiza.
  const snapshot = validateFindingsSnapshot(readFileSync(findingsPath, 'utf8'))
  const provenance = JSON.parse(readFileSync(provenancePath, 'utf8')) as QuoteProvenanceSnapshot

  // Los hechos que la puerta leyó, para enseñarlos junto a su veredicto. base ⊕
  // overlay, nunca la base sola: sobre la base sola el verificador dice
  // «verificado» de 149 de las 177 citas y esta cola saldría casi vacía.
  const corpus = loadVerifiedCorpus()
  const facts = new Map<string, ExceptionClaimFacts>()
  for (const [id, item] of corpus.merged) {
    const claim = (item.claim ?? {}) as { type?: unknown; accusationSubtype?: unknown }
    facts.set(id, {
      verdict: typeof item.verification?.verdict === 'string' ? item.verification.verdict : null,
      claimType: typeof claim.type === 'string' ? claim.type : null,
      accusationSubtype:
        typeof claim.accusationSubtype === 'string' ? claim.accusationSubtype : null,
    })
  }

  const queue: ExceptionQueue = buildExceptionQueue(
    snapshot.items,
    { gates: provenance.quotes ?? {}, facts },
    {
      generatedAt: new Date().toISOString(),
      findingsGeneratedAt: snapshot.generatedAt,
      provenanceGeneratedAt: provenance.generatedAt ?? '',
    },
  )

  // Una ejecución tiene que demostrar que hizo trabajo, y ésta puede fallar de
  // dos maneras silenciosas: sin corpus clasificaría todo como «sin puerta» y
  // encolaría los 52; con la puerta mal leída no encolaría ninguno. Se contrasta
  // lo encolado contra lo que el snapshot derivado ya dice, que se calculó por
  // otro camino.
  const esperado = provenance.contraste?.stats?.hallazgosSinCitaMostrable
  if (typeof esperado !== 'number') {
    console.error(
      '[finding-exception] el snapshot de procedencia no trae `contraste.stats` — regenéralo con ' +
        '`npm run compute:finding-quote-provenance` antes de encolar nada.',
    )
    process.exit(1)
  }
  if (queue.stats.encolados !== esperado) {
    console.error(
      `[finding-exception] la cola tiene ${queue.stats.encolados} filas y el snapshot de ` +
        `procedencia cuenta ${esperado} hallazgos sin ninguna cita mostrable — se aborta`,
    )
    process.exit(1)
  }
  const seleccionadas = queue.rows.filter((r) => r.decision !== null).length
  if (seleccionadas > 0) {
    console.error(
      `[finding-exception] ${seleccionadas} fila(s) llegan con decisión tomada — se aborta. ` +
        'Esta cola presenta; no decide.',
    )
    process.exit(1)
  }

  // Rows a person has already judged and kept. Filtered from what is PRESENTED,
  // never from `stats.encolados` — that number is cross-checked against the
  // provenance snapshot above, and more importantly "already reviewed" and "not
  // in scope" are different facts. Both are printed.
  //
  // The review is bound to the summary it judged, so editing a summary puts the
  // row back: what was cleared is specific words, not an id.
  let reviewLog: ExceptionReviewLog | null = null
  const REVIEWS = 'editorial/finding-exception-reviews.json'
  if (existsSync(resolve(REVIEWS))) {
    try {
      reviewLog = JSON.parse(readFileSync(resolve(REVIEWS), 'utf8')) as ExceptionReviewLog
    } catch {
      console.error(
        `[finding-exception] ${REVIEWS} ilegible — se trata como si no hubiera revisiones`,
      )
    }
  }
  const summaryOf = new Map(queue.rows.map((r) => [r.findingId, r.summary]))
  const pendientes = queue.rows.filter(
    (r) => !isReviewed(reviewLog, r.findingId, summaryOf.get(r.findingId) ?? ''),
  )
  const yaRevisados = queue.rows.length - pendientes.length

  const s = queue.stats
  console.log(
    `[finding-exception] ${s.encolados}/${s.hallazgosConCitas} hallazgo(s) con citas no tienen ` +
      `ni un literal que la puerta editorial mostraría\n` +
      `  · ${s.sinNingunaCitaContrastada} hechos por entero de citas que la puerta retiene\n` +
      `  · ${s.citasEnCola} citas en cola: ` +
      Object.entries(s.porContraste)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${v} ${k}`)
        .join(', ') +
      '\n  · firmados por: ' +
      Object.entries(s.porCurador)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${v} ${k}`)
        .join(', '),
  )
  console.log(
    `  · ${yaRevisados} ya revisado(s) y conservado(s) — fuera de la cola, no fuera del alcance\n` +
      `  · ${pendientes.length} pendiente(s) de que alguien decida`,
  )
  console.log(
    '[finding-exception] la cola PRESENTA la evidencia; no puntúa, no recomienda y no elige ' +
      'ninguna fila. Decide una persona, y escribe `npm run correct-pleno-finding` ' +
      '(o `npm run review:finding-exception` si el hallazgo merece la excepción).',
  )

  if (dryRun) {
    console.log('[finding-exception] --dry-run: no se escribe nada')
    return
  }
  mkdirSync(resolve('editorial'), { recursive: true })
  writeFileSync(
    resolve(OUT),
    JSON.stringify({ ...queue, revisados: yaRevisados, rows: pendientes }, null, 2) + '\n',
  )
  console.log(`[finding-exception] escrito ${OUT} (gitignored, nunca bajo public/)`)
}

main()
