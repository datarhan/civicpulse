/**
 * Curator-only: apply an approved verdict DOWNGRADE to the overlay (P2). This is
 * the ONLY path that mutates a published verdict — downgrade-only, reason-gated,
 * human-driven. Writes a curator-downgrade overlay entry + rebuilds verified.json.
 *
 *   npm run downgrade-verdict -- <claimId> <verificado|parcial|sin-datos> \
 *       --reason "<≥20 chars>" [--editor "<name>"]
 *
 * Validates: the claim exists, the move is a real downgrade vs the CURRENT
 * published verdict, and the reason is ≥20 chars. Never raises a verdict.
 * `--editor` acepta la cuenta de rol y rechaza, antes de leer nada, el hueco de
 * una orden preparada sin rellenar (`rechazoDeMarcador`,
 * src/scraper/firma-de-persona.ts); las dos vías de abajo piden una persona.
 *
 * ── `--amend-reason` ────────────────────────────────────────────────────────
 *
 *   npm run downgrade-verdict -- <claimId> <veredicto que conserva> \
 *       --amend-reason --new "<motivo nuevo>" \
 *       --reason "<por qué se enmienda, ≥20>" --editor "<Nombre Apellido>"
 *
 * Sustituye el MOTIVO de una bajada ya publicada —el resumen que la tarjeta
 * imprime bajo la cita— sin mover el veredicto: bajar al mismo veredicto no es
 * una bajada, e `isDowngrade` lo rechaza. El veredicto va en la orden para que
 * se niegue si la entrada ya no dice lo que decía al prepararla, y `--editor`
 * nombra a una persona, comprobado antes de leer nada. El porqué, en
 * `enmendarMotivoDeBajada` (src/scraper/verified-merge.ts).
 *
 * ── `--literal-no-dicho` ────────────────────────────────────────────────────
 *
 *   npm run downgrade-verdict -- <claimId> sin-datos --literal-no-dicho \
 *       --reason "<qué se oye y dónde, ≥20>" --editor "<Nombre Apellido>"
 *
 * Retira la declaración: escuchada la sesión, su literal no es lo que se dijo.
 * La deja en sin-datos con la marca que la puerta lee, y deja de publicarse en
 * /plenos/:id, /departamentos/:slug y /declaraciones. El caso y el porqué, en
 * `src/scraper/declaracion-retirada.ts`; la entrada, en `retirarDeclaracion`.
 *
 * Se niega mientras un hallazgo cite la declaración: la ficha preguntaría a la
 * puerta por esa cita y pintaría «literal retenido — acusación no contrastada»
 * sobre una cita que no acusa a nadie. Primero se retira la cita del hallazgo
 * (`correct-pleno-finding --remove quote.N`), que deja su motivo en la bitácora
 * de la ficha; luego la declaración.
 *
 * ── `--dry-run` ─────────────────────────────────────────────────────────────
 *
 * Las tres vías: valida la entrada como si fuera a escribir, la enseña y no
 * escribe nada, ni el overlay ni la recomposición.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadOverlay, rebuildVerified, OVERLAY, VERIFIED } from './verified-rebuild'
import {
  applyOverlayEntries,
  enmendarMotivoDeBajada,
  retirarDeclaracion,
  verificacionDeBajada,
  type Overlay,
} from '../src/scraper/verified-merge'
import { rechazoDeFirma, rechazoDeMarcador } from '../src/scraper/firma-de-persona'
import type { ClaimVerdict, ClaimVerification } from '../src/scraper/claim-verifier'

const DOWNGRADE_TARGETS: ClaimVerdict[] = ['verificado', 'parcial', 'sin-datos']

/** Los hallazgos: una declaración que cita uno no se retira sin retirar antes la cita. */
const FINDINGS = resolve('public/data/pleno-findings.json')

const USAGE =
  'usage: npm run downgrade-verdict -- <claimId> <verificado|parcial|sin-datos> --reason "<≥20 chars>" [--editor name] [--dry-run]\n' +
  '       npm run downgrade-verdict -- <claimId> <veredicto que conserva> --amend-reason --new "<motivo nuevo>" --reason "<por qué se enmienda, ≥20>" --editor "<Nombre Apellido>" [--dry-run]\n' +
  '       npm run downgrade-verdict -- <claimId> sin-datos --literal-no-dicho --reason "<qué se oye y dónde, ≥20>" --editor "<Nombre Apellido>" [--dry-run]'

export type Orden =
  | {
      modo: 'bajar'
      claimId: string
      veredicto: ClaimVerdict
      motivo: string
      editor: string
      dryRun: boolean
    }
  | {
      modo: 'enmendar'
      claimId: string
      veredicto: ClaimVerdict
      motivo: string
      porque: string
      editor: string
      dryRun: boolean
    }
  | {
      modo: 'retirar'
      claimId: string
      veredicto: 'sin-datos'
      motivo: string
      editor: string
      dryRun: boolean
    }

