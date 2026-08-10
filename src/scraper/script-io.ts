/**
 * Which snapshots does a pipeline script actually read and write?
 *
 * This exists so `data-graph.ts` can be *checked* rather than believed. A
 * hand-written dependency list is a restated shape, and a restated shape
 * silently drifts from the thing it restates — `DATA_INTEGRITY.md` rule 1, the
 * costliest defect class in this repo's history. The graph declares the edges;
 * this reads the edges back out of the source; a check compares them.
 *
 * It is a lexical scan, not a type-aware one, and that is a deliberate
 * trade-off: a real parser would resolve more paths but would also make the
 * check hard to reason about at the moment it fails. What matters far more is
 * that it **admits what it could not read**. A scan that finds nothing in a
 * 300-line script has not proven the script has no inputs; `analysed: false`
 * says so, and the check treats that as a failure rather than a pass.
 */

/** `public/data/<name>.json`, the only namespace the graph talks about. */
const DATA_FILE = /['"`]([a-z0-9][a-z0-9._-]*\.json)['"`]/gi
const DATA_PATH = /['"`]public\/data\/([a-z0-9][a-z0-9._-]*\.json)['"`]/gi

/**
 * `const FOO = …'x.json'` in any of the shapes this repo actually uses:
 * `resolve(DATA, 'x.json')`, `resolve(DATA_DIR, 'x.json')`,
 * `join(PROJECT_ROOT, 'public/data/x.json')`, or a bare string constant.
 * The directory argument is whatever identifier the file happens to use —
 * pinning it to `DATA` missed `compute-entities` entirely.
 */
const BINDING =
  /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:(?:resolve|join)\()?\s*(?:[A-Za-z_$][\w$]*\s*,\s*)?['"`](?:[^'"`]*\/)?([a-z0-9][a-z0-9._-]*\.json)['"`]/gi

/** `const findingsPath = resolve(FINDINGS)` — one const pointing at another. */
const ALIAS_BINDING =
  /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:resolve|join)\(\s*([A-Za-z_$][\w$]*)\s*\)/g

const READ_FNS = [
  'readFileSync',
  'readFile',
  'readJsonIfExists',
  'readJson',
  'loadJson',
  'loadIfExists',
]
// `write` is a local helper name in more than one pipeline script. It also
// matches `process.stdout.write(...)`, whose first argument is never a
// snapshot path, so the false positive resolves to null and costs nothing.
// `writeFileSync` is listed separately because `\bwrite\s*\(` does not match it.
const WRITE_FNS = ['writeFileSync', 'writeFile', 'writeJson', 'write']

/**
 * `const PATHS = { press: resolve(DATA, 'press.json'), … }` — an object of
 * paths, then `readJson(PATHS.press)`. Common enough here to be worth
 * resolving; anything more indirect than this gets an explicit marker instead
 * of a cleverer regex nobody can debug at 3am.
 */
const OBJECT_BINDING =
  /\b([A-Za-z_$][\w$]*)\s*:\s*(?:await\s+)?(?:resolve|join)\(\s*(?:[A-Za-z_$][\w$]*\s*,\s*)?['"`](?:[^'"`]*\/)?([a-z0-9][a-z0-9._-]*\.json)['"`]/gi

/**
 * The full first argument of every call to one of `names`, with nested parens
 * balanced.
 *
 * A regex that stops at the first comma or paren truncates
 * `readJsonIfExists(resolve(DATA, 'streets.json'))` to `resolve(DATA` and loses
 * the filename — which is how the first version of this scan reported four of
 * `compute-tender-geo`'s six inputs as unclassifiable.
 */
function firstArgsOf(src: string, names: readonly string[]): string[] {
  const out: string[] = []
  const call = new RegExp(`\\b(?:${names.join('|')})\\s*\\(`, 'g')
  for (const m of src.matchAll(call)) {
    let depth = 1
    let i = m.index + m[0].length
    const start = i
    while (i < src.length && depth > 0) {
      const c = src[i]
      if (c === '(') depth += 1
      else if (c === ')') depth -= 1
      i += 1
    }
    const inner = src.slice(start, i - 1)
    // Only the first argument: split on a comma at depth 0.
    let d = 0
    let cut = inner.length
    for (let j = 0; j < inner.length; j++) {
      const c = inner[j]
      if (c === '(' || c === '[' || c === '{') d += 1
      else if (c === ')' || c === ']' || c === '}') d -= 1
      else if (c === ',' && d === 0) {
        cut = j
        break
      }
    }
    out.push(inner.slice(0, cut))
  }
  return out
}

/**
 * An explicit escape hatch for a path this scan cannot see — one built by
 * concatenation, or reached through a helper in another module:
 *
 *     // data-graph: reads pleno-transcripts/
 *     // data-graph: writes tender-geo.json
 *
 * Declaring it in a comment is not as good as the code being readable, but it
 * is far better than the check quietly passing over it.
 */
const MARKER = /\/\/\s*data-graph:\s*(reads|writes)\s+(\S+)/gi

export interface ScriptIo {
  reads: string[]
  writes: string[]
  /**
   * False when the scan found no data paths at all. A script that genuinely
   * touches none is rare; far likelier is that it builds its paths in a way
   * this scan cannot follow, and the caller must not read the empty result as
   * "no dependencies".
   */
  analysed: boolean
  /** Paths seen but not classifiable as read or write. Reported, not guessed. */
  unclassified: string[]
}

/**
 * Resolve the identifiers a source file binds to snapshot paths, so
 * `readFileSync(OFFICIALS_PATH)` can be attributed to `officials.json`.
 */
function bindings(src: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of src.matchAll(BINDING)) out.set(m[1], m[2])
  // Object members are keyed by their property name, so `PATHS.press` and
  // `OTHER.press` both resolve. Ambiguity is acceptable: these are file paths
  // in a 200-line script, not a symbol table.
  for (const m of src.matchAll(OBJECT_BINDING)) out.set(m[1], m[2])
  // Chase one-const-to-another aliases until nothing new resolves. Bounded by
  // the binding count, so a circular alias cannot spin.
  for (let pass = 0; pass < out.size + 1; pass++) {
    let grew = false
    for (const m of src.matchAll(ALIAS_BINDING)) {
      if (!out.has(m[1]) && out.has(m[2])) {
        out.set(m[1], out.get(m[2]) as string)
        grew = true
      }
    }
    if (!grew) break
  }
  return out
}

/** The snapshot a call argument refers to, via a binding or a literal. */
function targetOf(arg: string, binds: Map<string, string>): string | null {
  const trimmed = arg.trim()
  const lit = /['"`](?:public\/data\/)?([a-z0-9][a-z0-9._-]*\.json)['"`]/i.exec(trimmed)
  if (lit) return lit[1]
  // `PATHS.press` → the `press:` member; `OFFICIALS_PATH` → the const.
  const member = /^[A-Za-z_$][\w$]*\.([A-Za-z_$][\w$]*)/.exec(trimmed)?.[1]
  if (member && binds.has(member)) return binds.get(member) as string
  const ident = /^[A-Za-z_$][\w$]*/.exec(trimmed)?.[0]
  if (ident && binds.has(ident)) return binds.get(ident) as string
  return null
}

export function analyseScriptIo(src: string): ScriptIo {
  const binds = bindings(src)
  const reads = new Set<string>()
  const writes = new Set<string>()
  const seen = new Set<string>()

  for (const m of src.matchAll(DATA_PATH)) seen.add(m[1])
  for (const m of src.matchAll(DATA_FILE)) seen.add(m[1])
  for (const v of binds.values()) seen.add(v)

  for (const arg of firstArgsOf(src, WRITE_FNS)) {
    const t = targetOf(arg, binds)
    if (t) writes.add(t)
  }
  for (const arg of firstArgsOf(src, READ_FNS)) {
    const t = targetOf(arg, binds)
    if (t) reads.add(t)
  }
  for (const m of src.matchAll(MARKER)) {
    seen.add(m[2])
    ;(m[1].toLowerCase() === 'writes' ? writes : reads).add(m[2])
  }

  // A path the script mentions but that no read/write call could be tied to.
  // Usually a helper indirection. Surfaced so a human decides, rather than
  // being silently dropped into `reads` on a guess.
  const unclassified = [...seen].filter((p) => !reads.has(p) && !writes.has(p)).sort()

  return {
    reads: [...reads].sort(),
    writes: [...writes].sort(),
    analysed: seen.size > 0,
    unclassified,
  }
}
