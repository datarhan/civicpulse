/**
 * scripts/lib/cron-git.sh — the two defects that were present in all four
 * unattended cron pipelines, driven through the REAL shipped scripts.
 *
 * 1. `git commit` with no pathspec commits the WHOLE index. Every pipeline
 *    limited its `git add` to a pathspec and then threw that away. Twice on
 *    2026-08-09 the press-lab cron swept a subagent's in-flight staged work
 *    into its own data commit (f182c61, 15 files including
 *    tests/encaje-credencial.test.jsx). The "is there anything to commit?"
 *    guards had the same hole: `git diff --cached --quiet` answers "yes, work
 *    to do" for a stranger's staged file.
 *
 * 2. No branch guard. All four pull --rebase origin main and push origin main
 *    from whatever branch is checked out, which rebases YOUR branch, commits
 *    to it, and then pushes an untouched local main.
 *
 * Nothing here re-implements the fix — that is the trap DATA_INTEGRITY.md rule
 * 1 is about. The sandbox is a real git repo with a real bare origin; the
 * pipeline STEPS are stubbed through a real `npm run` (a sandbox package.json
 * pointing every script at scripts/stub-step.sh) and, for press-lab, a fake
 * `tsx` in the sandbox's own node_modules/.bin.
 *
 * The stranger's file is staged by the STUB, i.e. midway through the run — the
 * way the real incident happened, and after the pipelines' opening
 * `git pull --rebase --autostash` (whose stash-apply would otherwise unstage
 * it and quietly defuse the reproducer).
 *
 * Every "it was not committed" assertion is paired with proof that the
 * reproducer conditions were really present: the stub ran, the stranger's file
 * really was staged, and the cron's own snapshot really did reach the commit.
 */
import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

const REPO = resolve(__dirname, '../..')

/** The four shipped cron scripts under test, by sandbox-relative path. */
const SCRIPTS = [
  'scripts/auto-curate-promises-daily.sh',
  'scripts/hallazgos-pipeline.sh',
  'scripts/press-lab-pipeline.sh',
  'scripts/scrape-ci-blocked.sh',
  'scripts/lib/cron-git.sh',
]

/** The file a concurrent subagent had staged when f182c61 swept it up. */
const STRANGER = 'tests/encaje-credencial.test.jsx'

/** npm-script → snapshot it writes. Mirrors what each real script produces. */
const STEP_OUTPUTS: Record<string, string> = {
  'auto-curate-promises': 'public/data/promises.json',
  'scrape:paro': 'public/data/paro.json',
  'scrape:pleno-agendas': 'public/data/plenos-agendas.json',
  'scrape:consell-cv': 'public/data/consell-cv.json',
  'scrape:procesos-selectivos': 'public/data/procesos-selectivos.json',
  'scrape:asociaciones': 'public/data/asociaciones.json',
  'scrape:obras': 'public/data/obras.json',
  'scrape:sindicatura': 'public/data/sindicatura.json',
  'scrape:pleno-videos': 'public/data/pleno-videos.json',
  'auto-curate': 'public/data/pleno-findings.json',
  // steps that produce nothing this suite needs to see
  'check:citations': '',
  'verify:pleno-claims': '',
  'embed:agent-corpus': '',
  'embed:verifier-corpus': '',
  'ifcn:cadence': '',
}

const sandboxes: string[] = []

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, HOME: dir } })
}

interface SandboxOpts {
  /** Branch to check out before running (default: main). */
  branch?: string
  /** Point origin at a path that does not exist, so pull/push must fail. */
  brokenRemote?: boolean
}

