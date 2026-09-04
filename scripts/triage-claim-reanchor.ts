#!/usr/bin/env tsx
/**
 * triage:claim-reanchor — compone la cola de reanclaje de las declaraciones que
 * la puerta de publicación retiene por no constar en ninguna transcripción.
 *
 *   npm run triage:claim-reanchor
 *   npm run triage:claim-reanchor -- --dry-run   # cuenta, no escribe
 *
 * Escribe `editorial/claim-reanchor-queue.json`. **editorial/, nunca public/**:
 * Vercel sirve `public/` entero, así que un fichero ahí es fetchable por URL
 * esté enlazado o no — la suposición que dejó 24 borradores sin revisar sobre
 * concejales nombrados accesibles durante semanas. Esta cola lleva pasajes de
 * transcripción sin revisar; se queda en el portátil.
 *
 * PROPONE, no elige. El porqué está en la cabecera de
 * `src/scraper/claim-reanchor.ts`, y el único escritor sigue siendo
 * `npm run reanchor-claim`, que esta cola se limita a componer.
 *
 * data-graph: reads public/data/pleno-transcripts/
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import {
  buildClaimReanchorQueue,
  type FuenteIndexada,
  type ReanchorClaimItem,
} from '../src/scraper/claim-reanchor'
import { indexTranscript } from '../src/scraper/quote-reanchor'
import { archivosDe } from '../src/scraper/superseded-archive'
import { idsSinProcedencia } from './chunk-pleno-claims'
import { loadSupersededTexts, SUPERSEDED_DIR, TRANSCRIPTS_DIR } from './lib/transcript-corpus'

const VERIFIED = 'public/data/pleno-claims-verified.json'
const OUT = 'editorial/claim-reanchor-queue.json'

function main() {
  const dryRun = process.argv.includes('--dry-run')
  const verifiedPath = resolve(VERIFIED)
  if (!existsSync(verifiedPath)) {
    console.error(`[claim-reanchor] falta ${VERIFIED} — corre \`npm run verify:pleno-claims\``)
    process.exit(2)
  }
  const snap = JSON.parse(readFileSync(verifiedPath, 'utf8')) as {
    composedAt?: string
    items: ReanchorClaimItem[]
  }

  // Quién está afectado NO lo decide esta cola: se lo pregunta a la misma
  // función que aplica la puerta de publicación, con los mismos textos y el
  // mismo emparejador. Dos derivaciones acabarían discrepando.
  const leerVigente = (id: string) => {
    const p = resolve(TRANSCRIPTS_DIR, `${id}.txt`)
    return existsSync(p) ? readFileSync(p, 'utf8') : null
  }
  const retenidas = idsSinProcedencia(snap.items, leerVigente, (id) => loadSupersededTexts(id))

  // Sólo se indexan las sesiones que tienen alguna retenida: indexar las 22
  // para mirar 5 es trabajo que nadie lee.
  const sesiones = new Set(
    snap.items.filter((it) => retenidas.has(it.claim.id)).map((it) => it.claim.plenoId),
  )
  const sobrantes = existsSync(SUPERSEDED_DIR) ? readdirSync(SUPERSEDED_DIR) : []
  const corpus = new Map<string, FuenteIndexada[]>()
  for (const plenoId of sesiones) {
    const fuentes: FuenteIndexada[] = []
    const vigente = leerVigente(plenoId)
    if (vigente != null) fuentes.push({ fuente: 'current', index: indexTranscript(vigente) })
    for (const nombre of archivosDe(sobrantes, plenoId)) {
      fuentes.push({
        fuente: `superseded/${nombre}`,
        index: indexTranscript(readFileSync(resolve(SUPERSEDED_DIR, nombre), 'utf8')),
      })
    }
    corpus.set(plenoId, fuentes)
  }

  const queue = buildClaimReanchorQueue(snap.items, retenidas, corpus, {
    generatedAt: new Date().toISOString(),
    verifiedComposedAt: snap.composedAt ?? '',
  })

  // Una ejecución tiene que demostrar que hizo trabajo: se coteja lo encolado
  // contra lo que la puerta retuvo, en vez de informar sólo del total.
  const { stats } = queue
  if (stats.encoladas !== stats.retenidas) {
    console.error(
      `[claim-reanchor] la puerta retuvo ${stats.retenidas} y se han encolado ${stats.encoladas}. ` +
        'Deberían coincidir: las dos salen de idsSinProcedencia.',
    )
    process.exit(1)
  }

  console.log(`── triage:claim-reanchor ──────────────────────────────────`)
  console.log(
    `  ${stats.retenidas} retenida(s) · ${stats.conCandidatos} con candidatos · ` +
      `${stats.sinCandidatos} sin ninguno · ${stats.sinTranscripcion} sin transcripción`,
  )
  for (const [tipo, n] of Object.entries(stats.porTipo).sort((a, b) => b[1] - a[1])) {
    console.log(`     ${String(n).padStart(3)}  ${tipo}`)
  }
  for (const r of queue.rows) {
    const mejor = r.candidatesPorFuente[0]?.candidates[0]
    console.log(`\n  ${r.claimId}  [${r.type}]  ${r.plenoDate}`)
    console.log(`     publicado: «${r.publishedVerbatim}»`)
    console.log(
      mejor
        ? `     candidato: «${mejor.text.slice(0, 140)}»  (${r.candidatesPorFuente[0].fuente}, ` +
            `solapamiento ${(mejor.contentOverlap * 100).toFixed(0)} %, faltan: ${mejor.missingWords.join(', ') || '—'})`
        : '     candidato: NINGUNO — no hay pasaje que comparta vocabulario con esta cita',
    )
  }

  if (dryRun) {
    console.log(`\n[claim-reanchor] --dry-run: no se ha escrito ${OUT}`)
    return
  }
  const outPath = resolve(OUT)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(queue, null, 2) + '\n')
  console.log(`\n[claim-reanchor] ${stats.encoladas} fila(s) → ${OUT}`)
  console.log(
    `  Elige tú el literal: cada fila trae su \`correctionCommand\` con el hueco sin rellenar.`,
  )
}

main()
