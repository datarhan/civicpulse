/**
 * Do the curator queues still describe what is published?
 *
 * A queue under `editorial/` is generated once by a `triage:*` pass and read
 * many times afterwards — by the local curator dashboard, by whoever asks
 * "what is left". Nothing invalidates one when its subjects disappear, and on
 * 2026-08-11 that made every backlog reading wrong at once:
 *
 *   area-fit-queue      40 rows — ALL 40 already curated and published on 08-04
 *   quote-reanchor      43 rows — 11 name findings retracted that morning
 *   finding-support     52 rows — 11 likewise
 *   attribution         40 rows — 5 likewise
 *
 * Roughly a third of an apparent 175-row backlog was rows about findings that
 * no longer exist. Not dangerous — nothing published was wrong — but it makes
 * the queue lie about the size of the job, and a queue nobody trusts is a
 * queue nobody works.
 *
 * This is the read-time half. It does not rewrite a queue: re-running the
 * `triage:*` pass is what regenerates one, and a checker that silently edited
 * a curator's worklist would be its own problem. It reports.
 */

/** A queue file and the field its rows key on. Curated, never glob-scanned. */
export interface QueueSource {
  /** Path relative to the repo root. */
  path: string
  /** Field on each row holding the finding id. */
  idField: string
  /** The pass that regenerates it — named in the report, since that is the fix. */
  regenerate: string
}

/**
 * Listed explicitly rather than discovered, for the reason `LAB_SOURCES` is:
 * a queue that appears under `editorial/` should show up here only when
 * somebody decides it is a worklist about findings. Files that are not — the
 * review LOG, the pending-measurement notes — are deliberately absent.
 */
export const QUEUE_SOURCES: QueueSource[] = [
  {
    path: 'editorial/quote-reanchor-queue.json',
    idField: 'findingId',
    regenerate: 'npm run triage:quote-reanchor',
  },
  {
    path: 'editorial/finding-support-queue.json',
    idField: 'id',
    regenerate: 'npm run triage:finding-support',
  },
  {
    path: 'editorial/finding-exception-queue.json',
    idField: 'findingId',
    regenerate: 'npm run triage:finding-exception',
  },
  {
    path: 'editorial/attribution-queue.json',
    idField: 'findingId',
    regenerate: 'npm run reconcile:attribution',
  },
]

export interface QueueReport {
  path: string
  regenerate: string
  /** false when the file is not on disk — not a problem, just nothing to say. */
  present: boolean
  total: number
  /** Rows whose finding is still published. */
  live: number
  /** Ids naming a finding that is neither published nor anywhere to be found. */
  orphaned: string[]
  /** Ids naming a finding that was explicitly retracted — the common case. */
  retracted: string[]
  /** Rows with no id at all in `idField`. A shape change, worth shouting about. */
  unkeyed: number
}

export interface CorpusView {
  published: Set<string>
  retracted: Set<string>
}

/** Rows of a parsed queue, whatever key the file happens to use. */
export function rowsOf(parsed: unknown): unknown[] {
  const j = parsed as Record<string, unknown>
  for (const k of ['rows', 'items']) {
    if (Array.isArray(j?.[k])) return j[k] as unknown[]
  }
  return Array.isArray(parsed) ? (parsed as unknown[]) : []
}

/**
 * Assess one queue against the corpus.
 *
 * `retracted` and `orphaned` are separated on purpose. A retracted id is
 * expected drift with a known fix (re-run the pass); an id that is neither
 * published nor retracted means the queue is describing something that never
 * existed or vanished without a record, which is a different and worse fact.
 * Folding them together is exactly the "sentinel is not a value" trap.
 */
export function assessQueue(
  source: QueueSource,
  parsed: unknown | null,
  corpus: CorpusView,
): QueueReport {
  const base = { path: source.path, regenerate: source.regenerate }
  if (parsed === null) {
    return { ...base, present: false, total: 0, live: 0, orphaned: [], retracted: [], unkeyed: 0 }
  }
  const rows = rowsOf(parsed)
  const orphaned: string[] = []
  const retracted: string[] = []
  let live = 0
  let unkeyed = 0
  for (const r of rows) {
    const id = (r as Record<string, unknown>)?.[source.idField]
    if (typeof id !== 'string' || !id) {
      unkeyed += 1
      continue
    }
    if (corpus.published.has(id)) live += 1
    else if (corpus.retracted.has(id)) retracted.push(id)
    else orphaned.push(id)
  }
  return { ...base, present: true, total: rows.length, live, orphaned, retracted, unkeyed }
}

/** Nothing to act on: every row describes something published. */
export function isClean(r: QueueReport): boolean {
  return r.orphaned.length === 0 && r.retracted.length === 0 && r.unkeyed === 0
}
