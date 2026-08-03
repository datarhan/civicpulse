#!/usr/bin/env tsx
/**
 * check:json — every file under public/data must be parseable JSON, and no
 * tracked file may contain conflict markers.
 *
 * This is the most basic invariant in the repo and nothing was checking it.
 * `pleno-votes-suggestions.json` sat in `main` for a day containing literal
 * `<<<<<<< Updated upstream` markers from an unresolved `git stash pop`,
 * committed in ffab006. It was invalid JSON, every reader of it would throw,
 * and no test, no scraper and no check noticed — the file is only read by
 * curator tooling, so nothing exercised it.
 *
 * The wider point: the elaborate checks in this repo all validate SEMANTICS —
 * do the ids resolve, do the quotes trace, has the vocabulary drifted. Not one
 * of them asked whether the bytes are a document. A conflict marker in a
 * snapshot the SPA loads would have broken the site rather than one CLI.
 *
 * Runs in milliseconds, needs no network and no keys, so it goes in every
 * pipeline.
 *
 *   npm run check:json
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { CONFLICT_MARKERS_SOURCE, inspectJsonText } from '../src/scraper/json-integrity'

const ROOT = resolve('public/data')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (name.endsWith('.json')) out.push(p)
  }
  return out
}

function main() {
  const files = walk(ROOT)
  const broken: { path: string; reason: string }[] = []

  for (const f of files) {
    const verdict = inspectJsonText(readFileSync(f, 'utf8'))
    if (verdict.ok === false) broken.push({ path: f, reason: verdict.reason })
  }

  // Conflict markers anywhere in tracked source, not just data. Cheap, and the
  // same accident reaches code just as easily.
  // execFileSync with an argument array: no shell, so nothing here can be
  // reinterpreted as a command. `git grep` exits 1 when it matches nothing,
  // which is the normal case, so the throw is expected rather than an error.
  let markedSource: string[] = []
  try {
    markedSource = execFileSync(
      'git',
      [
        'grep',
        '-l',
        '-E',
        CONFLICT_MARKERS_SOURCE,
        '--',
        '*.ts',
        '*.js',
        '*.jsx',
        '*.md',
        '*.sh',
        '*.yml',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
      .split('\n')
      .filter(Boolean)
  } catch {
    /* exit 1 = no matches (the healthy case), or not a git checkout */
  }

  const rel = (p: string) => p.replace(`${process.cwd()}/`, '')
  console.log(`[check-json] ${files.length} JSON file(s) under public/data`)
  for (const b of broken) console.log(`  ✗ ${rel(b.path)} — ${b.reason}`)
  for (const s of markedSource) console.log(`  ✗ ${s} — contains merge-conflict markers`)

  const total = broken.length + markedSource.length
  if (total === 0) {
    console.log('  ✓ all parse, no conflict markers')
    return
  }
  console.log(`\n[check-json] ${total} broken file(s)`)
  process.exitCode = 1
}

main()
