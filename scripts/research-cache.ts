/**
 * cache:research — look inside `.research-cache/`, and clear parts of it.
 *
 * Until now the only remedy for a poisoned entry was `rm -rf .research-cache`,
 * which throws away every polite fetch the project has ever made in order to
 * fix one of them. That is a bad trade and it made nobody look: the directory
 * sat there for months holding 21 empty biography searches and one stored
 * `error`, and nothing in the repo could say so.
 *
 * The TTL in `src/scraper/research-cache-policy.ts` is the fix; this is the
 * window onto it. Both read the SAME `decideCacheRead`, so what this prints as
 * "expired" is what the agent will treat as a miss — not a re-implementation of
 * the rule that could drift from it.
 *
 *   npm run cache:research                          # report
 *   npm run cache:research -- --list                # one line per entry
 *   npm run cache:research -- --json
 *   npm run cache:research -- clear --expired       # DRY RUN: prints, deletes nothing
 *   npm run cache:research -- clear --expired --yes
 *   npm run cache:research -- clear --errors --yes
 *   npm run cache:research -- clear --empty --yes
 *   npm run cache:research -- clear --tool webSearch --yes
 *   npm run cache:research -- clear --older-than 168 --yes
 *   npm run cache:research -- clear --all --yes
 *
 * `clear` is dry-run unless `--yes` is passed, and refuses to run with no
 * selector at all. Deleting a cache entry is not dangerous the way deleting a
 * snapshot is — the worst case is a re-fetch — but it does mean asking somebody
 * else's server for something we already had, so it should be deliberate.
 */
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  DEFAULT_TTL_HOURS,
  TOOL_TTL_HOURS,
  classifyPayload,
  decideCacheRead,
  hasExplicitTtl,
  inferToolCandidates,
  type PayloadClass,
  type PayloadShape,
} from '../src/scraper/research-cache-policy'

const CACHE_DIR = resolve('.research-cache')

type Verdict = 'expired' | 'fresh' | 'ambiguous'

interface Row {
  file: string
  bytes: number
  fetchedAt: string | null
  ageHours: number | null
  klass: PayloadClass | 'unreadable'
  shape: PayloadShape | null
  detail: string
  /** Tool recorded in the entry, or null for an entry written before that field. */
  recordedTool: string | null
  /** Tools that could have written it. One element ⇒ determined. */
  candidates: string[]
  /** TTLs the candidates imply, for the row's own class. */
  ttlHours: number[]
  verdict: Verdict
}

// ─── Reading the directory ─────────────────────────────────────────────────

function loadRows(nowMs: number): Row[] {
  if (!existsSync(CACHE_DIR)) return []
  const rows: Row[] = []
  for (const file of readdirSync(CACHE_DIR)) {
    if (!file.endsWith('.json')) continue
    const path = join(CACHE_DIR, file)
    const bytes = statSync(path).size
    let entry: { fetchedAt?: unknown; payload?: unknown; tool?: unknown }
    try {
      entry = JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      rows.push({
        file,
        bytes,
        fetchedAt: null,
        ageHours: null,
        klass: 'unreadable',
        shape: null,
        detail: 'not valid JSON',
        recordedTool: null,
        candidates: [],
        ttlHours: [],
        // Unparseable entries can never be served, so they are already dead
        // weight — reporting them as expired is what makes `clear --expired`
        // able to sweep them.
        verdict: 'expired',
      })
      continue
    }

    const recordedTool = typeof entry.tool === 'string' ? entry.tool : null
    const candidates = recordedTool ? [recordedTool] : inferToolCandidates(entry.payload)
    const decisions = candidates.map((tool) =>
      decideCacheRead({ tool, fetchedAt: entry.fetchedAt, payload: entry.payload, nowMs }),
    )
    const anyFresh = decisions.some((d) => d.use)
    const anyStale = decisions.some((d) => !d.use)
    const verdict: Verdict = anyFresh && anyStale ? 'ambiguous' : anyFresh ? 'fresh' : 'expired'
    const first = decisions[0]

    rows.push({
      file,
      bytes,
      fetchedAt: typeof entry.fetchedAt === 'string' ? entry.fetchedAt : null,
      ageHours: first?.ageHours ?? null,
      klass: first?.classification.klass ?? classifyPayload(entry.payload).klass,
      shape: first?.classification.shape ?? classifyPayload(entry.payload).shape,
      detail: first?.classification.detail ?? '',
      recordedTool,
      candidates,
      ttlHours: decisions.map((d) => d.ttlHours),
      verdict,
    })
  }
  return rows
}

