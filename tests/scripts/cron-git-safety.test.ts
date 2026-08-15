/**
 * scripts/lib/cron-git.sh — the two defects that were present in every
 * unattended cron pipeline, driven through the REAL shipped scripts.
 *
 * 1. `git commit` with no pathspec commits the WHOLE index. Every pipeline
 *    limited its `git add` to a pathspec and then threw that away. Twice on
 *    2026-08-09 the press-lab cron swept a subagent's in-flight staged work
 *    into its own data commit (f182c61, 15 files including
 *    tests/encaje-credencial.test.jsx). Most of the "is there anything to
 *    commit?" guards had the same hole: `git diff --cached --quiet` answers
 *    "yes, work to do" for a stranger's staged file. auto-curate-weekly's was
 *    already pathspec-limited and failed the other way round — it compared the
 *    working tree against the INDEX, so an already-staged batch read as
 *    "nothing to commit" and never published.
 *
 * 2. No branch guard. Every one of them pulls --rebase origin main and pushes
 *    origin main from whatever branch is checked out, which rebases YOUR
 *    branch, commits to it, and then pushes an untouched local main.
 *
 * 3. The branch guard was a point-in-time check. It was correctly wired into
 *    all five and it still failed: on 2026-08-10 press-lab started at 10:45
 *    (guard passed, HEAD was main), an agent branched off during the run, and
 *    commit 30277ab landed on fix/citas-no-contrastadas. Same race in front of
 *    the opening pull, where the damage is worse — it rebases that branch.
 *    Reproduced below by a STUB that switches branch midway, the way the real
 *    incident happened; and, for the pull, by the `claude -p` probe that sits
 *    between the guard and the pull.
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

/** The shipped cron scripts under test, by sandbox-relative path. */
const SCRIPTS = [
  'scripts/auto-curate-promises-daily.sh',
  'scripts/auto-curate-weekly.sh',
  'scripts/hallazgos-pipeline.sh',
  'scripts/press-lab-pipeline.sh',
  'scripts/scrape-ci-blocked.sh',
  'scripts/lib/cron-git.sh',
]

/** The file a concurrent subagent had staged when f182c61 swept it up. */
const STRANGER = 'tests/encaje-credencial.test.jsx'

/**
 * Injected into both stubs. A concurrent agent moves HEAD midway through the
 * run — the 30277ab race. Two shapes, because they are two different bugs:
 *
 *   STUB_SWITCH_BRANCH     branch off and stay there. HEAD's ref changes.
 *   STUB_ROUNDTRIP_BRANCH  branch off and switch straight back. The branch NAME
 *                          matches again on the way out, so a name-only check
 *                          waves it through — while the two checkouts have had
 *                          the chance to revert this run's files under it.
 *
 * Both are one-shot: the stub runs once per pipeline step.
 */
