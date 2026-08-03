/**
 * The bookkeeping behind `check:guards`: is each guard invoked, exercised by a
 * test, and proven to fire on its own fault?
 *
 * Pure. `scripts/check-guards.ts` owns the filesystem, the `git` calls and the
 * actual corruption; this owns the three questions that have a wrong answer
 * available — and the last time one was answered by hand it was wrong by 4×.
 */

/**
 * Does `body` invoke this guard?
 *
 * The boundary matters more than it looks. `check:transcripts` must not match
 * inside `check:transcription-health`, and a guard named as a prefix of another
 * would otherwise report itself wired everywhere the longer one is.
 */
export function invokesGuard(body: string, guard: string): boolean {
  return new RegExp(`\\b${guard.replace(':', '\\:')}\\b(?![:\\w-])`).test(body)
}

export function wiringFor(guard: string, sites: Map<string, string>): string[] {
  const hits: string[] = []
  for (const [path, body] of sites) if (invokesGuard(body, guard)) hits.push(path)
  return hits
}

/** `from '../src/foo/bar'` → `src/foo/bar`, extension stripped. */
export function importedModules(scriptSource: string): string[] {
  return [...scriptSource.matchAll(/from ['"]\.\.\/(src\/[^'"]+)['"]/g)].map((m) =>
    m[1].replace(/\.(ts|js)$/, ''),
  )
}

/**
 * The script files an npm command actually runs.
 *
 * Returns more than one because a guard can be a shell orchestrator: `check:corpus`
 * is `bash scripts/verify-transcript-corpus.sh`, which runs `scripts/corpus-delta.ts`,
 * which is where the logic lives. Stopping at the `.sh` reported the guard as
 * untested when its arithmetic has ten tests — the same off-by-a-layer mistake
 * as grepping for the guard's name.
 */
export function scriptTargets(
  npmCommand: string,
  readFile: (p: string) => string | null,
): string[] {
  const seen = new Set<string>()
  const queue: string[] = []
  const push = (p: string) => {
    if (p && !seen.has(p)) {
      seen.add(p)
      queue.push(p)
    }
  }
  for (const m of npmCommand.matchAll(/(?:tsx|node|bash|sh)\s+(scripts\/[^\s]+)/g)) push(m[1])

  const out: string[] = []
  while (queue.length) {
    const p = queue.shift()!
    out.push(p)
    if (!/\.(sh|bash)$/.test(p)) continue
    const body = readFile(p)
    if (!body) continue
    for (const m of body.matchAll(/(?:tsx|node)\s+(scripts\/[^\s"']+)/g)) push(m[1])
  }
  return out
}

/**
 * Which tests exercise a guard, resolved through the MODULE GRAPH, not by name.
 *
 * A grep for the guard's name answers a different question and answers it
 * wrongly: it said 12 of 13 guards had no test when 10 of 15 do. The reason is
 * that `scripts/check-relations.ts` is a thin CLI whose logic lives in
 * `src/scraper/relations-check.ts`, and the test imports the MODULE — never the
 * script, never the npm-script name.
 *
 * Each hit says whether it is `direct` or `via <module>`, because a bare tick
 * would overstate: `quote-match` is shared by three guards, so any test of it
 * would make all three look covered.
 */
export function testsForScript(
  scriptSource: string,
  scriptPathNoExt: string,
  tests: Map<string, string>,
): string[] {
  const modules = importedModules(scriptSource)
  const hits: string[] = []
  for (const [name, body] of tests) {
    if (body.includes(scriptPathNoExt)) {
      hits.push(`${name} (direct)`)
      continue
    }
    const via = modules.find((m) => body.includes(m))
    if (via) hits.push(`${name} (via ${via.split('/').pop()})`)
  }
  return hits
}

/**
 * Three states, not two — the same shape as `check:citations`'s
 * alive/dead/unverifiable.
 *
 * «No injection» used to cover both "nobody has written one" and "nobody can
 * write one here", which reads as negligence in the second case and as coverage
 * in neither. A guard that needs an embedding backend to fail is not the same
 * as a guard nobody got round to.
 */
export type InjectionState =
  | 'proven' // injected; the guard exited non-zero
  | 'silent' // injected; the guard did NOT notice — a real defect
  | 'not-run' // an injection exists but this run could not use it
  | 'undefined' // none written, no reason given
  | 'not-injectable' // deliberately none, with a stated reason

export interface InjectionVerdict {
  state: InjectionState
  detail: string
}

export function classifyInjection(input: {
  hasInjection: boolean
  fired: boolean | null
  note?: string
  notInjectableReason?: string
}): InjectionVerdict {
  if (input.hasInjection) {
    if (input.fired === true) return { state: 'proven', detail: 'FIRES' }
    if (input.fired === false) return { state: 'silent', detail: '⚠ SILENT on its own fault' }
    return { state: 'not-run', detail: input.note ?? 'not exercised this run' }
  }
  if (input.notInjectableReason) {
    return { state: 'not-injectable', detail: input.notInjectableReason }
  }
  return { state: 'undefined', detail: 'ninguna definida' }
}

export interface GuardSummary {
  total: number
  notInvoked: number
  untested: number
  proven: number
  silent: number
  notRun: number
  undefinedInjection: number
  notInjectable: number
}

export function summarise(
  rows: Array<{ wiredIn: string[]; testedBy: string[]; verdict: InjectionVerdict }>,
): GuardSummary {
  const count = (s: InjectionState) => rows.filter((r) => r.verdict.state === s).length
  return {
    total: rows.length,
    notInvoked: rows.filter((r) => r.wiredIn.length === 0).length,
    untested: rows.filter((r) => r.testedBy.length === 0).length,
    proven: count('proven'),
    silent: count('silent'),
    notRun: count('not-run'),
    undefinedInjection: count('undefined'),
    notInjectable: count('not-injectable'),
  }
}

/**
 * Only a guard that is unwired, or that stayed silent on its own injected
 * fault, is a failure. A missing test or a missing injection is REPORTED —
 * making either fatal would be a policy change, and a guard audit that blocks
 * the pipeline on its own to-do list is one people delete.
 */
export function auditFails(s: GuardSummary): boolean {
  return s.notInvoked > 0 || s.silent > 0
}
