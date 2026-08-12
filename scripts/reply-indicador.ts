#!/usr/bin/env tsx
/**
 * Derecho de réplica sobre una ficha de /eficiencia.
 *
 *   npm run indicador-reply -- <findingId> <respondente> "<cita literal>" [url]
 *
 * `respondente` es institucional —ayuntamiento, intervencion, concesionario,
 * ministerio— y el validador rechaza cualquier otra cosa. Esta familia de
 * hallazgos no nombra a personas ni a grupos políticos, así que tampoco puede
 * atribuirles una respuesta: quien explica una cifra es quien la lleva.
 *
 * La cita se publica ÍNTEGRA y verbatim. No se resume ni se parafrasea, igual
 * que en las réplicas de pleno: si el texto se acorta, la réplica pasa a ser
 * nuestra y deja de ser suya.
 *
 * Una réplica nueva SUSTITUYE a la anterior en la ficha, y eso es deliberado —
 * la ficha muestra la posición vigente de quien responde—; el historial de git
 * conserva todas, que es donde vive el registro.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  validateEficienciaFindingsSnapshot,
  RESPONDENTES,
  type Respondente,
} from '../src/scraper/eficiencia-finding'

const PUBLICADOS = resolve('public/data/eficiencia-findings.json')

function fail(msg: string, code = 1): never {
  process.stderr.write(`[indicador-reply] ${msg}\n`)
  process.exit(code)
}

function main(): void {
  const [findingId, from, quote, sourceUrl] = process.argv.slice(2)
  if (!findingId || !from || !quote) {
    fail(
      `usage: indicador-reply <findingId> <${RESPONDENTES.join('|')}> "<cita literal ≥20>" [url]`,
      2,
    )
  }
  if (!(RESPONDENTES as readonly string[]).includes(from)) {
    fail(
      `«${from}» no es un respondente válido. Sólo instituciones: ${RESPONDENTES.join(', ')}. ` +
        `Esta familia de hallazgos no nombra a personas ni a grupos, y por tanto tampoco ` +
        `les atribuye respuestas.`,
      2,
    )
  }
  if (quote.trim().length < 20) fail('la cita debe ser literal y de al menos 20 caracteres', 2)
  if (!existsSync(PUBLICADOS)) fail(`falta ${PUBLICADOS}`)

  const snap = validateEficienciaFindingsSnapshot(readFileSync(PUBLICADOS, 'utf8'))
  const ficha = snap.items.find((f) => f.id === findingId)
  if (!ficha) {
    const retirada = (snap.retractions ?? []).some((r) => r.findingId === findingId)
    fail(
      retirada
        ? `«${findingId}» fue retirada: ya no hay ficha a la que replicar`
        : `«${findingId}» no está publicada. Vivas: ${snap.items.map((f) => f.id).join(', ') || '(ninguna)'}`,
    )
  }

  ficha!.response = {
    from: from as Respondente,
    quote: quote.trim(),
    ...(sourceUrl ? { sourceUrl } : {}),
    respondedAt: new Date().toISOString().slice(0, 10),
  }

  const validado = validateEficienciaFindingsSnapshot(
    JSON.stringify({ ...snap, generatedAt: new Date().toISOString() }),
  )
  writeFileSync(PUBLICADOS, JSON.stringify(validado, null, 2) + '\n')
  process.stdout.write(`[indicador-reply] réplica de ${from} publicada en «${findingId}»\n`)
}

main()
