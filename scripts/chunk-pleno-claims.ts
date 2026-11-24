#!/usr/bin/env tsx
/**
 * Migrate the monolithic pleno-claims-verified.json into per-pleno
 * chunks under public/data/pleno-claims/<plenoId>.json plus a small
 * manifest at public/data/pleno-claims/index.json.
 *
 *   npm run chunk-pleno-claims        # write chunks + manifest
 *   npm run chunk-pleno-claims -- --dry-run    # report only, no writes
 *
 * Idempotent — re-run any time the monolith is regenerated. The
 * verify-pleno-claims CLI calls this at the end of its run, so
 * production usage rarely needs the standalone invocation.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  buildManifest,
  groupItemsByPleno,
  type VerifiedSnapshot,
} from '../src/scraper/pleno-claims-chunks'
import { gateItemsForPublic, repartirRetenidas } from '../src/scraper/claim-public-gate'
import { motivoDeRetirada, type MotivoDeRetirada } from '../src/scraper/declaracion-retirada'
import {
  MOTIVOS_LITERAL_NO_SERVIBLE,
  type MotivoLiteralNoServible,
} from '../src/scraper/literal-no-servible'
import { procedenciaDelCorpus } from './lib/procedencia-del-corpus'
import { sesionesConActaEnDisco } from './lib/sesiones-con-acta'

// Viven en el decisor compartido; se re-exportan para las pruebas de siempre.
export {
  excesoDeLiteralNoServible,
  excesoDeRetirada,
  idsSinProcedencia,
  literalesNoServibles,
  TECHO_LITERAL_NO_SERVIBLE,
  TECHO_SIN_PROCEDENCIA,
} from './lib/procedencia-del-corpus'

const MONOLITH = resolve('public/data/pleno-claims-verified.json')
const CHUNKS_DIR = resolve('public/data/pleno-claims')
const MANIFEST = resolve(CHUNKS_DIR, 'index.json')

/**
 * Las que retiró una persona tras escuchar la sesión, por motivo.
 *
 * Las mismas que la puerta oculta por `motivoDeRetirada`, contadas con esa
 * misma función: dos decisores sobre la misma pregunta es como empiezan a
 * discrepar la puerta y el parte. Una que además no conste en ninguna
 * transcripción se cuenta allí y no aquí, para que las filas de la tarjeta de
 * /plenos sigan siendo una partición de lo extraído.
 */
export function contarRetiradas(
  items: readonly { claim?: { id?: string }; verification?: unknown }[],
  sinProcedencia: ReadonlySet<string>,
): Partial<Record<MotivoDeRetirada, number>> {
  const out: Partial<Record<MotivoDeRetirada, number>> = {}
  for (const it of items) {
    const id = it?.claim?.id
    if (!id || sinProcedencia.has(id)) continue
    const motivo = motivoDeRetirada(it as Parameters<typeof motivoDeRetirada>[0])
    if (motivo !== null) out[motivo] = (out[motivo] ?? 0) + 1
  }
  return out
}

interface Args {
  dryRun: boolean
}

function parseArgs(argv: string[]): Args {
  const out: Args = { dryRun: false }
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true
    else {
      process.stderr.write(`[chunk-claims] unknown flag: ${a}\n`)
      process.exit(2)
    }
  }
  return out
}

function atomicWrite(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, content, 'utf8')
  renameSync(tmp, path)
}

