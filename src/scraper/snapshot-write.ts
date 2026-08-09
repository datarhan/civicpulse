/**
 * "May this run overwrite the published snapshot?" — one decision, shared.
 *
 * Every LLM-backed adapter here rebuilds a whole snapshot and writes it over
 * the previous one. That is safe exactly while the run is complete. When it is
 * not — the backend was unreachable, an item was never attempted, a fetch that
 * feeds the model came back empty — the rebuilt snapshot is missing rows for
 * reasons that say nothing about whether those rows are still true. Writing it
 * anyway deletes published data and calls the deletion a measurement.
 *
 * On 2026-08-09 that is precisely what happened: `extract:press-claims` reached
 * the model for none of its 25 articles, wrote `items: []` over the published
 * corpus, and the chain committed the empty file and signed off
 * "0 verified claim(s) pushed" (c6a6e23).
 *
 * The rule is about DIRECTION, not emptiness:
 *
 *   · a COMPLETE run always writes — it is authoritative even when it honestly
 *     found fewer rows than last time;
 *   · an INCOMPLETE run may ADD rows but may never REMOVE them.
 *
 * This lived in press-claim.ts as `decidePressClaimsWrite` until
 * `summarize:press` needed the identical gate. It was generalised rather than
 * copied: CLAUDE.md's data-integrity rule 1 is that a hand-copied shape is how
 * six tests in this repo went green while matching nothing in production.
 *
 * Pure by design — `existingRaw` is passed in rather than read here, so the
 * missing-file, corrupt-file and shrink cases are all unit-testable without
 * touching the filesystem or a CLI.
 */

/**
 * Outcome of the decision. `reason` is logged verbatim so the pipeline log says
 * which branch was taken and why, rather than leaving the operator to infer it
 * from a row count that changed.
 */
export interface SnapshotWriteDecision {
  write: boolean
  reason: string
  /** Rows already published on disk (0 when the file is absent or corrupt). */
  existingCount: number
  /** Rows this run produced. */
  incomingCount: number
  /** Whether the run was complete (`unresolvedCount === 0`). */
  complete: boolean
}

/** Tolerant row count for an on-disk snapshot: anything unreadable is 0. */
export function countSnapshotItems(raw: string | null | undefined): number {
  if (!raw) return 0
  try {
    const parsed = JSON.parse(raw) as { items?: unknown }
    return Array.isArray(parsed.items) ? parsed.items.length : 0
  } catch {
    return 0
  }
}

export interface SnapshotWriteArgs {
  /** Rows this run produced. */
  incomingCount: number
  /**
   * Items this run could not resolve, for ANY reason that leaves the snapshot
   * short of what a healthy run would have produced: the backend was
   * unreachable, the model returned nothing usable, an item was never attempted
   * because its input was missing. All of them mean the same thing here — this
   * run is not evidence that a missing row should be deleted. Non-zero ⇒
   * incomplete.
   */
  unresolvedCount: number
  /** Raw text of the snapshot currently on disk, or null when absent. */
  existingRaw: string | null
  /**
   * Singular noun for the rows, used only to build `reason` ("claim",
   * "summary"). Cosmetic; the decision does not depend on it.
   */
  itemNoun?: string
}

export function decideSnapshotWrite(args: SnapshotWriteArgs): SnapshotWriteDecision {
  const { incomingCount, unresolvedCount, existingRaw, itemNoun = 'item' } = args
  const existingCount = countSnapshotItems(existingRaw)
  const complete = !(unresolvedCount > 0)

  if (complete) {
    return {
      write: true,
      reason:
        `complete run (unresolved=0) — writing ${incomingCount} ${itemNoun}(s), ` + `authoritative`,
      existingCount,
      incomingCount,
      complete,
    }
  }
  if (incomingCount < existingCount) {
    return {
      write: false,
      reason:
        `refusing to overwrite ${existingCount} ${itemNoun}(s) with ${incomingCount} ` +
        `from an incomplete run (unresolved=${unresolvedCount}) — an incomplete ` +
        `run may add ${itemNoun}(s), never remove them`,
      existingCount,
      incomingCount,
      complete,
    }
  }
  return {
    write: true,
    reason:
      `incomplete run (unresolved=${unresolvedCount}) but it did not shrink the ` +
      `corpus (${existingCount} → ${incomingCount}) — keeping the partial progress`,
    existingCount,
    incomingCount,
    complete,
  }
}
