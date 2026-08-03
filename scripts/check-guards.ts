#!/usr/bin/env tsx
/**
 * Are the guards guarding?
 *
 *   npm run check:guards            # wiring audit — free, safe, no data touched
 *   npm run check:guards -- --inject   # + fault injection: break it, watch it scream
 *   npm run check:guards -- --json
 *
 * ## Why
 *
 * On 2026-08-02 every guard in this repo was audited by hand: instead of
 * checking that they pass, what each one watches was broken ON PURPOSE to see
 * whether it fires. It found `pleno-votes-suggestions.json` sitting on `main`
 * with literal `<<<<<<< Updated upstream` markers from an unresolved
 * `git stash pop` — invalid JSON, nine hours old, and not one of ten checks had
 * noticed, because all ten validated SEMANTICS and none asked whether the bytes
 * were a document. That audit produced `check:json`.
 *
 * It has never run again, because it lived in a commit message.
 *
 * ## The three failure modes this catches and unit tests cannot
 *
 *   1. NOT WIRED — the guard is correct and nothing invokes it. `check:automation`
 *      was hooked to nothing at all; a measurement expiring downgraded a class
 *      to curator-only with no other signal.
 *   2. NO TEETH — the guard fires and the caller ignores it. `check:corpus`
 *      needed `PIPESTATUS[0]` because a pipe to `tail` was eating its exit code;
 *      the nightly's `&&`/`|| true` pair hid failures for 25 days.
 *   3. PARTIAL COVERAGE — the guard runs, watches a fraction, and reports its
 *      silence as health. `check:drift` watched 2 figures from one of two
 *      published pieces and said "2 watched · 0 divergent".
 *
 * Mode 3 is not mechanically checkable from here; each guard has to report its
 * own coverage. This script checks 1 and 2, and lists which guards report
 * coverage at all.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

interface GuardRow {
  name: string
  wiredIn: string[]
  /** null = not exercised this run */
  firesOnFault: boolean | null
  injection?: string
  note?: string
}

const ROOT = resolve('.')
const out = (s = '') => process.stdout.write(`${s}\n`)

/** Everywhere a guard could legitimately be invoked from. */
function callSites(): Map<string, string> {
  const files = new Map<string, string>()
  const add = (p: string) => {
    if (existsSync(p)) files.set(p, readFileSync(p, 'utf8'))
  }
  for (const f of readdirSync(resolve(ROOT, 'scripts'))) {
    if (f.endsWith('.sh')) add(resolve(ROOT, 'scripts', f))
  }
  const wf = resolve(ROOT, '.github/workflows')
  if (existsSync(wf)) for (const f of readdirSync(wf)) add(resolve(wf, f))
  const husky = resolve(ROOT, '.husky')
  if (existsSync(husky)) {
    for (const f of readdirSync(husky)) {
      if (!f.startsWith('_')) add(resolve(husky, f))
    }
  }
  return files
}

/**
 * Fault injections. Each names a real file, a way to corrupt it, and the guard
 * that must notice. Kept deliberately few: one per failure CLASS, each one a
 * shape that actually reached `main` at some point.
 */
const INJECTIONS: Array<{
  guard: string
  file: string
  describe: string
  corrupt: (s: string) => string
}> = [
  {
    guard: 'check:json',
    file: 'public/data/promise-suggestions.json',
    describe: 'a literal git merge-conflict marker',
    // The exact shape that sat on main for nine hours in ffab006.
    corrupt: (s) => `<<<<<<< Updated upstream\n${s}\n=======\n>>>>>>> Stashed changes\n`,
  },
  {
    guard: 'check:citations',
    file: 'public/data/journalist-reports.json',
    describe: 'a section citing a sourceId that does not exist',
    corrupt: (s) => {
      const d = JSON.parse(s)
      const r = d.items.find((x: { sections: Array<{ payload?: { sourceIds?: string[] } }> }) =>
        x.sections.some((sec) => Array.isArray(sec.payload?.sourceIds)),
      )
      const sec = r.sections.find((x: { payload?: { sourceIds?: string[] } }) =>
        Array.isArray(x.payload?.sourceIds),
      )
      sec.payload.sourceIds.push('src-injected-nonexistent')
      return JSON.stringify(d, null, 2) + '\n'
    },
  },
  {
    guard: 'check:relations',
    file: 'public/data/pleno-findings.json',
    describe: 'a finding pointing at a claim id that does not exist',
    corrupt: (s) => {
      const d = JSON.parse(s)
      const f = d.items.find((x: { claimIds?: string[] }) => Array.isArray(x.claimIds))
      if (!f) throw new Error('no finding with claimIds to corrupt')
      f.claimIds.push('c-injected-nonexistent')
      return JSON.stringify(d, null, 2) + '\n'
    },
  },
]

