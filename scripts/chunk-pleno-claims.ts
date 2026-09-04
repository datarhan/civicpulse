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
import { gateItemsForPublic } from '../src/scraper/claim-public-gate'
import { classifyClaimProvenancePreparado } from '../src/scraper/claim-provenance'
import { prepararHeno, type HenoPreparado } from '../src/scraper/quote-match'
import { loadSupersededTexts, TRANSCRIPTS_DIR } from './lib/transcript-corpus'

const MONOLITH = resolve('public/data/pleno-claims-verified.json')
const CHUNKS_DIR = resolve('public/data/pleno-claims')
const MANIFEST = resolve(CHUNKS_DIR, 'index.json')

/**
 * Techo de retirada por falta de procedencia, como fracción del corpus.
 *
 * La regla de la puerta es correcta y su modo de fallo es catastrófico: si un
 * fichero de transcripción no está —un checkout a medias, un `superseded/`
 * podado, el sparse-checkout ajeno que ya se llevó `docs/` entero una vez—
 * TODAS las citas de esa sesión pasan a «sin rastro» y el sitio se publicaría
 * sin ellas, en silencio y con la comprobación en verde, porque la comprobación
 * lee lo publicado.
 *
 * Así que se para. 1.582 de las 4.664 declaraciones publicadas viven hoy sólo
 * en una sustituida: perder esa carpeta retiraría un tercio del corpus. El techo
 * está donde separa «unas cuantas frases que el extractor parafraseó» de
 * «faltan ficheros»: hoy son 6 de 6.919, un 0,09 %.
 *
 * Es la regla 1 de DATA_INTEGRITY —toda aserción de enum con su techo de
 * respaldo— aplicada a una puerta que RETIRA en vez de coercer.
 */
export const TECHO_SIN_PROCEDENCIA = 0.02

/**
 * El motivo por el que NO se debe escribir, o `null` si se puede.
 *
 * Función aparte para que la guarda se pueda probar sin montar un corpus en
 * disco: una guarda que sólo existe dentro de un `if` en mitad de una escritura
 * es una guarda que nadie ejercita, y este repositorio ya ha tenido dos que
 * estaban verdes por no ejecutarse nunca.
 */
export function excesoDeRetirada(sinProcedencia: number, total: number): string | null {
  // Un corpus vacío no se juzga por porcentaje: 0/0 no es «todo bien», pero
  // tampoco es esta guarda quien lo dice — de eso ya se ocupa el monolito
  // ausente de más arriba.
  if (total <= 0) return null
  const cuota = sinProcedencia / total
  if (cuota <= TECHO_SIN_PROCEDENCIA) return null
  return (
    `[chunk-claims] ${sinProcedencia} de ${total} declaraciones ` +
    `(${(cuota * 100).toFixed(1)} %) no constan en ninguna transcripción — por encima del ` +
    `techo del ${(TECHO_SIN_PROCEDENCIA * 100).toFixed(0)} %. Eso no es prosa parafraseada, ` +
    `son transcripciones que faltan: comprueba public/data/pleno-transcripts/ y su carpeta ` +
    `superseded/ (npm run check:sparse) ANTES de publicar un corpus recortado.`
  )
}

/**
 * Los ids cuyo literal no consta en ninguna transcripción que tengamos.
 *
 * Mismo emparejador y mismos textos que `check:claim-provenance`, a propósito:
 * dos decisores sobre la misma pregunta es como empiezan a discrepar la puerta
 * y el parte. `sin-transcripcion` NO entra — eso es «no lo hemos mirado».
 */
export function idsSinProcedencia(
  items: readonly { claim?: { id?: string; plenoId?: string; verbatim?: string } }[],
  leerVigente: (plenoId: string) => string | null,
  leerSustituidas: (plenoId: string) => string[],
): Set<string> {
  // Los textos se normalizan UNA vez por sesión, no una por declaración:
  // normalizar es el 100 % del coste del emparejador (6,11 ms por
  // transcripción de 274 KB frente a 0,04 ms de búsqueda, medido), así que
  // hacerlo dentro del bucle costaba 42 s de los 46 que tardaba esta pasada.
  const vigentes = new Map<string, HenoPreparado | null>()
  const sustituidas = new Map<string, HenoPreparado[]>()
  const out = new Set<string>()
  for (const it of items) {
    const c = it.claim
    if (!c?.id || !c.plenoId || !c.verbatim) continue
    if (!vigentes.has(c.plenoId)) {
      const t = leerVigente(c.plenoId)
      vigentes.set(c.plenoId, t === null ? null : prepararHeno(t))
      sustituidas.set(c.plenoId, leerSustituidas(c.plenoId).map(prepararHeno))
    }
    const p = classifyClaimProvenancePreparado({
      verbatim: c.verbatim,
      current: vigentes.get(c.plenoId) ?? null,
      superseded: sustituidas.get(c.plenoId) ?? [],
    })
    if (p === 'sin-rastro') out.add(c.id)
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
  const sinProcedencia = idsSinProcedencia(
    crudos,
    (id) => {
      const p = resolve(TRANSCRIPTS_DIR, `${id}.txt`)
      return existsSync(p) ? readFileSync(p, 'utf8') : null
    },
    (id) => loadSupersededTexts(id),
  )
  // El techo antes de escribir nada: una retirada masiva es siempre un fichero
  // que falta, nunca un corpus que de pronto se inventó.
  const exceso = excesoDeRetirada(sinProcedencia.size, crudos.length)
  if (exceso !== null) throw new Error(exceso)
  if (sinProcedencia.size > 0) {
    console.warn(
      `[chunk-claims] ${sinProcedencia.size} declaración(es) retenida(s): su literal no consta ` +
        `en ninguna transcripción que tengamos. No se publican.`,
    )
  }
  const items = gateItemsForPublic(crudos, { sinProcedencia })
  // Lo que la puerta se lleva, contado por tipo antes de perderlo de vista. Un
  // tipo retenido entero desaparecería de la tabla de cobertura y el lector
  // concluiría que no lo extraemos: la ausencia hay que publicarla, no omitirla.
  const servidos = new Set(items.map((it) => it.claim?.id))
  const retenidas: Record<string, number> = {}
  for (const it of crudos) {
    if (servidos.has(it.claim?.id)) continue
    const t = it.claim?.type
    if (typeof t === 'string') retenidas[t] = (retenidas[t] ?? 0) + 1
  }
  const grouped = groupItemsByPleno(items)
  const generatedAt = new Date().toISOString()
  const { manifest, chunks } = buildManifest(grouped, generatedAt, retenidas, sinProcedencia.size)

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
