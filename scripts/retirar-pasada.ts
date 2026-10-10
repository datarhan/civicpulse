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
 *
 *   npm run retirar-pasada -- --sin-juicio --dry-run
 *   npm run retirar-pasada -- --sin-juicio
 *
 * `--sin-juicio` hace lo mismo con entradas sueltas de una pasada VIVA: las
 * retractaciones que el motor escribió sin que el modelo viera la declaración,
 * declaradas una a una en `src/scraper/retractaciones-sin-juicio.ts`, que
 * cuenta cómo se midieron. Ahí no hay trabajo que destruir, porque no lo hubo;
 * la declaración vuelve a ser la que lo decide, y `decidirDevolucion` pone las
 * guardas: sólo la entrada tal como se midió, y nunca si la base diría más que
 * `sin-datos`. Cada declarada sale en el parte con su desenlace (regla 2). Ni
 * una cuya explicación firmó después una persona (`--amend-reason`): la enmienda
 * conserva canal, rótulo y fecha, y sin esa guarda la borraría.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { TRINQUETE } from '../src/scraper/trinquete'
import { BASE, OVERLAY, rebuildVerified } from './verified-rebuild'
import { validateOverlay, type Overlay, type OverlaySource } from '../src/scraper/verified-merge'
import type { ClaimVerdict } from '../src/scraper/claim-verifier'
import { decidirDevolucion, type Devolucion } from '../src/scraper/decision-del-motor'
import { RETRACTACIONES_SIN_JUICIO } from '../src/scraper/retractaciones-sin-juicio'

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? (process.argv[i + 1] ?? null) : null
}

/** Cómo sale en el parte cada motivo para no devolver. */
const DESENLACE: Record<Extract<Devolucion, { accion: 'dejar' }>['porque'], string> = {
  'ya-no-esta': 'ya no está en el overlay',
  'otra-entrada': 'otra entrada, escrita después de medirla: no se toca',
  'explicacion-firmada': 'su explicación la firmó una persona: no se devuelve',
  'sin-base': 'sin declaración en la base: no se sabe qué afloraría',
  'la-base-subiria': 'la base subiría el veredicto: se queda, la mira una persona',
}

async function devolverSinJuicio(dry: boolean): Promise<void> {
  if (!existsSync(BASE)) {
    process.stderr.write(
      `[retirar] ${BASE} no está: sin la base no se sabe qué afloraría. ` +
        'Genérala con `npm run verify:pleno-claims`.\n',
    )
    process.exit(1)
  }
  const overlay = JSON.parse(readFileSync(OVERLAY, 'utf8')) as Overlay
  const base = JSON.parse(readFileSync(BASE, 'utf8')) as {
    items: { claim: { id: string }; verification: { verdict: ClaimVerdict } }[]
  }
  const veredictoBase = new Map(base.items.map((it) => [it.claim.id, it.verification.verdict]))

  const devueltas: string[] = []
  const dejadas: [string, Extract<Devolucion, { accion: 'dejar' }>['porque']][] = []
  const declaradas = Object.entries(RETRACTACIONES_SIN_JUICIO)
  for (const [id, medida] of declaradas) {
    const d = decidirDevolucion({
      medida,
      entrada: overlay.entries[id],
      veredictoBase: veredictoBase.get(id),
    })
    if (d.accion === 'devolver') devueltas.push(id)
    else dejadas.push([id, d.porque])
  }

  const cuenta = (p: string) => dejadas.filter(([, q]) => q === p).length
  process.stdout.write(
    `[retirar] --sin-juicio · ${declaradas.length} declarada(s) · devueltas ${devueltas.length} · ` +
      `ya no están ${cuenta('ya-no-esta')} · otra entrada ${cuenta('otra-entrada')} · ` +
      `explicación firmada ${cuenta('explicacion-firmada')} · ` +
      `sin base ${cuenta('sin-base')} · la base subiría ${cuenta('la-base-subiria')}\n`,
  )
  // Una línea por id con su desenlace, salvo las que ya se devolvieron: ésas ya
  // están en el registro, y repetirlas en cada pasada sería ruido.
  for (const id of devueltas) {
    process.stdout.write(`  · ${id}: ${dry ? 'se devolvería' : 'devuelta'} al determinista\n`)
  }
  for (const [id, porque] of dejadas) {
    if (porque !== 'ya-no-esta') process.stdout.write(`  · ${id}: ${DESENLACE[porque]}\n`)
  }
  if (devueltas.length === 0) {
    process.stdout.write('[retirar] no hay nada que devolver.\n')
    return
  }

  const quitar = new Set(devueltas)
  const siguiente: Overlay = {
    version: overlay.version,
    generatedAt: new Date().toISOString(),
    entries: Object.fromEntries(Object.entries(overlay.entries).filter(([id]) => !quitar.has(id))),
  }
  validateOverlay(siguiente)
  if (dry) {
    process.stdout.write('[retirar] --dry-run: no se ha escrito nada.\n')
    return
  }
  writeFileSync(OVERLAY, JSON.stringify(siguiente, null, 2) + '\n')
  const r = await rebuildVerified()
  process.stdout.write(
    `[retirar] overlay ${Object.keys(siguiente.entries).length} entrada(s) · recompuesto: ` +
      `${JSON.stringify(r.byVerdict)}\n` +
      '[retirar] no se ha inventado ningún veredicto: aflora el de la pasada determinista.\n',
  )
}

async function main(): Promise<void> {
  const dry = process.argv.includes('--dry-run')
  if (process.argv.includes('--sin-juicio')) return devolverSinJuicio(dry)
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
