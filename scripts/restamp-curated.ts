#!/usr/bin/env tsx
/**
 * Re-sellar un fichero curado: mover `generatedAt` y NADA MÁS.
 *
 *   npm run restamp -- promises.json --motivo "el sello se quedó en c66cf931"
 *   npm run restamp -- area-fit.json --at 2026-08-24T07:48:32+02:00 --motivo "…"
 *   npm run restamp -- promises.json --motivo "…" --dry-run
 *
 * ## Por qué existe
 *
 * `check:stamps` destapó cuatro ficheros curados cuyo contenido cambió sin que
 * el sello se moviera. El remedio obvio —editar la fecha a mano— lo deniega el
 * gancho `guard-curated-writes`, y con razón: una edición directa a un fichero
 * curado se salta el validador que lo protege. Pero ninguno de los CLI que sí
 * pueden escribirlos sabe hacer SÓLO esto: `promote-claim` promueve, `reply`
 * responde, `promote-area-fit` promueve. No había puerta para «este sello
 * quedó atrás, muévelo».
 *
 * ## Qué garantiza
 *
 * 1. **Sólo se mueve el sello.** Se compara el objeto entero antes y después
 *    con `generatedAt` fuera; cualquier otra diferencia aborta. Es una prueba
 *    estructural, más fuerte para esta operación concreta que revalidar un
 *    esquema: no puede colarse un cambio de contenido disfrazado de re-sellado.
 * 2. **La fecha se DERIVA.** Por defecto, la del commit que cambió el
 *    contenido — que es cuando ese contenido llegó a existir. Poner `ahora`
 *    afirmaría que se regeneró hoy, y no se regeneró nada.
 * 3. **Se respeta la granularidad del fichero.** `competencias.json` sella a
 *    medianoche porque su convención es el DÍA; re-sellarlo con hora le
 *    inventaría una precisión que no tiene.
 * 4. **Se revalida** con el validador del fichero cuando hay uno de firma
 *    simple. `area-fit.json` pide un contexto que este CLI no tiene, así que
 *    ahí manda la prueba estructural — dicho, no escondido.
 *
 * Y pide `--motivo`: un re-sellado sin explicación es indistinguible de tapar
 * un desajuste, que es justo lo que `check:stamps` vigila.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { CURATED } from '../.claude/hooks/curated-paths.mjs'
import { validatePromisesSnapshot } from '../src/scraper/promises'
import { validateFindingsSnapshot } from '../src/scraper/pleno-finding'
import { validarCompetencias } from '../src/scraper/competencias'

const DIA_MS = 86_400_000
const DATA = 'public/data'

/**
 * Validadores de firma simple, por fichero. Los que piden contexto NO se
 * inventan aquí: quedan cubiertos por la prueba estructural, y el CLI lo dice
 * en pantalla en vez de dejar creer que revalidó.
 */
const VALIDADORES: Record<string, (raw: string) => unknown> = {
  'promises.json': (raw) => validatePromisesSnapshot(raw),
  'pleno-findings.json': (raw) => validateFindingsSnapshot(raw),
  'competencias.json': (raw) => validarCompetencias(JSON.parse(raw)),
}

/** Un sello escrito a medianoche exacta guarda el DÍA, no el instante. */
export function selloEsDeDia(iso: string): boolean {
  const t = Date.parse(iso)
  return Number.isFinite(t) && t % DIA_MS === 0
}

/**
 * El sello nuevo para un contenido fechado en `fechaContenido`, conservando la
 * granularidad que el fichero ya usaba.
 */
export function selloParaFecha(selloActual: string, fechaContenido: string): string {
  const t = Date.parse(fechaContenido)
  if (!Number.isFinite(t)) throw new Error(`fecha ilegible: ${fechaContenido}`)
  if (selloEsDeDia(selloActual)) {
    return new Date(Math.floor(t / DIA_MS) * DIA_MS).toISOString()
  }
  return new Date(t).toISOString()
}

/**
 * ¿La única diferencia entre los dos objetos es `generatedAt`?
 *
 * Comparación por serialización con la clave fuera. Sirve porque los dos lados
 * salen del MISMO objeto —uno es el otro con un campo cambiado—, así que el
 * orden de claves se conserva y no hay falsos negativos por reordenación.
 */
export function soloCambiaElSello(antes: unknown, despues: unknown): boolean {
  const sinSello = (o: unknown) => {
    const c = { ...(o as Record<string, unknown>) }
    delete c.generatedAt
    return JSON.stringify(c)
  }
  return sinSello(antes) === sinSello(despues)
}

