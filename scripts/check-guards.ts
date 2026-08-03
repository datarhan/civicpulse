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
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  auditFails,
  classifyInjection,
  summarise,
  scriptTargets,
  testsForScript,
  wiringFor,
  type InjectionVerdict,
} from '../src/scraper/guard-audit'

interface GuardRow {
  name: string
  wiredIn: string[]
  /** Test files that import a module this guard's script depends on. */
  testedBy: string[]
  /** null = not exercised this run */
  firesOnFault: boolean | null
  injection?: string
  note?: string
  verdict?: InjectionVerdict
}

/**
 * Guards with no injection, and why there cannot be one HERE.
 *
 * The distinction this table exists for: «nobody wrote one» and «nobody can
 * write one from a nightly» are different facts, and collapsing them makes the
 * first look excusable and the second look like negligence. Anything not listed
 * here and not in INJECTIONS is reported as a genuine to-do.
 */
const NOT_INJECTABLE: Record<string, string> = {
  'check:retrieval':
    'necesita reconstruir un corpus de embeddings (backend medido) para fallar de verdad',
  'check:corpus':
    'es un orquestador: inyecta sus partes (check:transcripts, check:finding-quotes) por separado',
  'check:guards': 'es este mismo script — inyectarse a sí mismo no prueba nada',
  'check:transcription-health':
    'su fallo es el paso del TIEMPO (días sin avance), no un fichero corrupto',
  'check:runs':
    'lee .run-manifests/, que está en .gitignore — y este arnés restaura con git, así que no podría deshacer el daño',
  'check:vocabulary':
    'su fallo es que aparezca vocabulario NUEVO, y cualquier valor que inventemos aquí es exactamente eso: la inyección se probaría a sí misma',
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

const readIfExists = (p: string): string | null => {
  const abs = resolve(ROOT, p)
  return existsSync(abs) ? readFileSync(abs, 'utf8') : null
}

/**
 * Reads every script an npm command reaches — following a shell orchestrator to
 * the tsx files it runs — then defers to the pure resolver in `guard-audit`.
 */
function testsForGuard(npmCommand: string, tests: Map<string, string>): string[] {
  const hits = new Set<string>()
  for (const target of scriptTargets(npmCommand, readIfExists)) {
    const body = readIfExists(target)
    if (!body || /\.(sh|bash)$/.test(target)) continue
    for (const h of testsForScript(body, target.replace(/\.(ts|js)$/, ''), tests)) hits.add(h)
  }
  return [...hits]
}

function testFiles(): Map<string, string> {
  const dir = resolve(ROOT, 'tests')
  const out = new Map<string, string>()
  if (!existsSync(dir)) return out
  for (const f of readdirSync(dir)) {
    if (!/\.test\.(ts|js|jsx)$/.test(f)) continue
    const p = resolve(dir, f)
    if (statSync(p).isFile()) out.set(f, readFileSync(p, 'utf8'))
  }
  return out
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
    describe: 'a published finding pointing at a claim id that does not exist',
    corrupt: (s) => {
      const d = JSON.parse(s)
      const f = d.items.find((x: { sourceClaimIds?: string[] }) => Array.isArray(x.sourceClaimIds))
      if (!f) throw new Error('no finding with sourceClaimIds to corrupt')
      f.sourceClaimIds.push('c-injected-nonexistent')
      return JSON.stringify(d, null, 2) + '\n'
    },
  },
  {
    guard: 'check:finding-quotes',
    file: 'public/data/pleno-findings.json',
    describe: 'a verbatim quote nobody ever said',
    corrupt: (s) => {
      const d = JSON.parse(s)
      const f = d.items.find(
        (x: { quotes?: Array<{ text?: string }> }) => x.quotes && x.quotes.length > 0,
      )
      if (!f) throw new Error('no finding with quotes to corrupt')
      f.quotes[0].text =
        'Esta frase no la pronunció nadie en ningún pleno de este municipio, jamás.'
      return JSON.stringify(d, null, 2) + '\n'
    },
  },
  {
    guard: 'check:cadence',
    file: 'public/data/tenders.json',
    describe: 'un snapshot fechado hace dos años — la forma exacta del cron congelado',
    // The three-act freeze saga: a scraper stops, the file stays, and every
    // semantic check keeps passing over stale data.
    corrupt: (s) => {
      const d = JSON.parse(s)
      d.generatedAt = new Date(Date.parse(d.generatedAt ?? '2026-01-01') - 730 * 86_400_000)
        .toISOString()
        .replace(/\.\d+Z$/, 'Z')
      return JSON.stringify(d, null, 2) + '\n'
    },
  },
  {
    guard: 'check:drift',
    file: 'public/data/reportajes/reconstruccion-dana.json',
    describe: 'una cifra congelada multiplicada por diez',
    // The 2026-08-02 incident in reverse: prose left behind by a data fix.
    corrupt: (s) => {
      const d = JSON.parse(s)
      if (typeof d?.totals?.totalAwarded !== 'number') throw new Error('sin totals.totalAwarded')
      d.totals.totalAwarded = d.totals.totalAwarded * 10
      return JSON.stringify(d, null, 2) + '\n'
    },
  },
  {
    guard: 'check:finding-entities',
    file: 'public/data/pleno-findings.json',
    describe: 'un hallazgo que afirma como registro una empresa que no consta en ningún dato',
    // The motivating shape, verbatim: «según el registro municipal … la empresa
    // FCC», where FCC appeared in zero of 1,231 contract rows. The trigger is
    // the ASSERTION phrase (empresa/mercantil/adjudicataria), not any mention of
    // a company — a first attempt at this injection said «adjudicado a X» and
    // the guard stayed silent, correctly: that is not the defect it watches.
    corrupt: (s) => {
      const d = JSON.parse(s)
      const f = d.items?.[0]
      if (!f) throw new Error('sin hallazgos que corromper')
      f.summary =
        `${f.summary ?? ''} Según el registro municipal, la empresa Inventadadelturia ` +
        `ejecutó las obras.`
      return JSON.stringify(d, null, 2) + '\n'
    },
  },
  {
    guard: 'check:transcripts',
    file: 'public/data/pleno-transcripts/yhp4sc.txt',
    describe: 'un transcript que se convierte en un bucle — la firma de Whisper alucinando',
    // The real shape: whisper-1 fed a multi-hour file loops one phrase for
    // thousands of lines. That published 7% of a pleno as if it were the whole
    // session (postmortem 9dd8f07).
    corrupt: () =>
      `${'Muchas gracias, señor alcalde.\n'.repeat(4000)}Y con esto levantamos la sesión.\n`,
  },
  {
    guard: 'check:automation',
    file: '.automation-measurements.json',
    describe: 'una medición de precisión caducada — el permiso para publicar solo, vencido',
    // Tier B is autonomous only while a RECORDED precision is current. Letting
    // a measurement expire unnoticed is how an unmeasured class keeps
    // publishing on the strength of a number nobody re-took.
    corrupt: (s) => {
      const d = JSON.parse(s)
      const rows = Array.isArray(d) ? d : (d.measurements ?? [])
      if (!rows.length) throw new Error('sin mediciones que caducar')
      const old = new Date(Date.now() - 400 * 86_400_000).toISOString()
      for (const m of rows) m.measuredAt = old
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

  const tests = testFiles()
  const rows: GuardRow[] = guards.map((g) => {
    const wiredIn = wiringFor(g, sites).map((p) => p.replace(`${ROOT}/`, ''))
    const testedBy = testsForGuard(pkg.scripts[g] as string, tests)
    return { name: g, wiredIn, testedBy, firesOnFault: null }
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

  // `hasInjection` is a static fact about the INJECTIONS table, NOT about
  // whether this run exercised it. Deriving it from `r.injection` — which is
  // only populated under --inject — made every guard report "no injection" on
  // a plain wiring run, so four written injections read as four missing ones.
  const defined = new Set(INJECTIONS.map((i) => i.guard))
  for (const r of rows) {
    r.verdict = classifyInjection({
      hasInjection: defined.has(r.name),
      fired: r.firesOnFault,
      note: r.note ?? (inject ? undefined : 'definida; ejecuta con --inject para probarla'),
      notInjectableReason: NOT_INJECTABLE[r.name],
    })
  }
  const stats = summarise(rows.map((r) => ({ ...r, verdict: r.verdict! })))

  if (asJson) {
    out(JSON.stringify({ guards: rows, injected: inject, stats }, null, 2))
    return
  }

  const orphans = rows.filter((r) => r.wiredIn.length === 0)
  const untested = rows.filter((r) => r.testedBy.length === 0)
  const w = Math.max(...rows.map((r) => r.name.length))
  out('[check:guards] wiring — where is each guard actually invoked?\n')
  for (const r of rows) {
    const where = r.wiredIn.length ? r.wiredIn.join(', ') : '⚠ NOT INVOKED ANYWHERE'
    out(`  ${r.name.padEnd(w)}  ${where}`)
  }

  out('\n[check:guards] tests — does anything exercise its logic?\n')
  for (const r of rows) {
    out(`  ${r.name.padEnd(w)}  ${r.testedBy.length ? r.testedBy.join(', ') : '⚠ NO TEST'}`)
  }

  // Injection coverage is reported in THREE states, always — not only under
  // --inject. Before, a guard with no injection and a guard nobody can inject
  // from a nightly printed the same undifferentiated line, which reads as
  // negligence in one case and as coverage in neither.
  out('\n[check:guards] dientes — ¿salta cuando su propio fallo está presente?\n')
  for (const r of rows) {
    const v = r.verdict!
    const label =
      v.state === 'proven'
        ? 'FIRES'
        : v.state === 'silent'
          ? '⚠ SILENT'
          : v.state === 'not-run'
            ? `— ${v.detail}`
            : v.state === 'not-injectable'
              ? 'sin inyección, a propósito'
              : '⚠ sin inyección'
    out(`  ${r.name.padEnd(w)}  ${label}`)
    if (r.injection) out(`  ${' '.repeat(w)}  inyectado: ${r.injection}`)
    else if (v.state === 'not-injectable') out(`  ${' '.repeat(w)}  ${v.detail}`)
  }
  if (!inject) {
    out('\n  (auditoría de cableado — con --inject además rompe cosas y mira si gritan)')
  }

  const silent = rows.filter((r) => r.verdict!.state === 'silent')
  out()
  out(
    `${stats.total} guarda(s) · ${stats.notInvoked} sin invocar · ${stats.untested} sin test · ` +
      `${inject ? `${stats.proven} probada(s)` : 'dientes sin probar'} · ` +
      `${stats.undefinedInjection} sin inyección · ${stats.notInjectable} no inyectable(s) con motivo`,
  )

  if (untested.length) {
    out(`SIN TEST (se informa, no falla): ${untested.map((r) => r.name).join(', ')}`)
  }
  const toWrite = rows.filter((r) => r.verdict!.state === 'undefined').map((r) => r.name)
  if (toWrite.length) {
    out(
      `SIN INYECCIÓN, PENDIENTE DE ESCRIBIR: ${toWrite.join(', ')}\n` +
        '  Añádela a INJECTIONS, o a NOT_INJECTABLE con el motivo — pero no la des por buena.',
    )
  }
  if (auditFails(stats)) {
    if (orphans.length) out(`\nSIN INVOCAR: ${orphans.map((r) => r.name).join(', ')}`)
    if (silent.length) out(`MUDA ANTE SU PROPIO FALLO: ${silent.map((r) => r.name).join(', ')}`)
    process.exit(1)
  }
}

main()
