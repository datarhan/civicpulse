/**
 * One-shot migration: `corroboration` → `crossChecked` in the two findings
 * snapshots that carried the field — `pleno-findings.json` (52 rows) and its
 * press-side twin `press-findings.json`.
 *
 * Why a script and not an edit: both files are curated and guard-protected,
 * and a rename on a legally-material surface has to leave a record of exactly
 * what it did. This one is mechanical by construction — every ref keeps its
 * kind, ref and snippet, in order, and the row count and per-row ref counts
 * are asserted equal before anything is written. No claim changes; the same
 * documents are published under a name that describes them.
 *
 * The rename itself: `corroboration[]` never held corroboration. The auto-
 * curators aggregated every verifier evidence ref for the cited quotes —
 * agreeing or not — and left `contradiction[]` empty by construction.
 * Measured on pleno-findings.json before the migration: 49 of 52 findings
 * carried a non-empty `corroboration[]` and 0 of 52 carried any
 * `contradiction[]`. The name is what the LLM synthesiser read when it wrote
 * «corroborado por…».
 *
 *   npx tsx scripts/migrate-finding-crosschecked.ts [--target pleno|press] [--dry-run]
 *
 * Idempotent: a file already migrated exits 0 having written nothing.
 *
 * `press-findings.json` holds no rows, so its migration moves nothing. It is
 * still run, and still validated, because the point is that the file and its
 * validator agree BEFORE the first row lands — an empty file is exactly where
 * a shape defect is cheap to fix and invisible to a row-level check. The
 * zero-row case is reported as its own outcome, never folded into "migrated".
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { validateFindingsSnapshot } from '../src/scraper/pleno-finding'
import { validatePressFindingsSnapshot } from '../src/scraper/press-finding'

type Target = 'pleno' | 'press'

const TARGETS: Record<Target, { path: string; validate: (json: string) => { items: unknown[] } }> =
  {
    pleno: { path: 'public/data/pleno-findings.json', validate: validateFindingsSnapshot },
    press: { path: 'public/data/press-findings.json', validate: validatePressFindingsSnapshot },
  }

const targetArg = (() => {
  const i = process.argv.indexOf('--target')
  return i < 0 ? 'pleno' : (process.argv[i + 1] ?? '')
})()
if (!(targetArg in TARGETS)) {
  process.stderr.write(
    `[migrate-crosschecked] --target must be one of ${Object.keys(TARGETS).join('|')} (got «${targetArg}»)\n`,
  )
  process.exit(1)
}
const target = TARGETS[targetArg as Target]

const FINDINGS = resolve(target.path)
const dryRun = process.argv.includes('--dry-run')

interface LegacyRef {
  kind: string
  ref: string
  snippet: string
}
interface LegacyRow extends Record<string, unknown> {
  id: string
  corroboration?: LegacyRef[]
  crossChecked?: LegacyRef[]
  contradiction?: LegacyRef[]
}

function fail(msg: string): never {
  process.stderr.write(`[migrate-crosschecked] ${msg}\n`)
  process.exit(1)
}

const raw = JSON.parse(readFileSync(FINDINGS, 'utf8')) as {
  items: LegacyRow[]
  [k: string]: unknown
}
const rows = raw.items
if (!Array.isArray(rows)) fail('no items[] array — refusing')

// Three outcomes, reported separately. Folding "nothing to migrate because
// the file is empty" into "already migrated" is how a pass reports success
// having examined nothing.
if (rows.length === 0) {
  // The shape still has to be provably consistent, so validate before
  // claiming anything: the validator now rejects `corroboration` outright,
  // and this is where an empty file gets that guarantee checked rather than
  // assumed.
  target.validate(readFileSync(FINDINGS, 'utf8'))
  process.stdout.write(
    `[migrate-crosschecked] ${target.path}: 0 row(s) — nothing to rename. The file validates ` +
      `under the post-rename schema, so the first row cannot land in the old shape.\n`,
  )
  process.exit(0)
}

const legacy = rows.filter((r) => r.corroboration !== undefined)
if (legacy.length === 0) {
  process.stdout.write(
    `[migrate-crosschecked] already migrated — ${rows.length} row(s), none carry \`corroboration\`.\n`,
  )
  process.exit(0)
}

// Record the shape we must preserve, BEFORE touching anything.
const before = rows.map((r) => ({
  id: r.id,
  refs: (r.corroboration ?? r.crossChecked ?? []).length,
  contradiction: (r.contradiction ?? []).length,
}))

let movedRefs = 0
const migrated = rows.map((r) => {
  const { corroboration, ...rest } = r
  if (corroboration === undefined) return r
  if (rest.crossChecked !== undefined) {
    fail(`items[${r.id}] carries BOTH corroboration and crossChecked — merge by hand`)
  }
  movedRefs += corroboration.length
  // Key order matters only for the diff's readability: put crossChecked where
  // corroboration was, i.e. immediately before contradiction.
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(r)) {
    if (k === 'corroboration') out.crossChecked = v
    else out[k] = v
  }
  return out as LegacyRow
})

// Prove the migration moved refs rather than dropping them. A pass that
// "migrated 52 rows" having emptied every array would otherwise look green.
for (let i = 0; i < migrated.length; i++) {
  const m = migrated[i]
  const b = before[i]
  if (m.id !== b.id) fail(`row ${i}: id changed ${b.id} → ${m.id}`)
  if (m.corroboration !== undefined) fail(`row ${b.id}: corroboration survived the migration`)
  if ((m.crossChecked ?? []).length !== b.refs) {
    fail(`row ${b.id}: ${b.refs} ref(s) in, ${(m.crossChecked ?? []).length} out`)
  }
  if ((m.contradiction ?? []).length !== b.contradiction) {
    fail(`row ${b.id}: contradiction[] changed, which this migration must never touch`)
  }
}
const totalRefsIn = before.reduce((n, b) => n + b.refs, 0)
if (movedRefs !== totalRefsIn) fail(`moved ${movedRefs} refs but counted ${totalRefsIn}`)
if (totalRefsIn === 0) fail('counted 0 refs to move — the check evaluated nothing, refusing')

const serialized = JSON.stringify({ ...raw, items: migrated }, null, 2) + '\n'
// The validator now rejects `corroboration` outright, so this is also the
// proof that no row kept the old key.
const snap = target.validate(serialized) as {
  items: Array<{ crossChecked: unknown[]; contradiction: unknown[] }>
}

process.stdout.write(
  `[migrate-crosschecked] ${target.path}: ${legacy.length}/${rows.length} row(s) renamed · ` +
    `${movedRefs} ref(s) moved · ${snap.items.filter((f) => f.crossChecked.length > 0).length} ` +
    `row(s) with a non-empty crossChecked[] · ` +
    `${snap.items.filter((f) => f.contradiction.length > 0).length} with contradiction[]\n`,
)
if (dryRun) {
  process.stdout.write('[migrate-crosschecked] --dry-run: nothing written\n')
  process.exit(0)
}
writeFileSync(FINDINGS, serialized, 'utf8')
process.stdout.write(`[migrate-crosschecked] wrote ${FINDINGS}\n`)
