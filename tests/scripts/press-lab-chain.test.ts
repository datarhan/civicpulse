/**
 * scripts/press-lab-pipeline.sh — dependency gating + commit safety net.
 *
 * On 2026-08-09 `extract:press-claims` exited 1 against a dead LLM backend and
 * the chain ran `verify:press-claims` anyway. Verify derived
 * press-claims-verified.json from the emptied suggestions file, the
 * unconditional `git add` staged it, and c6a6e23 deleted a live published claim
 * while the log read "done · 0 verified claim(s) pushed".
 *
 * This drives the REAL shipped script — no logic is re-implemented here, which
 * is the trap DATA_INTEGRITY.md rule 1 is about. Only the seven `npx tsx …`
 * steps are stubbed, via a fake `tsx` in the sandbox's own node_modules/.bin
 * (npx prefers the nearest one). The stub WRITES its snapshot even when it
 * exits non-zero, so the commit-side layer is tested against a genuinely
 * misbehaving script rather than a merely absent one.
 */
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

const REPO = resolve(__dirname, '../..')
const PIPELINE = join(REPO, 'scripts/press-lab-pipeline.sh')

/** Every snapshot the pipeline may publish, and which step owns it. */
const OWNS: Record<string, string[]> = {
  'scrape-factcheck': ['factcheck.json'],
  'extract-press-claims': ['press-claims-suggestions.json'],
  'verify-press-claims': ['press-claims-verified.json'],
  'summarize-press': ['press-summaries.json'],
  'compute-press-analytics': [
    'press-trust.json',
    'press-triangulation.json',
    'press-coverage-gaps.json',
  ],
  'auto-curate-press': ['press-findings.json'],
  'audit-press-links': ['press-link-rot.json'],
}
const ALL_SNAPSHOTS = Object.values(OWNS).flat()

const sandboxes: string[] = []

function makeSandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), 'press-lab-chain-'))
  sandboxes.push(dir)
  mkdirSync(join(dir, 'scripts'), { recursive: true })
  mkdirSync(join(dir, 'public/data'), { recursive: true })
  mkdirSync(join(dir, 'node_modules/.bin'), { recursive: true })
  mkdirSync(join(dir, 'nohooks'), { recursive: true })

  copyFileSync(PIPELINE, join(dir, 'scripts/press-lab-pipeline.sh'))

  // Committed baseline: the "already published" corpus the run must not lose.
  for (const f of ALL_SNAPSHOTS) {
    writeFileSync(join(dir, 'public/data', f), '{"items":[{"id":"baseline"}]}\n')
  }

  const tsxStub = `#!/bin/sh
# Stand-in for one pipeline step. Writes its owned snapshot ALWAYS — including
# when it fails — so the commit layer is exercised against a misbehaving script.
name=$(basename "$1" .ts)
case "$name" in
  scrape-factcheck)        outs="factcheck.json" ;;
  extract-press-claims)    outs="press-claims-suggestions.json" ;;
  verify-press-claims)     outs="press-claims-verified.json" ;;
  summarize-press)         outs="press-summaries.json" ;;
  compute-press-analytics) outs="press-trust.json press-triangulation.json press-coverage-gaps.json" ;;
  auto-curate-press)       outs="press-findings.json" ;;
  audit-press-links)       outs="press-link-rot.json" ;;
  *) echo "[stub] unknown step $name" >&2; exit 99 ;;
esac
for f in $outs; do printf '{"items":[{"id":"run-%s"}]}\\n' "$name" > "public/data/$f"; done
case " \${STUB_FAIL:-} " in *" $name "*) echo "[stub:$name] FAILING"; exit 1 ;; esac
echo "[stub:$name] ok"
exit 0
`
  const tsxPath = join(dir, 'node_modules/.bin/tsx')
  writeFileSync(tsxPath, tsxStub)
  chmodSync(tsxPath, 0o755)

  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
  git('init', '-q')
  git('config', 'user.email', 'test@example.invalid')
  git('config', 'user.name', 'press-lab test')
  // The real repo points core.hooksPath at .husky/_; a sandbox must not inherit
  // or invent hooks — this test is about the script, not the commit hooks.
  git('config', 'core.hooksPath', join(dir, 'nohooks'))
  git('add', '-A')
  git('commit', '-qm', 'baseline')
  return dir
}

