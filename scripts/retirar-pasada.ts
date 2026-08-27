#!/usr/bin/env tsx
/**
 * retirar-pasada — deja de aplicar los veredictos de una pasada retirada.
 *
 *   npm run retirar-pasada -- --source llm --dry-run
 *   npm run retirar-pasada -- --source llm
 *
 * Retirar una pasada era, hasta hoy, un comentario en su cabecera que ningún
 * código leía: `verify-pleno-claims-llm` se declara «LEGACY / SUPERSEDED … do
 * not use in the pipeline» desde el corte base/overlay, y sin embargo sus
 * veredictos seguían publicados y sostenían 87 filas fuertes sin un solo
 * corpus detrás. Once de ellas eran acusaciones que la puerta editorial
 * publicaba por eso mismo.
 *
 * Esto lo convierte en una OPERACIÓN. No inventa ningún veredicto ni «baja»
 * nada: quita las entradas de overlay de esa pasada, y entonces aflora lo que
 * la pasada determinista dijo — que para las 87 es `sin-datos`. Es la
 * diferencia entre retractar (afirmar algo nuevo) y dejar de aplicar (retirar
 * una afirmación que no se sostenía).
 *
 * Se niega a retirar una pasada que NO esté declarada como retirada en
 * `trinquete.ts`: si sigue viva, quitar sus veredictos sería destruir trabajo
 * bueno, y la declaración es donde eso se decide.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { TRINQUETE } from '../src/scraper/trinquete'
import { OVERLAY, rebuildVerified } from './verified-rebuild'
import { validateOverlay, type Overlay, type OverlaySource } from '../src/scraper/verified-merge'

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? (process.argv[i + 1] ?? null) : null
}

async function main(): Promise<void> {
  const dry = process.argv.includes('--dry-run')
  const source = arg('source') as OverlaySource | null
  if (!source || !(source in TRINQUETE)) {
    process.stderr.write(
      `[retirar] --source debe ser una de: ${Object.keys(TRINQUETE).join(', ')}\n`,
    )
    process.exit(2)
  }
  if (!TRINQUETE[source].retirada) {
    process.stderr.write(
      `[retirar] «${source}» NO está declarada como retirada en trinquete.ts. Si de verdad lo ` +
        'está, decláralo ahí primero: quitar los veredictos de una pasada viva destruye trabajo ' +
        'bueno, y esa decisión se toma en la declaración, no aquí.\n',
    )
    process.exit(1)
  }

  const overlay = JSON.parse(readFileSync(OVERLAY, 'utf8')) as Overlay
  const antes = Object.keys(overlay.entries).length
  const quitadas = Object.entries(overlay.entries).filter(([, e]) => e.source === source)

  process.stdout.write(
    `[retirar] «${source}» (${TRINQUETE[source].nombre}) · ${antes} entrada(s) de overlay · ` +
      `${quitadas.length} de esta pasada\n`,
  )
  if (quitadas.length === 0) {
    process.stdout.write('[retirar] no hay nada que retirar.\n')
    return
  }

  const siguiente: Overlay = {
    version: overlay.version,
    generatedAt: new Date().toISOString(),
    entries: Object.fromEntries(
      Object.entries(overlay.entries).filter(([, e]) => e.source !== source),
    ),
  }
  validateOverlay(siguiente)

  if (dry) {
    process.stdout.write(
      `[retirar] --dry-run: quedarían ${Object.keys(siguiente.entries).length} entrada(s). ` +
        'No se ha escrito nada.\n',
    )
    return
  }

  writeFileSync(OVERLAY, JSON.stringify(siguiente, null, 2) + '\n')
  const r = await rebuildVerified()
  process.stdout.write(
    `[retirar] quitadas ${quitadas.length} · overlay ${Object.keys(siguiente.entries).length} ` +
      `entrada(s) · recompuesto: ${JSON.stringify(r.byVerdict)}\n`,
  )
  process.stdout.write(
    '[retirar] no se ha inventado ningún veredicto: aflora el de la pasada determinista.\n',
  )
}

main()