const SWITCH_SNIPPET = `
if [ -n "\${STUB_SWITCH_BRANCH:-}" ]; then
  _cur="$(git symbolic-ref --short -q HEAD || true)"
  if [ "$_cur" != "\${STUB_SWITCH_BRANCH}" ]; then
    git checkout -q -b "\${STUB_SWITCH_BRANCH}" 2>/dev/null || git checkout -q "\${STUB_SWITCH_BRANCH}"
    echo "[stub] switched HEAD to \${STUB_SWITCH_BRANCH}"
  fi
fi
if [ -n "\${STUB_ROUNDTRIP_BRANCH:-}" ] && [ ! -e .stub-roundtrip-done ]; then
  _back="$(git symbolic-ref --short -q HEAD || true)"
  git checkout -q -b "\${STUB_ROUNDTRIP_BRANCH}" 2>/dev/null || git checkout -q "\${STUB_ROUNDTRIP_BRANCH}"
  git checkout -q "$_back"
  : > .stub-roundtrip-done
  echo "[stub] round-tripped HEAD via \${STUB_ROUNDTRIP_BRANCH} back to $_back"
fi
# Otro proceso git tiene tomado el índice justo cuando este cron va a
# comitear. No es hipotético: el 2026-08-11 y el 2026-08-14 el press-lab
# completó sus siete pasos y perdió el commit así —«fatal: No se puede crear
# '.git/index.lock'»—, porque el otro proceso era yo comiteando a la vez.
# Se toma en el ÚLTIMO paso, que es donde la ventana real está.
if [ -n "\${STUB_HOLD_LOCK_ON:-}" ] && [ "$name" = "\${STUB_HOLD_LOCK_ON}" ]; then
  : > .git/index.lock
  echo "[stub] tomó .git/index.lock durante \${STUB_HOLD_LOCK_SECS:-4}s"
  # Con los descriptores cerrados: si el subshell conservara la tubería, el
  # execFileSync del test se quedaría esperando a que muera.
  ( sleep "\${STUB_HOLD_LOCK_SECS:-4}"; rm -f .git/index.lock ) >/dev/null 2>&1 &
fi`

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
  // The speaker-map arm. `speaker-map:backlog` must print a session id or the
  // step has nothing to do and the branch under test never runs; the stub
  // handles it specially below.
  'speaker-map:backlog': '',
  'extract:speaker-map': '',
  'extract:pleno-claims': '',
  refresh: '',
  // Report-only, writes to gitignored `editorial/` — so it must NOT appear in
  // any commit this suite inspects. Stubbed so the pipeline can reach it.
  'reconcile:attribution': '',
}

const sandboxes: string[] = []

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, HOME: dir },
  })
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
  writeFileSync(
    join(dir, 'public/data/plenos.json'),
    '{"items":[{"id":"p1","date":"2020-01-01"}]}\n',
  )
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
${SWITCH_SNIPPET}
case " \${STUB_FAIL:-} " in *" $name "*) echo "[stub] $name FAILING" >&2; exit 1 ;; esac
# The speaker-map arm reads this list as its work queue, so it has to name a
# session or the whole branch is unreachable and its tests pass on nothing.
if [ "$name" = "speaker-map:backlog" ]; then echo "sandboxpleno"; exit 0; fi
# The map is written ABOVE the STUB_NOOP gate on purpose. The scenario that
# matters is a night whose ONLY output is a map — every other step quiet — and
# a stub that went quiet with them could not produce it.
if [ "$name" = "extract:speaker-map" ]; then
  mkdir -p pleno-speaker-map
  printf '{"plenoId":"%s","stats":{"chunksExpected":3,"chunksTranscribed":1,"attemptedThisRun":1,"failedChunks":[]},"rows":[],"segments":[],"rejected":[]}\\n' "$2" > "pleno-speaker-map/$2.json"
  echo "[stub] wrote pleno-speaker-map/$2.json"
  exit 0
fi
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
${SWITCH_SNIPPET}
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
  /** Branch checked out when the run ended ('HEAD' if detached). */
  branchAfter: string
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
  const branchAfter = git(dir, 'rev-parse', '--abbrev-ref', 'HEAD').trim()
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
    return { status, log, committed: [], subject: '', stagedAfter, head, branchAfter, originHead }
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
    branchAfter,
    originHead,
  }
}

/** Drop an untracked file the cron has no business committing. */
function plantStranger(dir: string): void {
  writeFileSync(join(dir, STRANGER), "it('encaje declarado', () => {})\n")
}

/** Tip of a local branch, or '' when it does not exist. */
function tip(dir: string, ref: string): string {
  try {
    return git(dir, 'rev-parse', ref).trim()
  } catch {
    return ''
  }
}

/** Porcelain status lines for a path — proof the run's output survived. */
function statusOf(dir: string, path: string): string {
  return git(dir, 'status', '--porcelain', '--', path).trim()
}

