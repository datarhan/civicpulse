#!/usr/bin/env tsx
/**
 * Does `data-graph.ts` still describe what the scripts actually do?
 *
 *   npm run check:data-graph
 *   npm run check:data-graph -- --json
 *
 * The graph is a hand-written dependency declaration, and a hand-written
 * declaration of something the code already knows is a restated shape. Restated
 * shapes drift while staying green — `DATA_INTEGRITY.md` rule 1, the defect
 * class that cost this repo €53.5M off a published page. This is the check that
 * makes the graph worth believing.
 *
 * It fails on three things, and the third is the one that matters:
 *
 *   1. an edge the script has and the graph does not
 *   2. an edge the graph has and the script does not
 *   3. **a script the scanner could not read** — because a scan that finds
 *      nothing has not proven a script has no inputs, and reporting that as a
 *      pass is exactly how a suite stays green while measuring nothing
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DATA_GRAPH, topologicalOrder, type DataNode } from '../src/scraper/data-graph'
import { analyseScriptIo } from '../src/scraper/script-io'

interface Problem {
  node: string
  kind: 'missing-script' | 'unreadable' | 'undeclared-read' | 'undeclared-write' | 'phantom-edge'
  detail: string
}

function checkNode(node: DataNode): { problems: Problem[]; analysed: boolean } {
  const problems: Problem[] = []
  if (!node.script) {
    // A node with no script cannot be verified. That is allowed only for tiers
    // nothing rebuilds automatically; anything else is an unverifiable claim.
    if (node.tier === 'derived') {
      problems.push({
        node: node.id,
        kind: 'missing-script',
        detail: 'derived node declares no script, so its edges cannot be verified',
      })
    }
    return { problems, analysed: false }
  }

  const path = resolve(node.script)
  if (!existsSync(path)) {
    problems.push({ node: node.id, kind: 'missing-script', detail: `${node.script} not found` })
    return { problems, analysed: false }
  }

  const io = analyseScriptIo(readFileSync(path, 'utf8'))
  if (!io.analysed) {
    problems.push({
      node: node.id,
      kind: 'unreadable',
      detail: `${node.script}: the scanner found no data paths at all — it cannot follow this script`,
    })
    return { problems, analysed: false }
  }
  for (const p of io.unclassified) {
    problems.push({
      node: node.id,
      kind: 'unreadable',
      detail: `${node.script} mentions ${p} but the scanner cannot tell if it is read or written — add "// data-graph: reads ${p}"`,
    })
  }

  const declaredReads = new Set(node.reads)
  const declaredWrites = new Set(node.writes)
  for (const r of io.reads) {
    if (!declaredReads.has(r)) {
      problems.push({ node: node.id, kind: 'undeclared-read', detail: `script reads ${r}` })
    }
  }
  for (const w of io.writes) {
    if (!declaredWrites.has(w)) {
      problems.push({ node: node.id, kind: 'undeclared-write', detail: `script writes ${w}` })
    }
  }
  for (const r of node.reads) {
    if (!io.reads.includes(r)) {
      problems.push({ node: node.id, kind: 'phantom-edge', detail: `graph claims a read of ${r}` })
    }
  }
  for (const w of node.writes) {
    if (!io.writes.includes(w)) {
      problems.push({ node: node.id, kind: 'phantom-edge', detail: `graph claims a write of ${w}` })
    }
  }
  return { problems, analysed: true }
}

function main() {
  const asJson = process.argv.includes('--json')
  const problems: Problem[] = []
  let analysedCount = 0
  let edges = 0

  for (const node of DATA_GRAPH) {
    const r = checkNode(node)
    problems.push(...r.problems)
    if (r.analysed) analysedCount += 1
    edges += node.reads.length + node.writes.length
  }

  // The order itself is an assertion: a cycle throws here rather than in a
  // refresh run at 03:00.
  let order: string[] = []
  try {
    order = topologicalOrder().map((n) => n.id)
  } catch (err) {
    problems.push({
      node: '(graph)',
      kind: 'phantom-edge',
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  if (asJson) {
    process.stdout.write(
      JSON.stringify({ nodes: DATA_GRAPH.length, analysedCount, edges, order, problems }, null, 2) +
        '\n',
    )
  } else {
    for (const p of problems) {
      process.stdout.write(`  ✗ ${p.node.padEnd(32)} ${p.kind.padEnd(17)} ${p.detail}\n`)
    }
    process.stdout.write(
      `\n[check-data-graph] ${DATA_GRAPH.length} node(s) · ${analysedCount} verified against source · ` +
        `${edges} declared edge(s) · ${problems.length} problem(s)\n`,
    )
    if (order.length) {
      process.stdout.write(`[check-data-graph] rebuild order: ${order.join(' → ')}\n`)
    }
  }

  // Assert the check evaluated something. A graph whose every node is
  // unverifiable would otherwise report zero problems and look healthy.
  if (analysedCount === 0 && DATA_GRAPH.length > 0) {
    process.stderr.write(
      '[check-data-graph] FATAL: not one node could be verified against its source.\n' +
        '                  Zero problems here means the scanner is broken, not that the graph is right.\n',
    )
    process.exitCode = 1
    return
  }
  if (problems.length > 0) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) main()

export { checkNode }
