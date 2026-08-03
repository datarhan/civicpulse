/**
 * What changed in the transcript corpus since a human last looked?
 *
 * Re-transcribing is an improvement that breaks things: better text means a
 * published verbatim lifted from the old text may no longer appear in it.
 * Totals hide that — "30 untraceable" reads identically whether it is the same
 * 30 a curator already accepted or a fresh 30 the run that just finished
 * created. The DELTA is the only part anyone has to act on.
 *
 * Pure. `verify-transcript-corpus.sh` owns the files, the baseline write and
 * the exit code; this owns the set arithmetic, which is the part with a wrong
 * answer available. It used to live inside a `node -e` string in that shell
 * script, which meant no test could reach it.
 */

export interface DriftedQuote {
  findingId: string
  quote: string
}

export interface CorpusDelta {
  /** Untraceable now AND in the baseline — already seen, no action. */
  carried: string[]
  /** Untraceable now but NOT in the baseline — this run broke them. */
  appeared: string[]
  /** In the baseline but traceable again — the run fixed them. */
  healed: string[]
}

/**
 * Identity of a drift.
 *
 * findingId + the head of the quote, because one finding can carry several
 * quotes and only some of them go untraceable. 60 chars is enough to tell two
 * quotes in one finding apart without making the key churn on a trailing-space
 * change — a key that churns turns every re-transcription into a wall of false
 * "appeared", which is how a delta check stops being read.
 */
export function driftKey(d: DriftedQuote): string {
  return `${d.findingId}|${(d.quote ?? '').slice(0, 60)}`
}

export function compareCorpus(current: DriftedQuote[], baseline: DriftedQuote[]): CorpusDelta {
  const now = new Set((current ?? []).map(driftKey))
  const before = new Set((baseline ?? []).map(driftKey))
  return {
    carried: [...now].filter((k) => before.has(k)),
    appeared: [...now].filter((k) => !before.has(k)),
    healed: [...before].filter((k) => !now.has(k)),
  }
}

/**
 * Does this delta need a human?
 *
 * Only `appeared`. A quote that healed is good news and a quote that carried
 * has already been looked at — blocking on either would make the check
 * permanently red and therefore permanently ignored.
 */
export function corpusDeltaBlocks(delta: CorpusDelta): boolean {
  return delta.appeared.length > 0
}
