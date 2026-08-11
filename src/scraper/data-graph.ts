/**
 * Which published artifact derives from which, and what rebuilds it.
 *
 * ## Why
 *
 * `scrape-all.sh` rebuilds the cheap derivations *unconditionally* — safe, but
 * blind — and the expensive ones run when a hand-written backlog rule happens
 * to notice. `check:cadence` reports staleness by elapsed TIME, which cannot
 * tell you that `officials.json` moving has invalidated the departamentos
 * cross-tab. Nothing in the repo said what depends on what.
 *
 * ## The declaration is checked, not trusted
 *
 * Every `reads`/`writes` list below is compared against what the script
 * actually does by `check:data-graph`, using `script-io.ts`. A hand-written
 * dependency list is a restated shape, and restated shapes drift while staying
 * green — `DATA_INTEGRITY.md` rule 1. If you add an input to a compute script
 * and forget this file, the check fails; if you add it here and not to the
 * script, the check fails too.
 *
 * ## `reads` and `writes` are separate on purpose
 *
 * Two nodes here write back into a file they also read:
 * `compute:dept-stats` folds its scalars into `plenos-agendas.json`, and
 * `compute:finding-quote-provenance` reads the previous provenance to diff
 * against. Hashing all inputs including those would make both permanently
 * stale — rebuild, hash changes, stale again, forever. `builtFrom` therefore
 * records only inputs the node does not itself write.
 */

export type NodeTier =
  /** Fetched from upstream. No inputs in this graph; freshness is `check:cadence`'s job. */
  | 'scraped'
  /** A pure function of other snapshots. Rebuilt automatically. */
  | 'derived'
  /** Needs a model. Queued for the capped backlogs; never rebuilt automatically. */
  | 'llm'
  /** A human signs it. NEVER rebuilt — reported only. */
  | 'curated'

export interface DataNode {
  /** The artifact this node produces, as a `public/data` basename. */
  id: string
  tier: NodeTier
  /** Snapshots it consumes. Empty for `scraped`. */
  reads: readonly string[]
  /** Everything it writes, including its own id and any write-back. */
  writes: readonly string[]
  /** The command that rebuilds it. Null when nothing automatic can. */
  command: string | null
  /** The script `check:data-graph` reads to verify `reads`/`writes`. */
  script?: string
  /** One line on what it is for, shown in `refresh`'s report. */
  note?: string
}

/**
 * Derived nodes only, for now.
 *
 * Scraped nodes are deliberately absent: they have no inputs in this graph, so
 * a dependency walker has nothing to say about them, and `check:cadence`
 * already reports when one stops refreshing. Adding them as leaves would double
 * the file and halve the signal. Curated nodes appear only where a derived node
 * reads one, so `refresh` can name the human step that is owed.
 */
