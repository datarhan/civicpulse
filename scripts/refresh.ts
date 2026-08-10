#!/usr/bin/env tsx
/**
 * Rebuild exactly the derived data whose inputs moved.
 *
 *   npm run refresh                 rebuild what is stale
 *   npm run refresh -- --dry-run    report, run nothing
 *   npm run refresh -- --list llm   just the backlog a pipeline should work
 *
 * Walks `data-graph.ts` in dependency order. Rebuilds `derived` nodes; never
 * runs a `curated` one, and never spends a model call on an `llm` one — those
 * are *listed* so the capped backlogs in `hallazgos-pipeline.sh` and
 * `press-lab-pipeline.sh` can pick them up. The graph tells those pipelines
 * what is stale; it does not decide to spend on their behalf.
 *
 * ## The report separates five outcomes on purpose
 *
 * "Nothing was rebuilt" can mean everything was fresh, or that every node was
 * unreachable from here, or that a whole tier is deliberately out of scope.
 * Folding those together is `DATA_INTEGRITY.md` rule 2 — the shape that let a
 * pass report `re-judged 1017` having made zero LLM calls. Each bucket is
 * counted and named separately, and an empty bucket says whether it is empty
 * because there was nothing to do or because nothing of that kind exists yet.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DATA_GRAPH,
  topologicalOrder,
  type DataNode,
  type NodeTier,
} from '../src/scraper/data-graph'
import { builtFromFor, stalenessOf, describeStaleness } from '../src/scraper/built-from'

const DATA_DIR = 'public/data'

type Outcome = 'rebuilt' | 'fresh' | 'failed' | 'stale-llm' | 'stale-curated' | 'unreachable'

interface Row {
  node: DataNode
  outcome: Outcome
  detail: string
}

/**
 * Record what the node was built from, in the artifact itself.
 *
 * Runs AFTER the command, because the command rewrites the file and would
 * discard a stamp written before it. A node whose output is not JSON, or which
 * did not produce its output at all, is reported rather than silently left
 * unstamped — an unstamped node is stale forever, which looks like a rebuild
 * loop and is very hard to read backwards.
 */
function stamp(node: DataNode): string | null {
  const path = resolve(DATA_DIR, node.id)
  if (!existsSync(path)) return `${node.id} was not produced by its own command`
  let doc: unknown
  try {
    doc = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return `${node.id} is not JSON — cannot record provenance`
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return `${node.id} is not a JSON object — cannot record provenance`
  }
  const next = { ...(doc as Record<string, unknown>), builtFrom: builtFromFor(node) }
  writeFileSync(path, JSON.stringify(next, null, 2) + '\n')
  return null
}

function run(command: string): { ok: boolean; detail: string } {
  try {
    execFileSync('bash', ['-lc', command], { stdio: 'pipe', encoding: 'utf8' })
    return { ok: true, detail: command }
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; message?: string }
    const why = (e.stderr || e.stdout || e.message || '').trim().split('\n').slice(-2).join(' ')
    return { ok: false, detail: why.slice(0, 200) || 'command failed' }
  }
}

function main() {
  const argv = process.argv.slice(2)
  const dryRun = argv.includes('--dry-run')
  const listIdx = argv.indexOf('--list')
  const listTier = listIdx >= 0 ? (argv[listIdx + 1] as NodeTier | undefined) : undefined

  let order: DataNode[]
  try {
    order = topologicalOrder()
  } catch (err) {
    process.stderr.write(`[refresh] ${err instanceof Error ? err.message : err}\n`)
    process.exit(1)
  }

  // `--list <tier>`: machine-readable backlog for a pipeline, nothing else.
  if (listTier) {
    for (const node of order) {
      if (node.tier !== listTier) continue
      if (stalenessOf(node).stale) process.stdout.write(`${node.id}\n`)
    }
    return
  }

  const rows: Row[] = []
  for (const node of order) {
    const s = stalenessOf(node)
    if (!s.stale) {
      rows.push({ node, outcome: 'fresh', detail: 'inputs unchanged' })
      continue
    }
    const why = describeStaleness(node, s)

    if (node.tier === 'curated') {
      rows.push({
        node,
        outcome: 'stale-curated',
        detail: `${why} · ${node.command ?? 'a curator'}`,
      })
      continue
    }
    if (node.tier === 'llm') {
      rows.push({ node, outcome: 'stale-llm', detail: why })
      continue
    }
    if (!node.command) {
      rows.push({ node, outcome: 'unreachable', detail: `${why} · no command declared` })
      continue
    }
    if (dryRun) {
      rows.push({ node, outcome: 'rebuilt', detail: `would run: ${node.command} · ${why}` })
      continue
    }

    const r = run(node.command)
    if (!r.ok) {
      rows.push({ node, outcome: 'failed', detail: r.detail })
      continue
    }
    const stampErr = stamp(node)
    rows.push(
      stampErr
        ? { node, outcome: 'failed', detail: stampErr }
        : { node, outcome: 'rebuilt', detail: why },
    )
  }

  const by = (o: Outcome) => rows.filter((r) => r.outcome === o)
  const label: Record<Outcome, string> = {
    rebuilt: dryRun ? 'would rebuild' : 'rebuilt',
    fresh: 'fresh',
    failed: 'FAILED',
    'stale-llm': 'stale · llm',
    'stale-curated': 'stale · curated',
    unreachable: 'unreachable',
  }

  for (const outcome of Object.keys(label) as Outcome[]) {
    const group = by(outcome)
    if (group.length === 0) continue
    process.stdout.write(`\n${label[outcome]} (${group.length})\n`)
    for (const r of group) {
      process.stdout.write(`  ${r.node.id.padEnd(34)} ${r.detail}\n`)
    }
  }

  // An empty tier must say WHY it is empty. "0 llm nodes stale" and "this graph
  // declares no llm nodes yet" look identical in a count and mean opposite
  // things to whoever reads the log at 03:00.
  const tiers: NodeTier[] = ['llm', 'curated']
  const notes: string[] = []
  for (const t of tiers) {
    const declared = DATA_GRAPH.filter((n) => n.tier === t).length
    if (declared === 0) notes.push(`no ${t} nodes are declared in the graph yet`)
    else if (by(t === 'llm' ? 'stale-llm' : 'stale-curated').length === 0) {
      notes.push(`all ${declared} ${t} node(s) fresh`)
    }
  }

  process.stdout.write(
    `\n[refresh] ${rows.length} node(s) · ` +
      (['rebuilt', 'fresh', 'failed', 'stale-llm', 'stale-curated', 'unreachable'] as Outcome[])
        .map((o) => `${by(o).length} ${label[o]}`)
        .join(' · ') +
      '\n',
  )
  for (const n of notes) process.stdout.write(`[refresh] ${n}\n`)
  if (dryRun) process.stdout.write('[refresh] --dry-run: nothing was written\n')

  if (by('failed').length > 0) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) main()
