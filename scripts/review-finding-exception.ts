#!/usr/bin/env tsx
/**
 * review:finding-exception — anota que una persona leyó una fila de la cola de
 * excepción y respondió que el sumario NO dice, con otras palabras, lo que la
 * cita retenida no puede decir: la ficha se mantiene y la cola encoge.
 *
 *   npm run review:finding-exception -- <findingId> \
 *     --reviewer "<nombre y apellidos>" --note "<por qué, ≥20 caracteres>"
 *   npm run review:finding-exception -- --list      # lo anotado, y lo que no cuenta
 *   npm run review:finding-exception -- --stale     # revisiones cuyo sumario cambió
 *   npm run review:finding-exception -- --migrar    # reescribe el registro a la versión vigente
 *
 * Escribe `editorial/finding-exception-reviews.json`. **Nunca `public/`**: nombra
 * fichas sobre grupos políticos junto a quién las dio por buenas.
 *
 * Es la ÚNICA respuesta que anota, y a propósito. Mantener no cambia la ficha,
 * así que sin registro la fila volvería siempre; las otras tres —corregir el
 * sumario, reclasificar una cita, retirar la ficha— cambian lo publicado con su
 * propia CLI y son su propia prueba. Aquí no hay camino que toque
 * `pleno-findings.json`.
 *
 * La revisión se ata al sumario que juzgó, por su huella: si el sumario cambia,
 * la fila vuelve, porque se juzgaron unas palabras y no un id. Y a la pregunta
 * de su versión: desde el 30-09-2026 el registro es la v2, y las «keep» de la
 * v1 —que respondían a «¿merece este hallazgo la excepción?»— se guardan en
 * `anteriores` y no cuentan. La primera anotación migra el registro;
 * `--migrar` lo hace sin anotar nada.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  isReviewed,
  migrarRegistro,
  NOTA_MINIMA,
  recordReview,
  staleReviews,
  summaryHash,
  type ExceptionReviewLog,
} from '../src/scraper/finding-exception-review'

const FINDINGS = 'public/data/pleno-findings.json'
export const REVIEW_LOG = 'editorial/finding-exception-reviews.json'

function loadLog(): ExceptionReviewLog | null {
  if (!existsSync(resolve(REVIEW_LOG))) return null
  try {
    return JSON.parse(readFileSync(resolve(REVIEW_LOG), 'utf8')) as ExceptionReviewLog
  } catch {
    return null
  }
}

function summaries(): Map<string, string> {
  const snap = JSON.parse(readFileSync(resolve(FINDINGS), 'utf8')) as {
    items: Array<{ id: string; summary: string }>
  }
  return new Map(snap.items.map((f) => [f.id, f.summary]))
}

function bail(msg: string): never {
  process.stderr.write(`[review-exception] ${msg}\n`)
  process.exit(2)
}

function escribir(log: ExceptionReviewLog) {
  mkdirSync(resolve('editorial'), { recursive: true })
  writeFileSync(resolve(REVIEW_LOG), JSON.stringify(log, null, 2) + '\n')
}

function main() {
  const argv = process.argv.slice(2)
  const flag = (n: string) => {
    const i = argv.indexOf(n)
    return i >= 0 ? (argv[i + 1] ?? null) : null
  }
  const ahora = new Date().toISOString()
  const log = loadLog()
  const byId = summaries()

  if (argv.includes('--list')) {
    // En memoria: listar no reescribe el registro.
    const registro = migrarRegistro(log, ahora)
    for (const r of registro.reviews) {
      const live = byId.get(r.findingId)
      const state =
        live === undefined
          ? 'LA FICHA YA NO ESTÁ'
          : summaryHash(live) === r.summaryHash
            ? 'vigente'
            : 'EL SUMARIO CAMBIÓ — vuelve a la cola'
      process.stdout.write(
        `${r.findingId}\t${r.reviewer}\t${r.reviewedAt.slice(0, 10)}\t${state}\n`,
      )
    }
    let anteriores = 0
    for (const b of registro.anteriores ?? []) {
      for (const r of b.reviews) {
        anteriores += 1
        process.stdout.write(
          `${r.findingId}\t${r.reviewer}\t${r.reviewedAt.slice(0, 10)}\t` +
            `VERSIÓN ANTERIOR (${b.version}) — no cuenta\n`,
        )
      }
    }
    process.stdout.write(
      `\n${registro.reviews.length} revisión(es) de la versión vigente` +
        (anteriores > 0
          ? ` · ${anteriores} de una versión anterior, que respondían a otra pregunta y no cuentan`
          : '') +
        '\n',
    )
    return
  }

  if (argv.includes('--stale')) {
    const registro = migrarRegistro(log, ahora)
    const stale = staleReviews(registro, byId)
    for (const r of stale) process.stdout.write(`${r.findingId}\t${r.reviewer}\n`)
    process.stdout.write(`\n${stale.length} revisión(es) vigentes ya no describen lo publicado\n`)
    return
  }

  if (argv.includes('--migrar')) {
    if (log === null) bail(`no hay registro que migrar en ${REVIEW_LOG}`)
    const registro = migrarRegistro(log, ahora)
    const apartadas = (registro.anteriores ?? []).reduce((n, b) => n + b.reviews.length, 0)
    escribir(registro)
    process.stdout.write(
      `[review-exception] ${REVIEW_LOG} en ${registro.version}: ` +
        `${registro.reviews.length} revisión(es) vigentes · ${apartadas} en \`anteriores\`, ` +
        'que no cuentan. No se ha perdido ninguna.\n',
    )
    return
  }

  const findingId = argv.find((a) => !a.startsWith('--') && a.startsWith('f-'))
  const reviewer = flag('--reviewer')
  const note = flag('--note')
  if (!findingId || !reviewer || !note) {
    bail(
      'uso: review:finding-exception <findingId> --reviewer "<nombre y apellidos>" ' +
        '--note "<por qué, ≥20 caracteres>"\n' +
        '     review:finding-exception --list | --stale | --migrar',
    )
  }
  // El mismo suelo que la bitácora de correcciones. Una nota que dice «ok»
  // anota que alguien pulsó, no que alguien juzgó.
  if (note.trim().length < NOTA_MINIMA) {
    bail(`--note tiene que tener ≥${NOTA_MINIMA} caracteres: es el registro del juicio`)
  }

  const summary = byId.get(findingId)
  if (summary === undefined) bail(`no hay ninguna ficha publicada con id "${findingId}"`)
  if (isReviewed(log, findingId, summary)) {
    process.stdout.write(`[review-exception] ${findingId} ya está mantenida a este sumario\n`)
    return
  }

  escribir(
    recordReview(log, {
      findingId,
      decision: 'keep',
      reviewer,
      reviewedAt: ahora,
      summaryHash: summaryHash(summary),
      note: note.trim(),
    }),
  )
  process.stdout.write(
    `[review-exception] ${findingId} anotada como KEEP por ${reviewer}\n` +
      '[review-exception] atada a este sumario: si cambia, la ficha vuelve a la cola\n',
  )
}

if (import.meta.url === `file://${process.argv[1]}`) main()
