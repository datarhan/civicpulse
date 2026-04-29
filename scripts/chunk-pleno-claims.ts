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

const MONOLITH = resolve('public/data/pleno-claims-verified.json')
const CHUNKS_DIR = resolve('public/data/pleno-claims')
const MANIFEST = resolve(CHUNKS_DIR, 'index.json')

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
  const items = monolith.items ?? []
  const grouped = groupItemsByPleno(items)
  const generatedAt = new Date().toISOString()
  const { manifest, chunks } = buildManifest(grouped, generatedAt)

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