/** La orden, leída y comprobada en lo que no necesita los datos. Lanza con el porqué. */
export function leerOrden(argv: string[]): Orden {
  const pos: string[] = []
  let reason = ''
  let editor: string | null = null
  let nuevo: string | null = null
  let enmendar = false
  let retirar = false
  let dryRun = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--reason') reason = argv[++i] ?? ''
    else if (a === '--editor') editor = argv[++i] ?? ''
    else if (a === '--new') nuevo = argv[++i] ?? ''
    else if (a === '--amend-reason') enmendar = true
    else if (a === '--literal-no-dicho') retirar = true
    else if (a === '--dry-run') dryRun = true
    else pos.push(a)
  }
  const [claimId, veredicto] = pos as [string, ClaimVerdict]
  if (!claimId || !veredicto) throw new Error(USAGE)
  if (!DOWNGRADE_TARGETS.includes(veredicto)) throw new Error(`invalid target verdict ${veredicto}`)
  // Antes que las otras dos vías: si no, una orden con --amend-reason se leería
  // como enmienda y la retirada se perdería en silencio.
  if (retirar) {
    if (enmendar) {
      throw new Error(
        '--literal-no-dicho y --amend-reason son dos órdenes distintas: una retira la ' +
          'declaración, la otra enmienda el motivo de una bajada',
      )
    }
    if (nuevo != null) {
      throw new Error('--new no va con --literal-no-dicho: el motivo de la retirada va en --reason')
    }
    if (veredicto !== 'sin-datos') {
      throw new Error(
        `una retirada deja la declaración en sin-datos, no en ${veredicto}: el veredicto que ` +
          'tenía se contrastó sobre una frase que no se dijo',
      )
    }
    if (!reason) throw new Error('--literal-no-dicho lleva en --reason qué se oye y dónde')
    const rechazo = rechazoDeFirma(editor ?? '')
    if (rechazo) {
      throw new Error(`una retirada la firma una persona, con su nombre (--editor): ${rechazo}`)
    }
    return { modo: 'retirar', claimId, veredicto, motivo: reason, editor, dryRun }
  }
  if (!enmendar) {
    if (nuevo != null) {
      throw new Error(
        '--new sólo va con --amend-reason: sin él, --reason sería el motivo de otra bajada y --new se perdería',
      )
    }
    // La bajada de siempre la firma el operador —sin --editor, «curator»—, y
    // sólo se rechaza el hueco de una orden preparada sin rellenar.
    const firma = editor ?? 'curator'
    const hueco = rechazoDeMarcador(firma)
    if (hueco) throw new Error(`--editor: ${hueco}`)
    return { modo: 'bajar', claimId, veredicto, motivo: reason, editor: firma, dryRun }
  }
  if (nuevo == null) throw new Error('--amend-reason lleva el motivo nuevo en --new')
  if (!reason) throw new Error('--amend-reason lleva en --reason por qué se enmienda')
  const rechazo = rechazoDeFirma(editor ?? '')
  if (rechazo) {
    throw new Error(
      `una enmienda de motivo la firma una persona, con su nombre (--editor): ${rechazo}`,
    )
  }
  return { modo: 'enmendar', claimId, veredicto, motivo: nuevo, porque: reason, editor, dryRun }
}

function escribirYRecomponer(overlay: Overlay, hecho: string): void {
  writeFileSync(OVERLAY, JSON.stringify(overlay, null, 2) + '\n')
  rebuildVerified()
    .then(() => process.stdout.write(`${hecho} · overlay + verified.json updated\n`))
    .catch((err) => {
      process.stderr.write(
        `[downgrade] overlay written but rebuild FAILED: ${(err as Error).message}\n`,
      )
      process.exit(1)
    })
}

function enmendar(orden: Extract<Orden, { modo: 'enmendar' }>): void {
  const { claimId, veredicto, motivo, porque, editor } = orden
  let hecho: { overlay: Overlay; previous: string }
  try {
    hecho = enmendarMotivoDeBajada(
      loadOverlay(),
      { claimId, veredicto, motivo, porque, editor },
      new Date().toISOString(),
    )
  } catch (err) {
    process.stderr.write(`[downgrade] rejected: ${(err as Error).message}\n`)
    process.exit(1)
  }
  if (orden.dryRun) {
    process.stdout.write(JSON.stringify(hecho.overlay.entries[claimId], null, 2) + '\n')
    process.stdout.write(
      `[downgrade] --dry-run: la enmienda de ${claimId} valida (${veredicto}, el veredicto no se mueve; ` +
        `motivo anterior ${hecho.previous}). No se ha escrito nada.\n`,
    )
    return
  }
  escribirYRecomponer(
    hecho.overlay,
    `[downgrade] ${claimId}: motivo enmendado (${veredicto}, el veredicto no se mueve) · editor=${editor} · motivo anterior ${hecho.previous}`,
  )
}