interface RunResult {
  status: number
  log: string
  /** Paths in the commit the run produced, or [] when it made none. */
  committed: string[]
  subject: string
  body: string
}

function runPipeline(dir: string, failing: string[]): RunResult {
  const before = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim()
  let status = 0
  let log = ''
  try {
    log = execFileSync('/bin/bash', [join(dir, 'scripts/press-lab-pipeline.sh')], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PRESS_LAB_NO_REMOTE: '1',
        STUB_FAIL: failing.join(' '),
        // A genuinely dead backend: the probe must not reach the user's Max plan.
        CLAUDE_CODE_BIN: '/nonexistent-disabled',
        LLM_TIMEOUT: '120',
        HOME: dir,
      },
    })
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string }
    status = e.status ?? -1
    log = (e.stdout ?? '') + (e.stderr ?? '')
  }
  const after = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim()
  if (after === before) return { status, log, committed: [], subject: '', body: '' }
  const committed = execFileSync('git', ['show', '--name-only', '--format=', 'HEAD'], {
    cwd: dir,
    encoding: 'utf8',
  })
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  const subject = execFileSync('git', ['log', '-1', '--format=%s'], {
    cwd: dir,
    encoding: 'utf8',
  }).trim()
  const body = execFileSync('git', ['log', '-1', '--format=%b'], { cwd: dir, encoding: 'utf8' })
  return { status, log, committed, subject, body }
}

afterAll(() => {
  for (const d of sandboxes) {
    try {
      execFileSync('rm', ['-rf', d])
    } catch {
      /* best effort */
    }
  }
})