export const DATA_GRAPH: readonly DataNode[] = [
  {
    id: 'plenos-agendas.json',
    tier: 'derived',
    // Reads its own output: the scalars are folded back into the agenda
    // snapshot rather than shipped as a separate 6 MB corpus.
    reads: [
      'officials.json',
      'pleno-votes.json',
      'plenos-agendas.json',
      'promises.json',
      'quejas.json',
    ],
    writes: ['plenos-agendas.json'],
    command: 'npm run compute:dept-stats',
    script: 'scripts/compute-dept-stats.ts',
    note: 'departamentos cross-tab, folded into the agenda snapshot',
  },
  {
    id: 'tender-geo.json',
    tier: 'derived',
    reads: [
      'civic-poi.json',
      'gazetteer-supplement.json',
      'geo.json',
      'place-overrides.json',
      'streets.json',
      'tenders.json',
    ],
    writes: ['tender-geo.json'],
    command: 'npm run compute:tender-geo',
    script: 'scripts/compute-tender-geo.ts',
    note: 'the landing map’s situated-spending pins',
  },
  {
    id: 'entities.json',
    tier: 'derived',
    reads: ['entity-overrides.json', 'officials.json', 'tenders.json'],
    writes: ['entities.json'],
    command: 'npm run compute:entities',
    script: 'scripts/compute-entities.ts',
    note: 'company/person registry behind /presupuesto’s supplier merge',
  },
  {
    id: 'finding-quote-provenance.json',
    tier: 'derived',
    // Also reads its own previous output, to diff against.
    reads: ['finding-quote-provenance.json', 'pleno-findings.json'],
    writes: ['finding-quote-provenance.json'],
    command: 'npm run compute:finding-quote-provenance',
    script: 'scripts/compute-finding-quote-provenance.ts',
    note: 'which published quotes still match their transcript',
  },
  {
    id: 'press-trust.json',
    tier: 'derived',
    reads: ['plenos-agendas.json', 'press-claims-verified.json', 'press.json', 'promises.json'],
    writes: ['press-coverage-gaps.json', 'press-triangulation.json', 'press-trust.json'],
    command: 'npm run compute:press-analytics',
    script: 'scripts/compute-press-analytics.ts',
    note: 'press trust / triangulation / coverage gaps — one command, three files',
  },
  {
    // AGGREGATE. The graph answers "is LLM work owed at all"; which sessions,
    // in what order, within what quota, stays with `hallazgos-pipeline.sh`.
    // Modelling one node per pleno would mean generating the graph, and a
    // generated declaration cannot be checked against a hand-written one — the
    // anti-drift property is worth more than the extra precision.
    // Reads its own output too: the preservation guard snapshots the claim ids
    // published findings cite, so a re-extract that renames them refuses to
    // overwrite rather than orphan a citation.
    id: 'pleno-claims-suggestions.json',
    tier: 'llm',
    reads: [
      'officials.json',
      'pleno-claims-suggestions.json',
      'pleno-findings.json',
      'pleno-speaker-map/',
      'pleno-transcripts/',
      'plenos-agendas.json',
      'plenos.json',
    ],
    writes: ['pleno-claims-suggestions.json'],
    command: 'bash scripts/hallazgos-pipeline.sh',
    script: 'scripts/extract-pleno-claims.ts',
    note: 'claim extraction · attribution joined from the speaker map',
  },
  {
    // Curated: `refresh` reports it and never runs it. The command is here so
    // the report can name the human step that is owed rather than just saying
    // "stale".
    id: 'pleno-findings.json',
    tier: 'curated',
    reads: ['pleno-claims-verified.json'],
    writes: ['pleno-findings.json'],
    command: 'npm run promote-claim  (curator)',
    note: 'published findings — a human signs every one',
  },
]

/** Nodes that write `id`, so a walker can find what produces a given file. */
export function producersOf(id: string, graph: readonly DataNode[] = DATA_GRAPH): DataNode[] {
  return graph.filter((n) => n.writes.includes(id))
}

/**
 * The inputs whose hashes decide whether `node` is stale.
 *
 * A node's own outputs are excluded: including them would make every
 * write-back node permanently stale. This is the single line that keeps
 * `compute:dept-stats` from rebuilding on every run forever.
 */
export function stalenessInputs(node: DataNode): string[] {
  return node.reads.filter((r) => !node.writes.includes(r))
}

/**
 * Rebuild order: a node comes after everything it reads that this graph also
 * produces. Throws on a real cycle rather than picking an order and hoping.
 *
 * Self-edges are not cycles — see `stalenessInputs`.
 */
export function topologicalOrder(graph: readonly DataNode[] = DATA_GRAPH): DataNode[] {
  const out: DataNode[] = []
  const state = new Map<string, 'visiting' | 'done'>()
  const byId = new Map(graph.map((n) => [n.id, n]))

  const visit = (node: DataNode, trail: string[]): void => {
    const s = state.get(node.id)
    if (s === 'done') return
    if (s === 'visiting') {
      throw new Error(`data-graph: cycle — ${[...trail, node.id].join(' → ')}`)
    }
    state.set(node.id, 'visiting')
    for (const input of stalenessInputs(node)) {
      const producer = byId.get(input)
      if (producer && producer.id !== node.id) visit(producer, [...trail, node.id])
    }
    state.set(node.id, 'done')
    out.push(node)
  }

  for (const n of graph) visit(n, [])
  return out
}
