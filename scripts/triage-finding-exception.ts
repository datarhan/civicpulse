#!/usr/bin/env tsx
/**
 * triage:finding-exception — construye la cola de las fichas publicadas con al
 * menos una cita cuyo literal retiene la puerta editorial, para que una persona
 * responda, ficha a ficha: **¿dice el sumario, con otras palabras, lo que la
 * cita retenida no puede decir?**
 *
 *   npm run triage:finding-exception
 *   npm run triage:finding-exception -- --dry-run   # cuenta, no escribe
 *
 * Hasta el 30-09-2026 preguntaba «¿merece este hallazgo la excepción?» sobre
 * las fichas sin ninguna cita mostrable: una respuesta que desde el 27-08 no
 * cambiaba nada de la página, sobre casi todas las fichas. El porqué del
 * cambio, en la cabecera de `src/scraper/finding-exception.ts`.
 *
 * Escribe `editorial/finding-exception-queue.json`. **editorial/, nunca
 * public/**: Vercel sirve `public/` entero, así que un fichero ahí es fetchable
 * por URL esté enlazado o no — esa suposición dejó 24 borradores sin revisar
 * sobre concejales nombrados accesibles durante semanas. Esta cola reúne los
 * literales que la página retiene junto a atribuciones de grupo político y al
 * nombre de quien firmó cada ficha; se queda en el portátil.
 *
 * NO escribe en `public/data/pleno-findings.json` ni ejecuta nada: cada fila
 * trae las cuatro respuestas compuestas —mantener, corregir el sumario,
 * reclasificar una cita retenida, retirar la ficha— y las firma una persona en
 * su terminal. Tampoco puntúa, ordena por gravedad ni recomienda.
 *
 * Lee la puerta del snapshot derivado que ya publica la marca de /hallazgos, en
 * vez de volver a clasificar aquí: dos clasificadores es como empiezan a
 * discrepar la página y la cola.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { PUERTA_QUE_RETIENE } from '../src/lib/cita-retenida.js'
import {
  buildExceptionQueue,
  hechosDelVerificador,
  PREGUNTA_DE_LA_COLA,
  type ExceptionQueue,
} from '../src/scraper/finding-exception'
import {
  migrarRegistro,
  pendientesDeRevision,
  type ExceptionReviewLog,
} from '../src/scraper/finding-exception-review'
import { validateFindingsSnapshot } from '../src/scraper/pleno-finding'
import type { QuoteProvenanceSnapshot } from '../src/scraper/quote-provenance'
import { loadVerifiedCorpus } from './lib/verified-corpus'

const FINDINGS = 'public/data/pleno-findings.json'
const PROVENANCE = 'public/data/finding-quote-provenance.json'
const OUT = 'editorial/finding-exception-queue.json'
const REVIEWS = 'editorial/finding-exception-reviews.json'

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

  // Los hechos que la puerta leyó, para enseñarlos junto a su veredicto: del
  // corpus publicado, nunca de la base sola.
  const queue: ExceptionQueue = buildExceptionQueue(
    snapshot.items,
    { gates: provenance.quotes ?? {}, facts: hechosDelVerificador(loadVerifiedCorpus().merged) },
    {
      generatedAt: new Date().toISOString(),
      findingsGeneratedAt: snapshot.generatedAt,
      provenanceGeneratedAt: provenance.generatedAt ?? '',
    },
  )

  // Una ejecución tiene que demostrar que hizo trabajo, y ésta puede fallar de
  // dos maneras silenciosas: con la puerta mal leída no encolaría ninguna, y
  // con el predicado roto encolaría de menos. Se contrasta lo encolado con lo
  // que el snapshot derivado ya contó por otro camino: cada cita retenida
  // encola su ficha, así que la cola las lleva TODAS.
  const stats = provenance.contraste?.stats
  const retenidasEsperadas = stats?.porContraste?.[PUERTA_QUE_RETIENE]
  const todasEsperadas = stats?.hallazgosSoloConCitasOcultas
  if (typeof retenidasEsperadas !== 'number' || typeof todasEsperadas !== 'number') {
    console.error(
      '[finding-exception] el snapshot de procedencia no trae `contraste.stats` — regenéralo con ' +
        '`npm run compute:finding-quote-provenance` antes de encolar nada.',
    )
    process.exit(1)
  }
  if (queue.stats.citasRetenidas !== retenidasEsperadas) {
    console.error(
      `[finding-exception] la cola lleva ${queue.stats.citasRetenidas} citas retenidas y el ` +
        `snapshot de procedencia cuenta ${retenidasEsperadas} — se aborta`,
    )
    process.exit(1)
  }
  if (queue.stats.todasRetenidas !== todasEsperadas) {
    console.error(
      `[finding-exception] la cola tiene ${queue.stats.todasRetenidas} fichas con todas sus citas ` +
        `retenidas y el snapshot de procedencia cuenta ${todasEsperadas} — se aborta`,
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

  // Las filas que alguien ya mantuvo A ESTE sumario salen de lo que se
  // presenta, nunca de `stats.encolados`: «ya revisada» y «fuera del alcance»
  // son hechos distintos, y se imprimen los dos. El registro se migra en
  // memoria —su único escritor es `review:finding-exception`—, así que las
  // revisiones de una versión anterior no cuentan y se dice cuántas son.
  let leido: ExceptionReviewLog | null = null
  if (existsSync(resolve(REVIEWS))) {
    try {
      leido = JSON.parse(readFileSync(resolve(REVIEWS), 'utf8')) as ExceptionReviewLog
    } catch {
      console.error(
        `[finding-exception] ${REVIEWS} ilegible — se trata como si no hubiera revisiones`,
      )
    }
  }
  const registro = leido ? migrarRegistro(leido, new Date().toISOString()) : null
  const { pendientes, revisadas } = pendientesDeRevision(queue.rows, registro)
  const anteriores = (registro?.anteriores ?? []).reduce((n, b) => n + b.reviews.length, 0)

  const s = queue.stats
  console.log(
    `[finding-exception] ${s.encolados}/${s.hallazgosConCitas} ficha(s) con citas tienen al ` +
      `menos una cita cuyo literal retiene la puerta editorial\n` +
      `  · ${s.citasRetenidas} citas retenidas de ${s.citasEnCola} en cola: ` +
      Object.entries(s.porContraste)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${v} ${k}`)
        .join(', ') +
      `\n  · ${s.todasRetenidas} con TODAS sus citas retenidas` +
      '\n  · firmadas por: ' +
      Object.entries(s.porCurador)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${v} ${k}`)
        .join(', '),
  )
  console.log(
    `  · ${revisadas.length} ya mantenida(s) a su sumario — fuera de la cola, no fuera del alcance\n` +
      (anteriores > 0
        ? `  · ${anteriores} revisión(es) de una versión anterior del registro no cuentan: ` +
          'respondían a otra pregunta\n'
        : '') +
      `  · ${pendientes.length} pendiente(s) de que alguien responda`,
  )
  console.log(`[finding-exception] la pregunta: «${PREGUNTA_DE_LA_COLA}»`)
  console.log(
    '[finding-exception] la cola PRESENTA la evidencia y compone las cuatro respuestas; no ' +
      'puntúa, no recomienda, no elige ninguna fila ni ejecuta ninguna orden. Las firma una ' +
      'persona en su terminal.',
  )

  if (dryRun) {
    console.log('[finding-exception] --dry-run: no se escribe nada')
    return
  }
  mkdirSync(resolve('editorial'), { recursive: true })
  writeFileSync(
    resolve(OUT),
    JSON.stringify({ ...queue, revisados: revisadas.length, rows: pendientes }, null, 2) + '\n',
  )
  console.log(`[finding-exception] escrito ${OUT} (gitignored, nunca bajo public/)`)
}

main()