describe('press-lab-pipeline.sh · dependency gating', () => {
  it('runs the whole chain and publishes every snapshot when nothing fails', () => {
    const r = runPipeline(makeSandbox(), [])
    // Assert the run EVALUATED something: seven steps actually executed.
    for (const step of Object.keys(OWNS)) expect(r.log, step).toContain(`[stub:${step}] ok`)
    expect(r.log).not.toContain('⏭')
    expect(r.log).toContain('7 ok · 0 fallidos · 0 omitidos')
    expect(r.committed.sort()).toEqual(ALL_SNAPSHOTS.map((f) => `public/data/${f}`).sort())
    expect(r.subject).toMatch(/press-lab refresh · 1 verified claim\(s\)/)
    expect(r.status).toBe(0)
  }, 60_000)

  it('skips verify and both of its consumers when extract fails (the c6a6e23 reproducer)', () => {
    const r = runPipeline(makeSandbox(), ['extract-press-claims'])

    // ⏭ is a THIRD state — not ✓ and not ✗.
    expect(r.log).toContain('⏭ verify:press-claims — omitido: extract:press-claims falló')
    expect(r.log).toContain('⏭ compute:press-analytics — omitido: verify:press-claims omitido')
    expect(r.log).toContain('⏭ auto-curate-press — omitido: verify:press-claims omitido')
    expect(r.log).toContain('3 ok · 1 fallidos · 3 omitidos')

    // The skipped consumers never ran at all.
    expect(r.log).not.toContain('[stub:verify-press-claims]')
    expect(r.log).not.toContain('[stub:compute-press-analytics]')
    expect(r.log).not.toContain('[stub:auto-curate-press]')

    // …and the genuinely independent steps did.
    for (const step of ['scrape-factcheck', 'summarize-press', 'audit-press-links']) {
      expect(r.log, step).toContain(`[stub:${step}] ok`)
    }
  }, 60_000)

  it('withholds the outputs of failed and skipped steps from the commit', () => {
    const r = runPipeline(makeSandbox(), ['extract-press-claims'])
    // extract FAILED but still wrote its file — the safety net must not stage it.
    expect(r.committed).not.toContain('public/data/press-claims-suggestions.json')
    expect(r.committed).not.toContain('public/data/press-claims-verified.json')
    expect(r.committed).not.toContain('public/data/press-trust.json')
    expect(r.committed).not.toContain('public/data/press-findings.json')
    // The successful steps' outputs still publish.
    expect(r.committed.sort()).toEqual([
      'public/data/factcheck.json',
      'public/data/press-link-rot.json',
      'public/data/press-summaries.json',
    ])
    expect(r.log).toMatch(/NO se publica \(paso fallido u omitido\):/)
  }, 60_000)

  it('never states a claim count as a result when the run was incomplete', () => {
    const r = runPipeline(makeSandbox(), ['extract-press-claims'])
    expect(r.subject).toContain('ejecución INCOMPLETA')
    expect(r.subject).not.toMatch(/\d+ verified claim\(s\)/)
    expect(r.body).toContain('omitidos:')
    expect(r.body).toContain('verify:press-claims')
    // The final line must not sign off with a measurement either.
    expect(r.log).toMatch(/done · ejecución INCOMPLETA/)
    expect(r.log).not.toMatch(/done · \d+ verified claim\(s\) pushed/)
    // An incomplete run must surface as a non-zero exit to the cron log.
    expect(r.status).toBe(1)
  }, 60_000)

  it('propagates a skip from a failed verify to analytics and auto-curate', () => {
    const r = runPipeline(makeSandbox(), ['verify-press-claims'])
    expect(r.log).toContain('[stub:extract-press-claims] ok')
    expect(r.log).toContain('⏭ compute:press-analytics — omitido: verify:press-claims falló')
    expect(r.log).toContain('⏭ auto-curate-press — omitido: verify:press-claims falló')
    expect(r.log).toContain('4 ok · 1 fallidos · 2 omitidos')
    // extract succeeded here, so ITS output publishes; verify's does not.
    expect(r.committed).toContain('public/data/press-claims-suggestions.json')
    expect(r.committed).not.toContain('public/data/press-claims-verified.json')
    expect(r.committed).not.toContain('public/data/press-coverage-gaps.json')
  }, 60_000)

  it('never pushes under PRESS_LAB_NO_REMOTE and never touches the network', () => {
    const r = runPipeline(makeSandbox(), [])
    expect(r.log).toContain('se omite el git pull inicial')
    expect(r.log).toContain('ensayo local: no se hace push')
  }, 60_000)
})

describe('press-lab-pipeline.sh · the dependency map is the one in the script', () => {
  // The map above is a hand-kept copy of a fact that lives in the shell script.
  // Assert it against the script's own outputs_of(), so adding a snapshot there
  // without adding it here cannot leave this suite silently under-measuring.
  it('outputs_of() covers exactly the steps and snapshots this test asserts', () => {
    const src = readFileSync(PIPELINE, 'utf8')
    const block = src.split('outputs_of() {')[1].split('\n}')[0]
    const pairs = [...block.matchAll(/"([a-z:-]+)"\)\s*\n?\s*echo "([^"]+)"/g)]
    const fromScript: Record<string, string[]> = {}
    for (const [, label, paths] of pairs) {
      fromScript[label.replace(/:/g, '-').replace(/^scrape-factcheck$/, 'scrape-factcheck')] = paths
        .split(/\s+/)
        .map((p) => p.replace('public/data/', ''))
    }
    // Label→script-name normalisation: "extract:press-claims" ⇒ extract-press-claims.ts
    const normalised: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(fromScript)) normalised[k] = v
    expect(Object.keys(normalised).sort()).toEqual(
      [
        'scrape-factcheck',
        'extract-press-claims',
        'verify-press-claims',
        'summarize-press',
        'compute-press-analytics',
        'auto-curate-press',
        'audit-press-links',
      ].sort(),
    )
    expect(Object.values(normalised).flat().sort()).toEqual(ALL_SNAPSHOTS.sort())
  })
})