export function rewriteChunksFromMonolith(opts: { dryRun?: boolean } = {}): {
  written: number
  removed: number
  manifestBytes: number
} {
  if (!existsSync(MONOLITH)) {
    throw new Error(`[chunk-claims] ${MONOLITH} missing — run npm run verify:pleno-claims first.`)
  }
  const monolith = JSON.parse(readFileSync(MONOLITH, 'utf8')) as VerifiedSnapshot
  // Editorial gate: drop `hidden` items (opinativa / sin-datos accusations)
  // and stamp each survivor with its visibility BEFORE chunking, so the
  // deployed chunks never contain ungated accusation verbatim.
  const crudos = monolith.items ?? []
  // Las dos preguntas de procedencia —¿consta el literal?, ¿es lo que se
  // dijo?— con sus techos, en el decisor que comparten todos los que preguntan
  // a la puerta (scripts/lib/procedencia-del-corpus.ts).
  const { sinProcedencia, literalNoServible, procedenciaDelLiteral, literales } =
    procedenciaDelCorpus(crudos)
  if (sinProcedencia.size > 0) {
    console.warn(
      `[chunk-claims] ${sinProcedencia.size} declaración(es) retenida(s): su literal no consta ` +
        `en ninguna transcripción que tengamos. No se publican.`,
    )
  }
  if (literalNoServible.size > 0) {
    const nj = Object.entries(literales.noJuzgables)
      .map(([r, n]) => `${n} ${r}`)
      .join(', ')
    console.warn(
      `[chunk-claims] ${literalNoServible.size} de ${literales.evaluadas} declaración(es) ` +
        `retenida(s): su literal consta, pero traducido de lo que la vigente recoge o inventado. ` +
        `No juzgables: ${nj}.`,
    )
    const porSesion = new Map<string, number>()
    for (const it of crudos) {
      const c = it.claim
      if (c?.id && literalNoServible.has(c.id))
        porSesion.set(c.plenoId, (porSesion.get(c.plenoId) ?? 0) + 1)
    }
    console.warn(
      `[chunk-claims]   por sesión: ${[...porSesion].map(([p, n]) => `${p} ${n}`).join(' · ')}`,
    )
  }
  // Una retirada cuyo literal tampoco es servible se cuenta como retirada: la
  // puerta mira el literal sólo en lo que serviría.
  const retiradas = contarRetiradas(crudos, sinProcedencia)
  const nRetiradas = Object.values(retiradas).reduce((s, n) => s + (n ?? 0), 0)
  if (nRetiradas > 0) {
    console.warn(
      `[chunk-claims] ${nRetiradas} declaración(es) retirada(s) por una persona tras escuchar ` +
        `la sesión: su literal no es lo que se dijo. No se publican.`,
    )
  }
  const items = gateItemsForPublic(crudos, {
    sinProcedencia,
    literalNoServible,
    procedenciaDelLiteral,
  })
  // Lo que la puerta se lleva, contado por tipo y por motivo antes de perderlo
  // de vista. Un tipo retenido entero desaparecería de la tabla de cobertura y
  // el lector concluiría que no lo extraemos: la ausencia hay que publicarla,
  // no omitirla. Y el motivo lo da la misma función que decide ocultar.
  const { porTipo: retenidas, porMotivo: retenidasPorMotivo } = repartirRetenidas(crudos, {
    sinProcedencia,
    literalNoServible,
  })
  // Las dos cuentas de lo retenido y la de lo servido tienen que cuadrar: si la
  // puerta y el reparto discreparan, la página publicaría motivos de otras filas.
  const nRetenidas = Object.values(retenidasPorMotivo).reduce((s, n) => s + n, 0)
  if (nRetenidas !== crudos.length - items.length) {
    throw new Error(
      `[chunk-claims] el reparto por motivo cuenta ${nRetenidas} retenidas y la puerta ` +
        `retiene ${crudos.length - items.length}: no cuadran, no se escribe nada.`,
    )
  }
  const grouped = groupItemsByPleno(items)
  const generatedAt = new Date().toISOString()
  const { manifest, chunks } = buildManifest(
    grouped,
    generatedAt,
    retenidas,
    sinProcedencia.size,
    retiradas,
    retenidasPorMotivo,
    sesionesConActaEnDisco(),
    {
      // Lo que la puerta retiene POR este motivo, no lo que la regla marcó: una
      // acusación ya retenida por otro motivo se cuenta allí.
      porMotivo: Object.fromEntries(
        MOTIVOS_LITERAL_NO_SERVIBLE.map((m) => [m, retenidasPorMotivo[m]]),
      ) as Record<MotivoLiteralNoServible, number>,
      evaluadas: literales.evaluadas,
      sinVigente: literales.sinVigente,
      sinJuzgar: literales.noJuzgables,
    },
  )

  // Cada servida lleva su marca de procedencia, y las marcas suman lo servido:
  // si no, la página contaría unas filas y pintaría otras.
  const marcas = manifest.totals.procedenciaDelLiteral
  const nMarcas = Object.values(marcas ?? {}).reduce((s, n) => s + (n ?? 0), 0)
  if (manifest.totals.items > 0 && (!marcas || nMarcas !== manifest.totals.items)) {
    throw new Error(
      `[chunk-claims] ${nMarcas} marcas de procedencia para ${manifest.totals.items} ` +
        `declaraciones servidas: no cuadran, no se escribe nada.`,
    )
  }
  // Sin nada servido no hay bloque de marcas (pleno-claims-chunks.ts): se dice
  // «ninguna», no se lee un objeto que no existe.
  console.warn(
    `[chunk-claims] procedencia del literal: ` +
      Object.entries(marcas ?? {})
        .map(([k, n]) => `${n} ${k}`)
        .join(' · '),
  )

  // Track the chunks we're about to write so we can prune stale ones.
  const expected = new Set<string>()
  for (const plenoId of chunks.keys()) expected.add(`${plenoId}.json`)

  let written = 0
  if (!opts.dryRun) {
    mkdirSync(CHUNKS_DIR, { recursive: true })
    for (const [plenoId, chunk] of chunks) {
      const path = resolve(CHUNKS_DIR, `${plenoId}.json`)
      atomicWrite(path, JSON.stringify(chunk, null, 2) + '\n')
      written += 1
    }
    const manifestJson = JSON.stringify(manifest, null, 2) + '\n'
    atomicWrite(MANIFEST, manifestJson)
  } else {
    written = chunks.size
  }

  // Prune chunk files for plenos that no longer have any items
  // (e.g. an extract was rolled back). Always keep `index.json` itself.
  let removed = 0
  if (existsSync(CHUNKS_DIR)) {
    for (const f of readdirSync(CHUNKS_DIR)) {
      if (f === 'index.json') continue
      if (!f.endsWith('.json')) continue
      if (!expected.has(f)) {
        if (!opts.dryRun) unlinkSync(resolve(CHUNKS_DIR, f))
        removed += 1
      }
    }
  }

  return {
    written,
    removed,
    manifestBytes: Buffer.byteLength(JSON.stringify(manifest), 'utf8'),
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  const start = Date.now()
  const result = rewriteChunksFromMonolith({ dryRun: args.dryRun })
  const ms = Date.now() - start
  if (args.dryRun) {
    process.stdout.write(
      `[chunk-claims] DRY RUN — would write ${result.written} chunk(s), ` +
        `prune ${result.removed} stale, manifest ~${result.manifestBytes} bytes (${ms}ms)\n`,
    )
  } else {
    process.stdout.write(
      `[chunk-claims] wrote ${result.written} chunk(s), pruned ${result.removed} stale, ` +
        `manifest=${result.manifestBytes} bytes (${ms}ms)\n`,
    )
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main()
  } catch (err) {
    process.stderr.write(
      `[chunk-claims] fatal: ${err instanceof Error ? err.message : String(err)}\n`,
    )
    process.exit(1)
  }
}