// ─── Report ────────────────────────────────────────────────────────────────

const AGE_BUCKETS: Array<{ label: string; maxHours: number }> = [
  { label: '< 6h', maxHours: 6 },
  { label: '6–24h', maxHours: 24 },
  { label: '1–3d', maxHours: 72 },
  { label: '3–7d', maxHours: 168 },
  { label: '7–30d', maxHours: 720 },
  { label: '> 30d', maxHours: Infinity },
]

function bucketFor(ageHours: number | null): string {
  if (ageHours === null) return 'undated'
  for (const b of AGE_BUCKETS) if (ageHours < b.maxHours) return b.label
  return '> 30d'
}

function tally<T extends string>(values: T[]): Array<[T, number]> {
  const m = new Map<T, number>()
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

function pct(n: number, total: number): string {
  return total === 0 ? '0%' : `${Math.round((n / total) * 100)}%`
}

function report(rows: Row[], nowMs: number, opts: { list: boolean }): void {
  const out = process.stdout
  const total = rows.length

  if (total === 0) {
    out.write(
      `[cache:research] ${CACHE_DIR} — no entries` +
        (existsSync(CACHE_DIR) ? '\n' : ' (directory does not exist)\n'),
    )
    return
  }

  const dated = rows.filter((r) => r.fetchedAt).map((r) => r.fetchedAt as string)
  const oldest = dated.reduce((a, b) => (a < b ? a : b))
  const newest = dated.reduce((a, b) => (a > b ? a : b))
  const totalBytes = rows.reduce((s, r) => s + r.bytes, 0)

  out.write(`[cache:research] ${CACHE_DIR}\n`)
  out.write(
    `  ${total} entr${total === 1 ? 'y' : 'ies'} · ${(totalBytes / 1024 / 1024).toFixed(2)} MB · ` +
      `oldest ${oldest} · newest ${newest}\n`,
  )
  out.write(`  clock: ${new Date(nowMs).toISOString()}\n`)

  // ── classification ──
  out.write('\n  Contents\n')
  const errors = rows.filter((r) => r.klass === 'error')
  const empties = rows.filter((r) => r.klass === 'empty')
  const populated = rows.filter((r) => r.klass === 'populated')
  const unreadable = rows.filter((r) => r.klass === 'unreadable')
  out.write(
    `    populated   ${String(populated.length).padStart(4)}  (${pct(populated.length, total)})\n`,
  )
  out.write(
    `    empty       ${String(empties.length).padStart(4)}  (${pct(empties.length, total)})\n`,
  )
  out.write(
    `    error       ${String(errors.length).padStart(4)}  (${pct(errors.length, total)})\n`,
  )
  if (unreadable.length > 0) {
    out.write(`    unreadable  ${String(unreadable.length).padStart(4)}\n`)
  }

  // Empties broken out by shape: an empty search and a fetch that produced no
  // body are both "empty" but they are not the same claim, so do not blur them.
  if (empties.length > 0) {
    out.write('    empty by shape:\n')
    for (const [shape, n] of tally(empties.map((r) => r.shape ?? 'null'))) {
      out.write(`      ${String(shape).padEnd(10)} ${String(n).padStart(4)}\n`)
    }
  }

  // ── age ──
  out.write('\n  Age\n')
  const buckets = new Map<string, number>()
  for (const r of rows)
    buckets.set(bucketFor(r.ageHours), (buckets.get(bucketFor(r.ageHours)) ?? 0) + 1)
  for (const b of [...AGE_BUCKETS.map((x) => x.label), 'undated']) {
    const n = buckets.get(b) ?? 0
    if (n === 0) continue
    out.write(`    ${b.padEnd(8)} ${String(n).padStart(4)}\n`)
  }

  // ── per tool ──
  out.write('\n  By tool (⟨inferred⟩ = written before entries recorded their tool)\n')
  const byTool = new Map<
    string,
    { total: number; expired: number; empty: number; error: number; inferred: number }
  >()
  for (const r of rows) {
    const key =
      r.candidates.length === 0
        ? '⟨unreadable⟩'
        : r.candidates.length === 1
          ? r.candidates[0]
          : `⟨${r.shape ?? '?'}: ${r.candidates.length} candidates⟩`
    const cur = byTool.get(key) ?? { total: 0, expired: 0, empty: 0, error: 0, inferred: 0 }
    cur.total++
    if (r.verdict === 'expired') cur.expired++
    if (r.klass === 'empty') cur.empty++
    if (r.klass === 'error') cur.error++
    if (!r.recordedTool) cur.inferred++
    byTool.set(key, cur)
  }
  const width = Math.max(...[...byTool.keys()].map((k) => k.length))
  for (const [tool, s] of [...byTool.entries()].sort((a, b) => b[1].total - a[1].total)) {
    const ttl = hasExplicitTtl(tool)
      ? `ttl ${TOOL_TTL_HOURS[tool].populated}h/${TOOL_TTL_HOURS[tool].empty}h`
      : byTool.size > 0 && tool.startsWith('⟨')
        ? 'ttl varies'
        : `ttl ${DEFAULT_TTL_HOURS.populated}h/${DEFAULT_TTL_HOURS.empty}h (default)`
    out.write(
      `    ${tool.padEnd(width)}  ${String(s.total).padStart(4)} total · ` +
        `${String(s.empty).padStart(3)} empty · ${String(s.error).padStart(2)} error · ` +
        `${String(s.expired).padStart(4)} expired · ${ttl}` +
        `${s.inferred === s.total ? ' · inferred' : ''}\n`,
    )
  }

  // ── verdict ──
  const expired = rows.filter((r) => r.verdict === 'expired')
  const fresh = rows.filter((r) => r.verdict === 'fresh')
  const ambiguous = rows.filter((r) => r.verdict === 'ambiguous')
  out.write('\n  Against the current TTL policy\n')
  out.write(
    `    expired    ${String(expired.length).padStart(4)}  (${pct(expired.length, total)}) — the next call re-fetches\n`,
  )
  out.write(
    `    fresh      ${String(fresh.length).padStart(4)}  (${pct(fresh.length, total)}) — still served from cache\n`,
  )
  if (ambiguous.length > 0) {
    out.write(
      `    ambiguous  ${String(ambiguous.length).padStart(4)}  — legacy entry whose verdict ` +
        `depends on which tool wrote it; reported rather than guessed\n`,
    )
  }
  const expiredEmpty = expired.filter((r) => r.klass === 'empty').length
  const expiredError = expired.filter((r) => r.klass === 'error').length
  out.write(
    `    of those expired: ${expiredEmpty} empt${expiredEmpty === 1 ? 'y' : 'ies'}, ` +
      `${expiredError} error(s)\n`,
  )
  const survivingEmpty = rows.filter((r) => r.klass === 'empty' && r.verdict !== 'expired').length
  const survivingError = rows.filter((r) => r.klass === 'error' && r.verdict !== 'expired').length
  out.write(
    `    still-believed empties: ${survivingEmpty} · still-believed errors: ${survivingError}\n`,
  )

  if (opts.list) {
    out.write('\n  Entries\n')
    const sorted = [...rows].sort((a, b) => (a.fetchedAt ?? '').localeCompare(b.fetchedAt ?? ''))
    for (const r of sorted) {
      const tool = r.recordedTool ?? `${r.candidates.join('|')}?`
      out.write(
        `    ${r.verdict.padEnd(9)} ${(r.fetchedAt ?? 'undated').slice(0, 19).padEnd(19)} ` +
          `${(r.ageHours === null ? '   —' : r.ageHours.toFixed(0) + 'h').padStart(6)} ` +
          `${String(r.klass).padEnd(10)} ${tool.padEnd(30)} ${r.file.slice(0, 12)} ${r.detail}\n`,
      )
    }
  }

  out.write('\n')
}

// ─── Clear ─────────────────────────────────────────────────────────────────

interface ClearSelector {
  expired: boolean
  errors: boolean
  empty: boolean
  all: boolean
  tool: string | null
  olderThanHours: number | null
}

function selects(row: Row, sel: ClearSelector): boolean {
  if (sel.all) return true
  if (sel.expired && row.verdict === 'expired') return true
  if (sel.errors && row.klass === 'error') return true
  if (sel.empty && row.klass === 'empty') return true
  if (sel.tool && (row.recordedTool === sel.tool || row.candidates.includes(sel.tool))) return true
  if (sel.olderThanHours !== null && row.ageHours !== null && row.ageHours >= sel.olderThanHours) {
    return true
  }
  return false
}

function clear(rows: Row[], sel: ClearSelector, apply: boolean): number {
  const hit = rows.filter((r) => selects(r, sel))
  const out = process.stdout
  const bytes = hit.reduce((s, r) => s + r.bytes, 0)
  out.write(
    `[cache:research] ${apply ? 'deleting' : 'DRY RUN — would delete'} ${hit.length} of ` +
      `${rows.length} entr${rows.length === 1 ? 'y' : 'ies'} (${(bytes / 1024).toFixed(0)} KB)\n`,
  )
  for (const [k, n] of tally(hit.map((r) => String(r.klass)))) {
    out.write(`    ${k.padEnd(10)} ${n}\n`)
  }
  if (!apply) {
    out.write('    pass --yes to actually delete\n')
    return 0
  }
  for (const r of hit) rmSync(join(CACHE_DIR, r.file), { force: true })
  out.write(`    deleted ${hit.length}\n`)
  return hit.length
}

// ─── CLI ───────────────────────────────────────────────────────────────────

function usage(): never {
  process.stdout.write(
    [
      'cache:research — inspect and clear .research-cache/',
      '',
      '  npm run cache:research                            report',
      '  npm run cache:research -- --list                  one line per entry',
      '  npm run cache:research -- --json                  machine-readable',
      '',
      '  npm run cache:research -- clear <selector>… [--yes]',
      '      --expired            entries the TTL policy already treats as a miss',
      '      --errors             entries carrying a stored error',
      '      --empty              entries holding an empty result',
      '      --tool <name>        entries written (or inferrable) as <name>',
      '      --older-than <h>     entries at least <h> hours old',
      '      --all                everything',
      '      --yes                actually delete (otherwise: dry run)',
      '',
    ].join('\n'),
  )
  process.exit(0)
}

function main(): void {
  const argv = process.argv.slice(2)
  const nowMs = Date.now()

  if (argv.includes('--help') || argv.includes('-h')) usage()

  const isClear = argv[0] === 'clear'
  const flags = isClear ? argv.slice(1) : argv

  const sel: ClearSelector = {
    expired: false,
    errors: false,
    empty: false,
    all: false,
    tool: null,
    olderThanHours: null,
  }
  let apply = false
  let asJson = false
  let list = false

  for (let i = 0; i < flags.length; i++) {
    const f = flags[i]
    if (f === '--expired') sel.expired = true
    else if (f === '--errors' || f === '--error') sel.errors = true
    else if (f === '--empty' || f === '--empties') sel.empty = true
    else if (f === '--all') sel.all = true
    else if (f === '--yes' || f === '-y') apply = true
    else if (f === '--json') asJson = true
    else if (f === '--list') list = true
    else if (f === '--tool') sel.tool = flags[++i] ?? null
    else if (f === '--older-than') sel.olderThanHours = Number(flags[++i])
    else {
      process.stderr.write(`[cache:research] unknown flag ${f}\n`)
      process.exit(2)
    }
  }

  const rows = loadRows(nowMs)

  if (isClear) {
    const hasSelector =
      sel.expired ||
      sel.errors ||
      sel.empty ||
      sel.all ||
      sel.tool !== null ||
      sel.olderThanHours !== null
    if (!hasSelector) {
      process.stderr.write(
        '[cache:research] clear needs a selector — refusing to guess. ' +
          'Try --expired, or --all if that is really what you mean.\n',
      )
      process.exit(2)
    }
    if (sel.olderThanHours !== null && !Number.isFinite(sel.olderThanHours)) {
      process.stderr.write('[cache:research] --older-than needs a number of hours\n')
      process.exit(2)
    }
    clear(rows, sel, apply)
    return
  }

  if (asJson) {
    process.stdout.write(
      `${JSON.stringify(
        {
          cacheDir: CACHE_DIR,
          checkedAt: new Date(nowMs).toISOString(),
          total: rows.length,
          byClass: Object.fromEntries(tally(rows.map((r) => String(r.klass)))),
          byVerdict: Object.fromEntries(tally(rows.map((r) => r.verdict))),
          entries: rows.map((r) => ({
            file: r.file,
            fetchedAt: r.fetchedAt,
            ageHours: r.ageHours === null ? null : Number(r.ageHours.toFixed(2)),
            klass: r.klass,
            shape: r.shape,
            tool: r.recordedTool,
            candidates: r.candidates,
            ttlHours: r.ttlHours,
            verdict: r.verdict,
          })),
        },
        null,
        2,
      )}\n`,
    )
    return
  }

  report(rows, nowMs, { list })
}

main()