function makeSandbox(opts: SandboxOpts = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'cron-git-'))
  sandboxes.push(dir)
  mkdirSync(join(dir, 'scripts/lib'), { recursive: true })
  mkdirSync(join(dir, 'public/data/pleno-transcripts'), { recursive: true })
  mkdirSync(join(dir, 'node_modules/.bin'), { recursive: true })
  mkdirSync(join(dir, 'nohooks'), { recursive: true })
  mkdirSync(join(dir, 'tests'), { recursive: true })

  for (const s of SCRIPTS) copyFileSync(join(REPO, s), join(dir, s))

  // ---- baseline published corpus ---------------------------------------
  for (const p of Object.values(STEP_OUTPUTS)) {
    if (p) writeFileSync(join(dir, p), '{"items":[{"id":"baseline"}]}\n')
  }
  // Files owned by the OTHER crons — hallazgos must never commit these.
  writeFileSync(join(dir, 'public/data/quejas.json'), '{"items":[{"id":"baseline"}]}\n')
  writeFileSync(join(dir, 'public/data/promises.json'), '{"items":[{"id":"baseline"}]}\n')
  // hallazgos' node -e backlog query reads these two. No video date matches a
  // pleno date, so the transcribe/extract loop is an intentional no-op.
  writeFileSync(join(dir, 'public/data/plenos.json'), '{"items":[{"id":"p1","date":"2020-01-01"}]}\n')
  // press-lab snapshots
  for (const f of [
    'factcheck.json',
    'press-claims-suggestions.json',
    'press-claims-verified.json',
    'press-summaries.json',
    'press-trust.json',
    'press-triangulation.json',
    'press-coverage-gaps.json',
    'press-findings.json',
    'press-link-rot.json',
  ]) {
    writeFileSync(join(dir, 'public/data', f), '{"items":[{"id":"baseline"}]}\n')
  }

  // ---- a real `npm run` whose scripts all land on one stub -------------
  const pkgScripts: Record<string, string> = {}
  for (const name of Object.keys(STEP_OUTPUTS)) {
    pkgScripts[name] = `bash scripts/stub-step.sh ${name}`
  }
  writeFileSync(
    join(dir, 'package.json'),
    `${JSON.stringify({ name: 'cron-git-sandbox', version: '1.0.0', private: true, scripts: pkgScripts }, null, 2)}\n`,
  )

  const stub = `#!/bin/bash
# Stand-in for one pipeline step, reached through REAL \`npm run\`.
name="$1"
echo "[stub] ran $name"
# A concurrent subagent stages its work WHILE the cron runs — after the
# pipeline's opening pull --rebase --autostash, exactly as on 2026-08-09.
if [ -n "\${STUB_STAGE_STRANGER:-}" ] && [ -e "\${STUB_STAGE_STRANGER}" ]; then
  git add -- "\${STUB_STAGE_STRANGER}" && echo "[stub] staged stranger \${STUB_STAGE_STRANGER}"
fi
case " \${STUB_FAIL:-} " in *" $name "*) echo "[stub] $name FAILING" >&2; exit 1 ;; esac
if [ -n "\${STUB_NOOP:-}" ]; then echo "[stub] $name wrote nothing"; exit 0; fi
outs=""
case "$name" in
${Object.entries(STEP_OUTPUTS)
  .filter(([, v]) => v)
  .map(([k, v]) => `  ${k}) outs="${v}" ;;`)
  .join('\n')}
esac
for f in $outs; do printf '{"items":[{"id":"run-%s-%s"}]}\\n' "$name" "\${STUB_STAMP:-1}" > "$f"; done
exit 0
`
  writeFileSync(join(dir, 'scripts/stub-step.sh'), stub)

  // press-lab reaches its steps through `npx tsx`, which prefers the nearest
  // node_modules/.bin.
  const tsxStub = `#!/bin/bash
name=$(basename "$1" .ts)
echo "[stub] ran $name"
if [ -n "\${STUB_STAGE_STRANGER:-}" ] && [ -e "\${STUB_STAGE_STRANGER}" ]; then
  git add -- "\${STUB_STAGE_STRANGER}" && echo "[stub] staged stranger \${STUB_STAGE_STRANGER}"
fi
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
if [ -z "\${STUB_NOOP:-}" ]; then
  for f in $outs; do printf '{"items":[{"id":"run-%s-%s"}]}\\n' "$name" "\${STUB_STAMP:-1}" > "public/data/$f"; done
fi
exit 0
`
  const tsxPath = join(dir, 'node_modules/.bin/tsx')
  writeFileSync(tsxPath, tsxStub)
  chmodSync(tsxPath, 0o755)

  // ---- repo + a real bare origin ---------------------------------------
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'test@example.invalid')
  git(dir, 'config', 'user.name', 'cron-git test')
  git(dir, 'config', 'core.hooksPath', join(dir, 'nohooks'))
  git(dir, 'config', 'commit.gpgsign', 'false')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-qm', 'baseline')

  const origin = `${dir}.origin.git`
  sandboxes.push(origin)
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin])
  git(dir, 'remote', 'add', 'origin', origin)
  git(dir, 'push', '-q', 'origin', 'main')
  if (opts.brokenRemote) git(dir, 'remote', 'set-url', 'origin', join(dir, 'no-such-origin.git'))
  if (opts.branch && opts.branch !== 'main') git(dir, 'checkout', '-q', '-b', opts.branch)

  return dir
}