function git(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function main() {
  const argv = process.argv.slice(2)
  const nombre = argv.find((a) => !a.startsWith('--'))
  const arg = (k: string) => {
    const i = argv.indexOf(`--${k}`)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const motivo = arg('motivo')
  const at = arg('at')
  const dryRun = argv.includes('--dry-run')

  if (!nombre || !motivo) {
    process.stderr.write(
      'uso: npm run restamp -- <fichero.json> --motivo "por qué" [--at <iso>] [--dry-run]\n',
    )
    process.exit(2)
  }
  if (!(nombre in (CURATED as Record<string, string>))) {
    process.stderr.write(
      `[restamp] ${nombre} no está en la lista curada. Este CLI existe SÓLO para ` +
        `esos ficheros; para el resto, vuelve a correr su adaptador.\n`,
    )
    process.exit(2)
  }

  const rel = `${DATA}/${nombre}`
  if (!existsSync(resolve(rel))) {
    process.stderr.write(`[restamp] no existe ${rel}\n`)
    process.exit(2)
  }

  const crudo = readFileSync(resolve(rel), 'utf8')
  const antes = JSON.parse(crudo) as Record<string, unknown>

  // Un fichero COMPUESTO no se re-sella a mano, y por dos motivos independientes.
  // Su `generatedAt` no es su fecha: es el sello del base del que desciende, y
  // `cotejarCompose` exige igualdad EXACTA con él —moverlo aquí volvería
  // `check:verified-compose` a `contradice` sin que nada del contenido hubiera
  // cambiado—. Y no arreglaría nada: `check:stamps` juzga estos ficheros por
  // `composedAt`, que sólo escribe quien los compone.
  if (typeof antes.composedAt === 'string') {
    process.stderr.write(
      `[restamp] ${nombre} es un fichero COMPUESTO: su generatedAt es el sello del base\n` +
        `  del que desciende, no su fecha. Moverlo rompería check:verified-compose.\n` +
        `  Lo que fecha su contenido es composedAt, y lo escribe su CLI al componer:\n` +
        `  vuelve a componerlo (npm run verify:pleno-claims, sin --base-only) en vez de sellarlo.\n`,
    )
    process.exit(2)
  }

  const selloActual = typeof antes.generatedAt === 'string' ? antes.generatedAt : null
  if (!selloActual) {
    process.stderr.write(`[restamp] ${nombre} no lleva generatedAt — no hay nada que sellar\n`)
    process.exit(2)
  }

  // La fecha del contenido: el commit que lo cambió por última vez. DERIVADA,
  // no escrita — un `--at` a mano existe para el caso raro, y se anuncia.
  const fechaContenido = at ?? git(['log', '-1', '--format=%aI', '--', rel])
  if (!fechaContenido) {
    process.stderr.write(`[restamp] ${rel} no tiene historial y no se pasó --at\n`)
    process.exit(2)
  }
  const selloNuevo = selloParaFecha(selloActual, fechaContenido)

  if (selloNuevo === selloActual) {
    process.stdout.write(`[restamp] ${nombre} ya sella ${selloActual} — nada que hacer\n`)
    process.exit(0)
  }

  const despues = { ...antes, generatedAt: selloNuevo }
  if (!soloCambiaElSello(antes, despues)) {
    process.stderr.write(
      `[restamp] ABORTA: la escritura cambiaría algo más que el sello. ` +
        `Este CLI sólo mueve la fecha; un cambio de contenido va por el CLI que ` +
        `le corresponde (${(CURATED as Record<string, string>)[nombre]}).\n`,
    )
    process.exit(1)
  }

  const serializado = JSON.stringify(despues, null, 2) + '\n'
  const validador = VALIDADORES[nombre]
  if (validador) {
    validador(serializado)
    process.stdout.write(`[restamp] revalidado con el validador de ${nombre}\n`)
  } else {
    process.stdout.write(
      `[restamp] ${nombre} no tiene validador de firma simple aquí; manda la ` +
        `comprobación estructural (sólo cambia generatedAt)\n`,
    )
  }

  process.stdout.write(
    `[restamp] ${nombre}\n` +
      `          sello:  ${selloActual}  →  ${selloNuevo}\n` +
      `          origen: ${at ? '--at (a mano)' : 'commit que cambió el contenido'} ${fechaContenido}\n` +
      `          motivo: ${motivo}\n`,
  )
  if (dryRun) {
    process.stdout.write('[restamp] DRY RUN — no se ha escrito nada\n')
    process.exit(0)
  }
  writeFileSync(resolve(rel), serializado)
  process.stdout.write(`[restamp] escrito ${rel}\n`)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
