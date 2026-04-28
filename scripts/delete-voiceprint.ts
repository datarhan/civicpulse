#!/usr/bin/env tsx
/**
 * Delete a councillor's voiceprint and remove their entry from the
 * voiceprint index. Used by the dashboard's "Clear voiceprint"
 * affordance and by `npm run enroll-voice -- … --force` (re-enroll).
 *
 *   npm run delete-voiceprint -- --slug <officials-slug>
 *
 * Idempotent — exits 0 even if the voiceprint or index entry was
 * already absent. The cached source audio in .voiceprints/audio/ is
 * NOT removed (preserved for any future re-enrollment + audit).
 */
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const VOICEPRINTS_DIR = resolve('.voiceprints')
const INDEX_PATH = resolve(VOICEPRINTS_DIR, 'index.json')

interface CliArgs {
  slug: string
}

function parseArgs(argv: string[]): CliArgs {
  const out: Partial<CliArgs> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--slug') out.slug = argv[++i]
    else {
      process.stderr.write(`[delete-voiceprint] unknown flag: ${a}\n`)
      process.exit(2)
    }
  }
  if (!out.slug) {
    process.stderr.write('usage: delete-voiceprint.ts --slug <slug>\n')
    process.exit(2)
  }
  if (!/^[a-z0-9-]{3,80}$/.test(out.slug)) {
    process.stderr.write(`[delete-voiceprint] invalid slug: ${out.slug}\n`)
    process.exit(2)
  }
  return out as CliArgs
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  const vectorPath = resolve(VOICEPRINTS_DIR, `${opts.slug}.f32`)
  let removedVector = false
  if (existsSync(vectorPath)) {
    rmSync(vectorPath)
    removedVector = true
  }
  let removedEntry = false
  if (existsSync(INDEX_PATH)) {
    const idx = JSON.parse(readFileSync(INDEX_PATH, 'utf8')) as {
      generatedAt: string
      entries: Array<{ slug: string }>
    }
    const before = idx.entries.length
    idx.entries = idx.entries.filter((e) => e.slug !== opts.slug)
    removedEntry = idx.entries.length < before
    if (removedEntry) {
      idx.generatedAt = new Date().toISOString()
      const tmp = `${INDEX_PATH}.tmp`
      writeFileSync(tmp, JSON.stringify(idx, null, 2) + '\n')
      renameSync(tmp, INDEX_PATH)
    }
  }
  process.stdout.write(
    JSON.stringify({
      slug: opts.slug,
      removedVector,
      removedEntry,
    }) + '\n',
  )
}

main()