interface RunResult {
  status: number
  log: string
  /** Paths in the commit this run produced, or [] when it made none. */
  committed: string[]
  subject: string
  /** Still staged after the run (the stranger's work must survive untouched). */
  stagedAfter: string[]
  head: string
  originHead: string
}

function runScript(dir: string, script: string, env: Record<string, string> = {}): RunResult {
  const before = git(dir, 'rev-parse', 'HEAD').trim()
  let status = 0
  let log = ''
  try {
    log = execFileSync('/bin/bash', [join(dir, script)], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        HOME: dir,
        // hallazgos: skip the `claude -p` probe. press-lab: make it fail fast.
        LLM_BACKEND: 'stub',
        CLAUDE_CODE_BIN: '/nonexistent-disabled',
        LLM_TIMEOUT: '120',
        MAX_PLENOS: '1',
        ...env,
      },
    })
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string }
    status = e.status ?? -1
    log = (e.stdout ?? '') + (e.stderr ?? '')
  }
  const head = git(dir, 'rev-parse', 'HEAD').trim()
  const stagedAfter = git(dir, 'diff', '--cached', '--name-only')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  let originHead = ''
  try {
    originHead = execFileSync('git', ['rev-parse', 'main'], {
      cwd: `${dir}.origin.git`,
      encoding: 'utf8',
    }).trim()
  } catch {
    /* broken-remote sandboxes */
  }
  if (head === before) {
    return { status, log, committed: [], subject: '', stagedAfter, head, originHead }
  }
  const committed = git(dir, 'show', '--name-only', '--format=', 'HEAD')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  return {
    status,
    log,
    committed,
    subject: git(dir, 'log', '-1', '--format=%s').trim(),
    stagedAfter,
    head,
    originHead,
  }
}