function gitIsClean(file: string): boolean {
  const r = spawnSync('git', ['diff', '--quiet', '--', file], { cwd: ROOT })
  return r.status === 0
}

function gitRestore(file: string): void {
  execFileSync('git', ['checkout', '--', file], { cwd: ROOT })
}

/** Run a guard and report only whether it exited non-zero. */
function guardFails(script: string): boolean {
  const r = spawnSync('npm', ['run', '--silent', script.replace(/^npm run /, '')], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
  })
  return r.status !== 0
}

function main(): void {
  const argv = process.argv.slice(2)
  const inject = argv.includes('--inject')
  const asJson = argv.includes('--json')

  const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))
  const guards = Object.keys(pkg.scripts).filter((k) => k.startsWith('check:'))
  const sites = callSites()

  const rows: GuardRow[] = guards.map((g) => {
    const wiredIn: string[] = []
    for (const [path, body] of sites) {
      // `npm run check:x` — and not as a substring of a longer name.
      if (new RegExp(`\\b${g.replace(':', '\\:')}\\b(?![:\\w-])`).test(body)) {
        wiredIn.push(path.replace(`${ROOT}/`, ''))
      }
    }
    return { name: g, wiredIn, firesOnFault: null }
  })

  if (inject) {
    for (const inj of INJECTIONS) {
      const row = rows.find((r) => r.name === inj.guard)
      if (!row) continue
      row.injection = inj.describe
      const path = resolve(ROOT, inj.file)
      if (!existsSync(path)) {
        row.note = `${inj.file} missing — not exercised`
        continue
      }
      if (!gitIsClean(inj.file)) {
        row.note = `${inj.file} has uncommitted changes — refusing to inject`
        continue
      }
      const original = readFileSync(path, 'utf8')
      try {
        writeFileSync(path, inj.corrupt(original), 'utf8')
        row.firesOnFault = guardFails(inj.guard)
      } catch (e) {
        row.note = `injection failed: ${(e as Error).message}`
      } finally {
        // Restore from git, then PROVE it was restored. A fault-injection
        // harness that leaves the fault behind is worse than no harness.
        gitRestore(inj.file)
        if (!gitIsClean(inj.file)) {
          process.stderr.write(
            `\n[check:guards] FATAL: could not restore ${inj.file}. Fix before committing.\n`,
          )
          process.exit(2)
        }
      }
    }
  }

  if (asJson) {
    out(JSON.stringify({ guards: rows, injected: inject }, null, 2))
    return
  }

  const orphans = rows.filter((r) => r.wiredIn.length === 0)
  const w = Math.max(...rows.map((r) => r.name.length))
  out('[check:guards] wiring — where is each guard actually invoked?\n')
  for (const r of rows) {
    const where = r.wiredIn.length ? r.wiredIn.join(', ') : '⚠ NOT INVOKED ANYWHERE'
    out(`  ${r.name.padEnd(w)}  ${where}`)
  }

  if (inject) {
    out('\n[check:guards] teeth — does it exit non-zero when its fault is present?\n')
    for (const r of rows.filter((x) => x.injection)) {
      const verdict =
        r.firesOnFault === null
          ? `— ${r.note ?? 'not exercised'}`
          : r.firesOnFault
            ? 'FIRES'
            : '⚠ SILENT'
      out(`  ${r.name.padEnd(w)}  ${verdict}`)
      out(`  ${' '.repeat(w)}  injected: ${r.injection}`)
    }
    const notExercised = rows.filter((x) => !x.injection).map((x) => x.name)
    if (notExercised.length) {
      out(`\n  ${notExercised.length} guard(s) have NO injection defined and were not exercised:`)
      out(`    ${notExercised.join(', ')}`)
      out('  Add one to INJECTIONS in scripts/check-guards.ts rather than assuming they work.')
    }
  } else {
    out('\n  (wiring only — run with --inject to also break things and watch them scream)')
  }

  const silent = rows.filter((r) => r.firesOnFault === false)
  out()
  out(
    `${rows.length} guard(s) · ${orphans.length} not invoked anywhere · ` +
      `${inject ? `${rows.filter((r) => r.firesOnFault === true).length} proven to fire` : 'teeth not tested'}`,
  )

  if (orphans.length || silent.length) {
    if (orphans.length) out(`\nNOT INVOKED: ${orphans.map((r) => r.name).join(', ')}`)
    if (silent.length) out(`SILENT ON ITS OWN FAULT: ${silent.map((r) => r.name).join(', ')}`)
    process.exit(1)
  }
}

main()