function bajar(orden: Extract<Orden, { modo: 'bajar' }>, actual: ClaimVerification): void {
  const { claimId, veredicto, motivo, editor } = orden
  const current = actual.verdict
  // New verification reflects the downgrade. sin-datos = no supporting evidence.
  const verification = verificacionDeBajada(claimId, actual, veredicto, motivo)

  let overlay = loadOverlay()
  try {
    // isDowngrade is validated against the CURRENT published verdict.
    overlay = applyOverlayEntries(
      overlay,
      [{ claimId, verification, source: 'curator-downgrade', reason: motivo, editor }],
      new Date().toISOString(),
      new Map([[claimId, current]]),
    )
  } catch (err) {
    process.stderr.write(`[downgrade] rejected: ${(err as Error).message}\n`)
    process.exit(1)
  }
  if (orden.dryRun) {
    process.stdout.write(JSON.stringify(overlay.entries[claimId], null, 2) + '\n')
    process.stdout.write(
      `[downgrade] --dry-run: ${claimId}: ${current} → ${veredicto} valida. No se ha escrito nada.\n`,
    )
    return
  }
  escribirYRecomponer(
    overlay,
    `[downgrade] ${claimId}: ${current} → ${veredicto} (curator: ${editor})`,
  )
}

/**
 * Las citas de /hallazgos que salen de esta declaración, como `ficha quote.N`,
 * o `null` si no hay fichero de hallazgos que leer: sin él no se sabe, y eso no
 * es «ninguna». Las fichas retiradas ya no están en `items`.
 */
function citasEnHallazgos(claimId: string): string[] | null {
  if (!existsSync(FINDINGS)) return null
  const snap = JSON.parse(readFileSync(FINDINGS, 'utf8')) as {
    items?: { id?: string; quotes?: { sourceClaimId?: string }[] }[]
  }
  const out: string[] = []
  for (const f of snap.items ?? []) {
    const quotes = f.quotes ?? []
    for (let i = 0; i < quotes.length; i += 1) {
      if (quotes[i]?.sourceClaimId === claimId) out.push(`${f.id ?? '?'} quote.${i}`)
    }
  }
  return out
}

function retirar(
  orden: Extract<Orden, { modo: 'retirar' }>,
  item: { claim: { verbatim?: string }; verification: ClaimVerification },
): void {
  const { claimId, motivo, editor } = orden
  const citas = citasEnHallazgos(claimId)
  if (citas === null) {
    process.stderr.write(
      `[downgrade] rejected: falta ${FINDINGS}; sin él no se sabe si un hallazgo cita ${claimId}\n`,
    )
    process.exit(1)
  }
  if (citas.length > 0) {
    process.stderr.write(
      `[downgrade] rejected: ${claimId} sigue citada en /hallazgos, y la ficha pintaría ` +
        '«literal retenido — acusación no contrastada» sobre una cita que no acusa a nadie:\n' +
        citas.map((c) => `    · ${c}\n`).join('') +
        '  Retira antes cada cita, que deja su motivo en la bitácora de la ficha:\n' +
        '    npm run correct-pleno-finding -- <ficha> --remove quote.<N> --reason "…" --editor "…"\n',
    )
    process.exit(1)
  }
  let overlay: Overlay
  try {
    overlay = retirarDeclaracion(
      loadOverlay(),
      { claimId, literal: item.claim.verbatim ?? '', motivo, editor },
      new Date().toISOString(),
    )
  } catch (err) {
    process.stderr.write(`[downgrade] rejected: ${(err as Error).message}\n`)
    process.exit(1)
  }
  const antes = item.verification.verdict
  if (orden.dryRun) {
    process.stdout.write(JSON.stringify(overlay.entries[claimId], null, 2) + '\n')
    process.stdout.write(
      `[downgrade] --dry-run: la retirada de ${claimId} valida (${antes} → sin-datos, y la puerta ` +
        'deja de publicarla). No se ha escrito nada.\n',
    )
    return
  }
  escribirYRecomponer(
    overlay,
    `[downgrade] ${claimId}: retirada, literal no dicho (${antes} → sin-datos) · editor=${editor}`,
  )
}

function main(): void {
  let orden: Orden
  try {
    orden = leerOrden(process.argv.slice(2))
  } catch (err) {
    process.stderr.write(`[downgrade] ${(err as Error).message}\n`)
    process.exit(2)
  }
  if (!existsSync(VERIFIED)) {
    process.stderr.write(`[downgrade] ${VERIFIED} missing — run verify:pleno-claims first\n`)
    process.exit(1)
  }
  const snap = JSON.parse(readFileSync(VERIFIED, 'utf8')) as {
    items: { claim: { id: string; verbatim?: string }; verification: ClaimVerification }[]
  }
  const item = snap.items.find((it) => it.claim.id === orden.claimId)
  if (!item) {
    process.stderr.write(`[downgrade] claim ${orden.claimId} not found\n`)
    process.exit(1)
  }
  if (orden.modo === 'enmendar') enmendar(orden)
  else if (orden.modo === 'retirar') retirar(orden, item)
  else bajar(orden, item.verification)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
