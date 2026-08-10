#!/usr/bin/env tsx
/**
 * triage:quote-reanchor — construye la cola de reanclaje de los literales que
 * `/hallazgos` publica con marca: los que constan en la transcripción que su
 * sesión tenía antes de re-transcribirse y no en la vigente, y los que no se
 * pueden situar en ninguna de las dos con certeza.
 *
 *   npm run triage:quote-reanchor
 *   npm run triage:quote-reanchor -- --dry-run   # cuenta, no escribe
 *
 * Escribe `editorial/quote-reanchor-queue.json`. **editorial/, nunca public/**:
 * Vercel sirve `public/` entero, así que un fichero ahí es fetchable por URL
 * esté enlazado o no — esa suposición dejó 24 borradores sin revisar sobre
 * concejales nombrados accesibles durante semanas. Esta cola contiene pasajes
 * de transcripción sin revisar junto a atribuciones de grupo; se queda en el
 * portátil.
 *
 * PROPONE, no elige: `seleccion` sale `null` en todas las filas y no hay rama
 * que la rellene. El porqué está en la cabecera de `src/scraper/quote-reanchor.ts`.
 * Y no escribe en `public/data/pleno-findings.json`: el único escritor sigue
 * siendo `npm run correct-pleno-finding --field quote.<i>.text`, que la cola se
 * limita a componer.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { validateFindingsSnapshot } from '../src/scraper/pleno-finding'
import { buildReanchorQueue, indexTranscript } from '../src/scraper/quote-reanchor'
import type { QuoteProvenanceSnapshot } from '../src/scraper/quote-provenance'
import { loadSessionTexts } from './lib/transcript-corpus'

const FINDINGS = 'public/data/pleno-findings.json'
const PROVENANCE = 'public/data/finding-quote-provenance.json'
const OUT = 'editorial/quote-reanchor-queue.json'

function main() {
  const dryRun = process.argv.includes('--dry-run')
  const findingsPath = resolve(FINDINGS)
  if (!existsSync(findingsPath)) {
    console.error(`[quote-reanchor] falta ${FINDINGS}`)
    process.exit(2)
  }
  const provenancePath = resolve(PROVENANCE)
  if (!existsSync(provenancePath)) {
    console.error(
      `[quote-reanchor] falta ${PROVENANCE} — genéralo con ` +
        '`npm run compute:finding-quote-provenance`. Sin él, esta cola tendría que ' +
        'volver a decidir qué citas están afectadas, y dos decisores es como empiezan a ' +
        'discrepar la página y la cola.',
    )
    process.exit(2)
  }
  // Validar antes de leer: si el snapshot publicado no pasa su propio
  // validador, la cola se construiría sobre una forma que nadie garantiza.
  const snapshot = validateFindingsSnapshot(readFileSync(findingsPath, 'utf8'))
  const provenance = JSON.parse(readFileSync(provenancePath, 'utf8')) as QuoteProvenanceSnapshot

  const sessions = loadSessionTexts(snapshot.items.map((f) => f.plenoId))
  const corpus = new Map<
    string,
    {
      current: ReturnType<typeof indexTranscript> | null
      superseded: ReturnType<typeof indexTranscript> | null
    }
  >()
  for (const [id, s] of sessions) {
    corpus.set(id, {
      current: s.current ? indexTranscript(s.current) : null,
      superseded: s.superseded ? indexTranscript(s.superseded) : null,
    })
  }

  const queue = buildReanchorQueue(snapshot.items, provenance, corpus, {
    generatedAt: new Date().toISOString(),
  })

  // Una ejecución tiene que demostrar que hizo trabajo: se contrasta lo
  // encolado contra lo que el snapshot de procedencia dice que está marcado,
  // en vez de informar sólo del total encolado.
  const expected = provenance.stats.soloEnSustituida + provenance.stats.sinDeterminar
  if (queue.stats.encoladas !== expected) {
    console.error(
      `[quote-reanchor] la cola tiene ${queue.stats.encoladas} filas y el snapshot de ` +
        `procedencia marca ${expected} citas — se aborta`,
    )
    process.exit(1)
  }
  const s = queue.stats
  console.log(
    `[quote-reanchor] ${s.encoladas}/${expected} cita(s) marcada(s) encoladas\n` +
      Object.entries(s.porEstado)
        .map(([k, v]) => `  · ${v} ${k}`)
        .join('\n') +
      `\n  · ${s.conCandidatos} con al menos un pasaje candidato del texto nuevo\n` +
      `  · ${s.sinCandidatos} sin ninguno\n` +
      `  · ${s.conMarcaDeTiempo} con un candidato situado por marca de tiempo`,
  )
  console.log(
    '[quote-reanchor] la cola PROPONE pasajes; no selecciona ninguno y no afirma que ' +
      'ninguno sea la cita. Decide una persona, y escribe `npm run correct-pleno-finding`.',
  )

  if (dryRun) {
    console.log('[quote-reanchor] --dry-run: no se escribe nada')
    return
  }
  mkdirSync(resolve('editorial'), { recursive: true })
  writeFileSync(resolve(OUT), JSON.stringify(queue, null, 2) + '\n')
  console.log(`[quote-reanchor] escrito ${OUT} (gitignored, nunca bajo public/)`)
}

main()