/** Drop an untracked file the cron has no business committing. */
function plantStranger(dir: string): void {
  writeFileSync(join(dir, STRANGER), "it('encaje declarado', () => {})\n")
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

// ---------------------------------------------------------------------------
describe("cron pipelines · a stranger's staged work is not swept into the commit", () => {
  const cases: Array<{ script: string; ownFile: string; env?: Record<string, string> }> = [
    { script: 'scripts/scrape-ci-blocked.sh', ownFile: 'public/data/paro.json' },
    { script: 'scripts/auto-curate-promises-daily.sh', ownFile: 'public/data/promises.json' },
    { script: 'scripts/hallazgos-pipeline.sh', ownFile: 'public/data/pleno-findings.json' },
    {
      script: 'scripts/press-lab-pipeline.sh',
      ownFile: 'public/data/press-claims-verified.json',
      env: { PRESS_LAB_NO_REMOTE: '1' },
    },
  ]

  for (const { script, ownFile, env } of cases) {
    it(`${script} commits only its own pathspec (the f182c61 reproducer)`, () => {
      const dir = makeSandbox()
      plantStranger(dir)
      const r = runScript(dir, script, { STUB_STAGE_STRANGER: STRANGER, ...env })

      // The reproducer conditions were REALLY present…
      expect(r.log, 'no step ran — the run measured nothing').toContain('[stub] ran ')
      expect(r.log, 'the stranger never got staged').toContain(`[stub] staged stranger ${STRANGER}`)
      // …and the cron really did produce and publish its own work.
      expect(r.committed, 'the cron made no commit at all').not.toEqual([])
      expect(r.committed).toContain(ownFile)

      // The point.
      expect(r.committed).not.toContain(STRANGER)
      // Left exactly as the stranger left it: staged, not committed, not reset.
      expect(r.stagedAfter).toContain(STRANGER)
    }, 120_000)
  }
})

// ---------------------------------------------------------------------------
describe("cron pipelines · the nothing-changed guard ignores a stranger's staged file", () => {
  const cases: Array<{ script: string; quiet: string; env?: Record<string, string> }> = [
    { script: 'scripts/scrape-ci-blocked.sh', quiet: 'no changes' },
    { script: 'scripts/auto-curate-promises-daily.sh', quiet: 'nothing to commit' },
    { script: 'scripts/hallazgos-pipeline.sh', quiet: 'nothing changed' },
    {
      script: 'scripts/press-lab-pipeline.sh',
      quiet: 'nothing changed',
      env: { PRESS_LAB_NO_REMOTE: '1' },
    },
  ]

  for (const { script, quiet, env } of cases) {
    it(`${script} makes no commit when only a stranger's file is staged`, () => {
      const dir = makeSandbox()
      plantStranger(dir)
      // STUB_NOOP: every step runs but writes nothing, so the ONLY thing in the
      // index is the stranger's file. The old `git diff --cached --quiet` read
      // that as "there is work to do" and committed it.
      const r = runScript(dir, script, { STUB_NOOP: '1', STUB_STAGE_STRANGER: STRANGER, ...env })

      expect(r.log, 'no step ran — the run measured nothing').toContain('[stub] ran ')
      expect(r.log).toContain(`[stub] staged stranger ${STRANGER}`)
      expect(r.stagedAfter, 'the stranger was never actually staged').toContain(STRANGER)

      expect(r.log).toContain(quiet)
      expect(r.committed).toEqual([])
    }, 120_000)
  }
})

// ---------------------------------------------------------------------------
describe('cron pipelines · branch guard', () => {
  const cases = [
    'scripts/scrape-ci-blocked.sh',
    'scripts/auto-curate-promises-daily.sh',
    'scripts/hallazgos-pipeline.sh',
    'scripts/press-lab-pipeline.sh',
  ]

  for (const script of cases) {
    it(`${script} refuses on a feature branch, before doing any work`, () => {
      const dir = makeSandbox({ branch: 'fix/some-feature' })
      const originBefore = execFileSync('git', ['rev-parse', 'main'], {
        cwd: `${dir}.origin.git`,
        encoding: 'utf8',
      }).trim()
      const r = runScript(dir, script)

      // Says so, naming the branch it found and the one it wanted.
      expect(r.log).toMatch(/OMITIDO — HEAD está en 'fix\/some-feature', no en 'main'/)
      expect(r.log).toContain('CRON_GIT_ALLOW_BRANCH=1')
      // A skipped cron run is not a failure.
      expect(r.status).toBe(0)
      // Refused BEFORE the expensive part: no step ran, nothing was committed,
      // nothing reached the remote.
      expect(r.log).not.toContain('[stub] ran ')
      expect(r.committed).toEqual([])
      expect(r.originHead).toBe(originBefore)
    }, 60_000)
  }

  it('hallazgos-pipeline.sh refuses before it even takes the run lock', () => {
    // The guard sits above the lock, so a refused run cannot leave a lock
    // behind for the next one to trip over — and proves the exit is early.
    const dir = makeSandbox({ branch: 'fix/some-feature' })
    const r = runScript(dir, 'scripts/hallazgos-pipeline.sh')
    expect(r.log).toContain('OMITIDO')
    expect(existsSync(join(dir, 'scripts/.hallazgos-pipeline.lock'))).toBe(false)
  }, 60_000)

  it('a detached HEAD is refused too', () => {
    const dir = makeSandbox()
    git(dir, 'checkout', '-q', '--detach')
    const r = runScript(dir, 'scripts/scrape-ci-blocked.sh')
    expect(r.log).toContain('HEAD desacoplado')
    expect(r.log).toContain('OMITIDO')
    expect(r.status).toBe(0)
    expect(r.log).not.toContain('[stub] ran ')
  }, 60_000)

  it('CRON_GIT_ALLOW_BRANCH=1 is a real override — the run proceeds and commits', () => {
    const dir = makeSandbox({ branch: 'fix/some-feature' })
    const r = runScript(dir, 'scripts/scrape-ci-blocked.sh', { CRON_GIT_ALLOW_BRANCH: '1' })
    expect(r.log).toContain('CRON_GIT_ALLOW_BRANCH está activo')
    expect(r.log).not.toContain('OMITIDO')
    // It really ran: seven adapters plus the citation probe, and a commit.
    expect(r.log).toContain('[stub] ran scrape:paro')
    expect(r.log).toContain('[stub] ran check:citations')
    expect(r.committed).toContain('public/data/paro.json')
    expect(git(dir, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('fix/some-feature')
  }, 60_000)

  it('PRESS_LAB_NO_REMOTE still rehearses on a feature branch, and stays off the network', () => {
    // The rehearsal switch skips BOTH remote touchpoints, so there is nothing
    // for the branch guard to protect — it composes instead of vetoing.
    const dir = makeSandbox({ branch: 'fix/some-feature' })
    const originBefore = execFileSync('git', ['rev-parse', 'main'], {
      cwd: `${dir}.origin.git`,
      encoding: 'utf8',
    }).trim()
    const r = runScript(dir, 'scripts/press-lab-pipeline.sh', { PRESS_LAB_NO_REMOTE: '1' })

    expect(r.log).toMatch(/HEAD está en 'fix\/some-feature'.*este run no toca el remoto/)
    expect(r.log).not.toContain('OMITIDO')
    // The whole chain really ran and committed, on the feature branch.
    expect(r.log).toContain('[stub] ran extract-press-claims')
    expect(r.log).toContain('7 ok · 0 fallidos · 0 omitidos')
    expect(r.committed).toContain('public/data/press-claims-verified.json')
    expect(r.log).toContain('se omite el git pull inicial')
    expect(r.log).toContain('ensayo local: no se hace push')
    expect(r.originHead).toBe(originBefore)
  }, 120_000)
})

// ---------------------------------------------------------------------------
describe('hallazgos-pipeline.sh · the other crons’ files stay out', () => {
  it('never commits quejas.json or promises.json, even when they are dirty', () => {
    const dir = makeSandbox()
    // Simulate the per-minute quejas cron and the promises cron mid-write.
    writeFileSync(join(dir, 'public/data/quejas.json'), '{"items":[{"id":"other-cron"}]}\n')
    writeFileSync(join(dir, 'public/data/promises.json'), '{"items":[{"id":"other-cron"}]}\n')
    const r = runScript(dir, 'scripts/hallazgos-pipeline.sh')

    expect(r.committed, 'the pipeline made no commit at all').not.toEqual([])
    expect(r.committed).toContain('public/data/pleno-findings.json')
    expect(r.committed).not.toContain('public/data/quejas.json')
    expect(r.committed).not.toContain('public/data/promises.json')
    // Excluded from the pathspec entirely — so this cron does not even stage
    // (and then unstage) files another process is writing.
    expect(r.stagedAfter).not.toContain('public/data/quejas.json')
    expect(r.stagedAfter).not.toContain('public/data/promises.json')
  }, 120_000)
})

// ---------------------------------------------------------------------------
describe('scrape-ci-blocked.sh · a failed publish is no longer silent', () => {
  it('does not claim "pushed" when the pull before the push fails', () => {
    // Was `git pull --rebase … && git push …`: a failed pull skipped the push,
    // the script still echoed "pushed", and it exited on the ADAPTER count.
    const dir = makeSandbox({ brokenRemote: true })
    const r = runScript(dir, 'scripts/scrape-ci-blocked.sh')

    expect(r.log).toContain('[stub] ran scrape:paro') // it really did the work
    expect(r.committed).toContain('public/data/paro.json') // and committed it locally
    expect(r.log).toMatch(/ERROR: git pull --rebase falló/)
    expect(r.log).not.toContain('[ci-blocked] pushed')
    expect(r.status).toBe(1)
  }, 60_000)

  it('an adapter failure stays non-fatal and still publishes the rest', () => {
    // The deliberate resilience the `|| true` was protecting must survive: one
    // upstream adapter down must not withhold the other six.
    const dir = makeSandbox()
    const r = runScript(dir, 'scripts/scrape-ci-blocked.sh', { STUB_FAIL: 'scrape:obras' })

    expect(r.log).toContain('[ci-blocked] FAILED: scrape:obras')
    expect(r.committed).toContain('public/data/paro.json')
    expect(r.log).toContain('[ci-blocked] pushed')
    expect(r.status).toBe(1) // exit = number of failed adapters, as before
  }, 60_000)
})