/**
 * Put origin/main one commit ahead of local main, so the opening
 * `git pull --rebase` has something real to do — and something real to break
 * if it fires on the wrong branch. `reset --hard` writes no
 * `checkout: moving from` reflog entry, so the setup cannot itself trip the
 * switch counter.
 */
function advanceOrigin(dir: string): void {
  writeFileSync(join(dir, 'public/data/press.json'), '{"items":[{"id":"upstream"}]}\n')
  git(dir, 'add', '--', 'public/data/press.json')
  git(dir, 'commit', '-qm', 'upstream: a commit only origin has')
  git(dir, 'push', '-q', 'origin', 'main')
  git(dir, 'reset', '-q', '--hard', 'HEAD~1')
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
    // Currently disabled (the plist is renamed .disabled) — but a disabled
    // agent can be re-enabled, and this one writes pleno-findings.json, a
    // curated file of claims about named elected officials.
    { script: 'scripts/auto-curate-weekly.sh', ownFile: 'public/data/pleno-findings.json' },
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
    { script: 'scripts/auto-curate-weekly.sh', quiet: 'no new findings' },
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
    'scripts/auto-curate-weekly.sh',
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

  it('CRON_GIT_ALLOW_BRANCH=1 overrides for auto-curate-weekly too', () => {
    // The override is the same escape hatch on the curated-findings cron: it
    // proceeds, the curator step really runs, and the commit lands on the
    // feature branch (which is exactly what the guard warns about).
    const dir = makeSandbox({ branch: 'fix/some-feature' })
    const r = runScript(dir, 'scripts/auto-curate-weekly.sh', { CRON_GIT_ALLOW_BRANCH: '1' })

    expect(r.log).toContain('CRON_GIT_ALLOW_BRANCH está activo')
    expect(r.log).not.toContain('OMITIDO')
    expect(r.log).toContain('[stub] ran auto-curate')
    expect(r.committed).toContain('public/data/pleno-findings.json')
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
// The guard passed at 10:45 and the commit landed at 10:52 on a branch that did
// not exist at 10:45. The guard must record what it approved and the commit
// must re-check it.
describe('cron pipelines · the commit lands on the branch the guard approved, or nowhere', () => {
  const cases: Array<{ script: string; ownFile: string; env?: Record<string, string> }> = [
    { script: 'scripts/scrape-ci-blocked.sh', ownFile: 'public/data/paro.json' },
    { script: 'scripts/auto-curate-promises-daily.sh', ownFile: 'public/data/promises.json' },
    { script: 'scripts/auto-curate-weekly.sh', ownFile: 'public/data/pleno-findings.json' },
    { script: 'scripts/hallazgos-pipeline.sh', ownFile: 'public/data/pleno-findings.json' },
    {
      script: 'scripts/press-lab-pipeline.sh',
      ownFile: 'public/data/press-claims-verified.json',
      env: { PRESS_LAB_NO_REMOTE: '1' },
    },
  ]

  for (const { script, ownFile, env } of cases) {
    it(`${script} refuses to commit when HEAD moves mid-run (the 30277ab reproducer)`, () => {
      const dir = makeSandbox()
      const base = tip(dir, 'main')
      const r = runScript(dir, script, { STUB_SWITCH_BRANCH: 'fix/mid-run', ...env })

      // The reproducer conditions were REALLY present: the run did its work,
      // and HEAD really moved under it.
      expect(r.log, 'no step ran — the run measured nothing').toContain('[stub] ran ')
      expect(r.log).toContain('[stub] switched HEAD to fix/mid-run')
      expect(r.branchAfter, 'the mid-run switch did not stick').toBe('fix/mid-run')

      // The point: no commit, on EITHER branch.
      expect(tip(dir, 'fix/mid-run'), 'it committed onto the new branch').toBe(base)
      expect(tip(dir, 'main'), 'it committed onto main after HEAD had left it').toBe(base)
      expect(r.committed).toEqual([])

      // Loud, naming the branch it approved and the one it found…
      expect(r.log).toContain('ABORTADO')
      expect(r.log).toMatch(/rama aprobada al empezar: 'main'/)
      expect(r.log).toMatch(/rama ahora mismo: +'fix\/mid-run'/)
      // …non-zero, so a cron log the operator greps for failures shows it…
      expect(r.status).not.toBe(0)
      // …and refusing is not discarding: the run's output is still in the
      // working tree, and the refusal names it so the operator can publish it.
      expect(statusOf(dir, ownFile), `${ownFile} was not left in the working tree`).not.toBe('')
      expect(r.log).toContain('sigue en el working tree')
      expect(r.log).toContain(ownFile)
    }, 120_000)
  }

  it('the normal path still commits — same branch throughout, no refusal', () => {
    // Positive control. A guard that never lets anything through is not a fix.
    const dir = makeSandbox()
    const base = tip(dir, 'main')
    const r = runScript(dir, 'scripts/scrape-ci-blocked.sh')

    expect(r.log).not.toContain('ABORTADO')
    expect(r.branchAfter).toBe('main')
    expect(tip(dir, 'main'), 'nothing was committed').not.toBe(base)
    expect(r.committed).toContain('public/data/paro.json')
    expect(r.log).toContain('[ci-blocked] pushed')
    expect(r.status).toBe(0)
  }, 60_000)

  it('a round trip is refused too — the branch NAME is not the identity', () => {
    // Checked out, worked on, switched back: the name matches again on the way
    // out, so a name-only check waves it through. It must not — those two
    // checkouts rewrite every file that differs between the branches, which can
    // silently revert the very snapshots this run is about to publish.
    const dir = makeSandbox()
    const base = tip(dir, 'main')
    const r = runScript(dir, 'scripts/scrape-ci-blocked.sh', {
      STUB_ROUNDTRIP_BRANCH: 'fix/excursion',
    })

    expect(r.log).toContain('[stub] round-tripped HEAD via fix/excursion back to main')
    expect(r.branchAfter, 'HEAD did not come back to main').toBe('main')
    expect(statusOf(dir, 'public/data/paro.json'), 'nothing was produced').not.toBe('')

    expect(r.log).toContain('ABORTADO')
    expect(r.log).toContain('Mismo NOMBRE de rama')
    expect(r.log).toMatch(/cambios de rama en el reflog: \d+ → \d+/)
    expect(tip(dir, 'main')).toBe(base)
    expect(r.committed).toEqual([])
    expect(r.status).not.toBe(0)
  }, 60_000)

  it('CRON_GIT_ALLOW_BRANCH=1 pins the branch it approved, not literally main', () => {
    // The override approves THIS branch, so leaving THIS branch is the breach.
    const dir = makeSandbox({ branch: 'fix/some-feature' })
    const base = tip(dir, 'main')
    const r = runScript(dir, 'scripts/scrape-ci-blocked.sh', {
      CRON_GIT_ALLOW_BRANCH: '1',
      STUB_SWITCH_BRANCH: 'fix/another',
    })

    expect(r.log).toContain('CRON_GIT_ALLOW_BRANCH está activo')
    expect(r.log).toContain('[stub] switched HEAD to fix/another')
    expect(r.log).toContain('ABORTADO')
    expect(r.log).toMatch(/rama aprobada al empezar: 'fix\/some-feature'/)
    expect(r.log).toMatch(/rama ahora mismo: +'fix\/another'/)
    expect(tip(dir, 'fix/another')).toBe(base)
    expect(tip(dir, 'fix/some-feature')).toBe(base)
    expect(r.status).not.toBe(0)
  }, 60_000)

  it('the PRESS_LAB_NO_REMOTE rehearsal is identity-checked too', () => {
    // Nothing is pushed in a rehearsal, but committing onto a branch that
    // appeared under it is still wrong — and the checkout can still eat the
    // rehearsal's output.
    const dir = makeSandbox({ branch: 'fix/rehearsal' })
    const base = tip(dir, 'main')
    const r = runScript(dir, 'scripts/press-lab-pipeline.sh', {
      PRESS_LAB_NO_REMOTE: '1',
      STUB_SWITCH_BRANCH: 'fix/mid-rehearsal',
    })

    expect(r.log).toMatch(/HEAD está en 'fix\/rehearsal'.*este run no toca el remoto/)
    expect(r.log).toContain('ABORTADO')
    expect(r.log).toMatch(/rama aprobada al empezar: 'fix\/rehearsal'/)
    expect(r.log).toMatch(/rama ahora mismo: +'fix\/mid-rehearsal'/)
    expect(tip(dir, 'fix/mid-rehearsal')).toBe(base)
    expect(tip(dir, 'fix/rehearsal')).toBe(base)
    expect(r.status).not.toBe(0)
  }, 120_000)
})

// ---------------------------------------------------------------------------
describe('cron pipelines · the opening pull races the guard as well', () => {
  it('press-lab-pipeline.sh will not pull --rebase onto a branch that appeared after the guard', () => {
    // The window in front of the pull is not theoretical: the lock, the .env
    // and a `claude -p` probe all sit between the guard and the pull. Here the
    // PROBE is the concurrent agent — it switches branch and exits 0, so
    // press-lab walks straight on into `git pull --rebase --autostash origin
    // main`, which on a feature branch rewrites that branch.
    const dir = makeSandbox()
    const probe = join(dir, 'switching-claude.sh')
    writeFileSync(probe, '#!/bin/bash\ngit checkout -q -b fix/pull-race\nexit 0\n')
    chmodSync(probe, 0o755)
    advanceOrigin(dir)
    const base = tip(dir, 'main')

    const r = runScript(dir, 'scripts/press-lab-pipeline.sh', {
      LLM_BACKEND: 'claude-code',
      CLAUDE_CODE_BIN: probe,
    })

    expect(r.branchAfter, 'the probe never switched branch').toBe('fix/pull-race')
    expect(r.log).toContain("ABORTADO antes de 'git pull inicial'")
    expect(r.log).toMatch(/rama aprobada al empezar: 'main'/)
    expect(r.log).toMatch(/rama ahora mismo: +'fix\/pull-race'/)
    // Refused BEFORE the pull: the feature branch was not rebased onto the
    // commit only origin has, local main is untouched, and no step ran.
    expect(tip(dir, 'fix/pull-race'), 'the pull rebased the feature branch').toBe(base)
    expect(tip(dir, 'main')).toBe(base)
    expect(r.log).not.toContain('[stub] ran ')
    expect(r.status).not.toBe(0)
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
/**
 * Una caída de claude-code no puede costar una noche de cuota de Gemini.
 *
 * El preflight de `hallazgos-pipeline.sh` existe por una buena razón: si el
 * backend de texto no contesta, dejar que cada llamada falle por su cuenta
 * drena la cadena hasta un fallback medido. Pero hacía `exit 0` sobre la pasada
 * ENTERA, y el paso de mapas de hablantes no usa ese backend para nada — usa
 * `GEMINI_API_KEY`, otra clave y otra cuota.
 *
 * Pasó el 2026-08-15: claude-code no contestó a las 09:30, la pasada se aplazó
 * al segundo, y los 20 trozos/día de la capa gratuita de Gemini se perdieron
 * sin haberlos pedido. Esa cuota no se acumula: una noche saltada alarga en una
 * noche un barrido de veinte, y no hay forma de recuperarla después.
 *
 * La adjudicación de back-references SÍ es texto, y degrada sola — una fila sin
 * adjudicar se queda `weak` y no produce atribución. La re-extracción posterior
 * sí necesita el backend, y ya sabe decir «mapa guardado, claims sin atribuir»
 * y volver mañana.
 */
describe('hallazgos-pipeline.sh · un backend caído no se lleva por delante los que están vivos', () => {
  /** Un `claude` en el PATH que nunca contesta: el preflight tiene que fallar. */
  function withDeadClaude(dir: string): Record<string, string> {
    const bin = join(dir, 'fakebin')
    mkdirSync(bin, { recursive: true })
    const p = join(bin, 'claude')
    writeFileSync(p, '#!/bin/sh\necho "quota" >&2\nexit 1\n')
    chmodSync(p, 0o755)
    return {
      PATH: `${bin}:${process.env.PATH}`,
      LLM_BACKEND: 'claude-code',
      GEMINI_API_KEY: 'sandbox-key',
      SPEAKER_MAP_BUDGET: '4',
    }
  }

  it('sigue construyendo mapas de hablantes cuando el backend de texto no contesta', () => {
    const dir = makeSandbox()
    const r = runScript(dir, 'scripts/hallazgos-pipeline.sh', withDeadClaude(dir))

    // Prueba de que el reproductor se dio: el preflight tiene que haber fallado.
    expect(r.log, 'el preflight de claude-code no llegó a fallar').toMatch(
      /claude-code (unavailable|no responde)/i,
    )
    // Y aun así llegó al paso que no lo necesita.
    expect(r.log, 'la pasada murió antes de los mapas de hablantes').toMatch(/speaker-map/i)
  }, 120_000)

  it('NO llama a los pasos que sí necesitan el backend de texto', () => {
    const dir = makeSandbox()
    const r = runScript(dir, 'scripts/hallazgos-pipeline.sh', withDeadClaude(dir))

    // El stub imprime «[stub] ran <paso>» al ejecutarse, así que su ausencia es
    // comprobable en vez de suponible.
    expect(r.log, 'se extrajeron claims con el backend caído').not.toContain(
      '[stub] ran extract:pleno-claims',
    )
    expect(r.log, 'se auto-curaron hallazgos con el backend caído').not.toContain(
      '[stub] ran auto-curate',
    )
  }, 120_000)

  it('dice en el log qué se saltó y por qué, en vez de callárselo', () => {
    const dir = makeSandbox()
    const r = runScript(dir, 'scripts/hallazgos-pipeline.sh', withDeadClaude(dir))
    // Una pasada degradada que se lee como una normal es la avería que este
    // fichero entero persigue.
    expect(r.log).toMatch(/degradad|sin backend de texto|text backend/i)
  }, 120_000)

  it('con el backend sano no se salta nada — control', () => {
    const dir = makeSandbox()
    const r = runScript(dir, 'scripts/hallazgos-pipeline.sh')
    expect(r.log, 'la pasada sana se declaró degradada').not.toMatch(/degradad/i)
    expect(r.log).toContain('[stub] ran auto-curate')
  }, 120_000)
})

// ---------------------------------------------------------------------------
/**
 * Un mapa de hablantes que no se comitea es trabajo que no existe.
 *
 * El commit del pipeline se engancha a `public/data` (menos los dos ficheros de
 * las otras crons). `pleno-speaker-map/` vive en la RAÍZ —nunca bajo `public/`,
 * porque Vercel sirve ese directorio entero y estas filas nombran a personas
 * vivas— y quedaba fuera del pathspec. Los cuatro commits de mapas que existen
 * los hizo una persona a mano; ninguna cron ha comiteado uno jamás.
 *
 * Con un barrido de ~24 noches por delante eso son dos averías, no una:
 *
 *   · una noche cuyo único trabajo es un mapa no ve cambios bajo `public/data`,
 *     sale por «nothing changed — done (no commit)» y deja el mapa suelto en el
 *     árbol, a merced del `pull --rebase --autostash` de la noche siguiente;
 *   · una noche sana comitea el corpus re-extraído CON la atribución que ese
 *     mapa estableció, y sin el mapa. Irreproducible por construcción.
 */
describe('hallazgos-pipeline.sh · los mapas de hablantes entran en el commit', () => {
  const MAPA = 'pleno-speaker-map/sandboxpleno.json'

  function conMapa(dir: string): Record<string, string> {
    return { GEMINI_API_KEY: 'sandbox-key', SPEAKER_MAP_BUDGET: '4' }
  }

  it('comitea el mapa cuando es lo ÚNICO que ha cambiado esa noche', () => {
    const dir = makeSandbox()
    // STUB_NOOP calla a todos los demás pasos: es la noche en la que el barrido
    // avanzó y nada más. Antes de esto, esa noche no comiteaba nada.
    const r = runScript(dir, 'scripts/hallazgos-pipeline.sh', {
      ...conMapa(dir),
      STUB_NOOP: '1',
    })
    // Prueba de que el reproductor se dio, antes de afirmar nada sobre el commit.
    expect(r.log, 'el stub del mapa no llegó a escribir').toContain(`[stub] wrote ${MAPA}`)
    expect(r.committed, 'la noche del mapa no comiteó nada').toContain(MAPA)
  }, 120_000)

  it('lo comitea también en una noche normal, junto al corpus que lo usa', () => {
    const dir = makeSandbox()
    const r = runScript(dir, 'scripts/hallazgos-pipeline.sh', conMapa(dir))
    expect(r.committed).toContain(MAPA)
    // La atribución del corpus sale de ese mapa; comitear uno sin el otro deja
    // el corpus apoyado en un fichero que no está en el repositorio.
    expect(r.committed).toContain('public/data/pleno-findings.json')
  }, 120_000)

  it('y abrir el pathspec no ha dejado entrar a las otras crons — control', () => {
    const dir = makeSandbox()
    writeFileSync(join(dir, 'public/data/quejas.json'), '{"items":[{"id":"other-cron"}]}\n')
    writeFileSync(join(dir, 'public/data/promises.json'), '{"items":[{"id":"other-cron"}]}\n')
    const r = runScript(dir, 'scripts/hallazgos-pipeline.sh', conMapa(dir))
    expect(r.committed).toContain(MAPA)
    expect(r.committed).not.toContain('public/data/quejas.json')
    expect(r.committed).not.toContain('public/data/promises.json')
    expect(r.stagedAfter).not.toContain('public/data/quejas.json')
  }, 120_000)
})

// ---------------------------------------------------------------------------
describe('auto-curate-weekly.sh · the gate compares against HEAD, not the index', () => {
  it('publishes a batch an interrupted run left staged', () => {
    // Unlike the other four, this script's old gate was already pathspec-
    // limited — but it compared the working tree against the INDEX. Interrupt
    // a run between its `git add` and its `git commit` (or let anything else
    // stage the file) and every later run sees worktree == index, prints "no
    // new findings" and exits 0. A curated batch about named councillors,
    // stuck one command short of publication and permanently invisible,
    // because nothing will ever dirty the working tree again.
    const dir = makeSandbox()
    writeFileSync(
      join(dir, 'public/data/pleno-findings.json'),
      '{"items":[{"id":"f-interrumpido"}]}\n',
    )
    git(dir, 'add', '--', 'public/data/pleno-findings.json')

    // STUB_NOOP: this run's curator writes nothing of its own, so the only
    // thing there is to publish is what the interrupted run left staged.
    const r = runScript(dir, 'scripts/auto-curate-weekly.sh', { STUB_NOOP: '1' })

    expect(r.log, 'the curator step never ran').toContain('[stub] ran auto-curate')
    expect(r.log).not.toContain('no new findings')
    expect(r.committed).toContain('public/data/pleno-findings.json')
    expect(git(dir, 'show', 'HEAD:public/data/pleno-findings.json')).toContain('f-interrumpido')
  }, 60_000)
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

// ---------------------------------------------------------------------------
describe('cron pipelines · un .git/index.lock ajeno no puede tragarse el commit', () => {
  // El 2026-08-14 press-lab completó sus siete pasos —«7 ok · 0 fallidos»— y al
  // ir a comitear:
  //
  //   fatal: No se puede crear '.git/index.lock': File exists.
  //   ERROR: el commit falló (rc=128) sobre: … public/data/press-link-rot.json
  //
  // El otro proceso git era yo, comiteando a la vez. Ocho de los nueve ficheros
  // no habían cambiado; press-link-rot.json sí —lleva marca de tiempo— y se
  // quedó sucio en el árbol, con el trabajo de la pasada sin publicar.
  //
  // No fue la primera: el 2026-08-11 pasó lo mismo (rc=1). Y el push, tres
  // líneas más abajo en el mismo script, LLEVA reintento con pull-rebase desde
  // que se descubrió que compite con el cron de quejas cada minuto. Es la misma
  // carrera y sólo estaba resuelta la mitad.

  it('reintenta y acaba comiteando cuando el lock se suelta', () => {
    const dir = makeSandbox()
    const r = runScript(dir, 'scripts/press-lab-pipeline.sh', {
      PRESS_LAB_NO_REMOTE: '1',
      STUB_HOLD_LOCK_ON: 'audit-press-links',
      STUB_HOLD_LOCK_SECS: '4',
      CRON_GIT_LOCK_ESPERA: '2',
    })

    // Las condiciones del reproductor estaban REALMENTE puestas. Sin esto, un
    // verde significaría «el lock nunca se tomó», que es el falso limpio de
    // siempre.
    expect(r.log, 'ningún paso corrió').toContain('[stub] ran ')
    expect(r.log, 'el lock nunca se llegó a tomar').toContain('tomó .git/index.lock')
    expect(r.log, 'no hubo reintento: o no chocó, o se rindió a la primera').toMatch(
      /index\.lock tomado por otro proceso — reintento/,
    )

    // Y el trabajo se publicó igualmente.
    expect(r.committed, 'la pasada no llegó a comitear').not.toEqual([])
    expect(r.committed).toContain('public/data/press-link-rot.json')
  }, 120_000)

  it('si el lock no se suelta, lo dice y deja el trabajo en el árbol', () => {
    // Reintentar no puede convertirse en esperar para siempre: un index.lock
    // huérfano de un git que murió no se suelta nunca, y un cron colgado toda
    // la noche es peor que uno que falla a las nueve de la mañana. Se agotan
    // los intentos, se dice en voz alta, y lo generado NO se descarta.
    const dir = makeSandbox()
    const r = runScript(dir, 'scripts/press-lab-pipeline.sh', {
      PRESS_LAB_NO_REMOTE: '1',
      STUB_HOLD_LOCK_ON: 'audit-press-links',
      STUB_HOLD_LOCK_SECS: '600',
      CRON_GIT_LOCK_REINTENTOS: '2',
      CRON_GIT_LOCK_ESPERA: '1',
    })

    expect(r.log, 'el lock nunca se llegó a tomar').toContain('tomó .git/index.lock')
    expect(r.log, 'ni siquiera lo intentó').toMatch(/index\.lock tomado por otro proceso/)
    expect(r.log, 'se rindió sin decir que se rendía').toMatch(/seguía tomado tras \d+ intento/)
    expect(r.committed, 'comiteó con el índice bloqueado, lo cual es imposible').toEqual([])
    // Lo que la pasada generó sigue donde estaba: el árbol de trabajo.
    const sucio = git(dir, 'status', '--porcelain', '--', 'public/data')
    expect(sucio, 'la pasada perdió su trabajo además de no publicarlo').toContain(
      'press-link-rot.json',
    )
  }, 120_000)
})
