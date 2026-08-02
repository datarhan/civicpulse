/**
 * Watch the vocabulary our upstreams actually speak.
 *
 * The most expensive bug of 2026-08-02 was one word. Gobierto emits `formalized`
 * for a signed contract; our enum listed `finalized`, a word the source has
 * never used. `normStatus` coerced all 298 of them to `unknown`, every total was
 * written as `status === 'awarded'`, and €53.5M across 314 signed contracts —
 * including the largest contract the town has ever let — silently disappeared
 * from the published site for months.
 *
 * Nothing caught it. The parser did not throw: coercion is what it is for. The
 * enum test passed, because its hand-written allow-set contained `unknown`, so
 * every mis-coerced row landed on a permitted value. The site rendered a number.
 * Only a human comparing a rendered total against a contract they knew about
 * would ever have noticed.
 *
 * Two signals catch it, and both are arithmetic:
 *
 *   1. **Fallback share.** A field where a large slice of rows lands on
 *      `unknown`/`otro` is a field whose vocabulary we have misread. Before the
 *      fix, `contracts.status` was 41% unknown; after, 5.2%.
 *   2. **New values.** A value the upstream has never emitted before is worth a
 *      human glance the DAY it appears, whether or not it falls into fallback —
 *      because the alternative is finding out when someone notices a number is
 *      wrong. This is why the census is committed: a fresh baseline every run
 *      would make the check unable to fail, which is the exact defect this file
 *      exists to prevent.
 *
 * Pure — no fs, no clock.
 */

export interface FieldCensus {
  /** `snapshot.collection.field`, e.g. `tenders.contracts.status`. */
  path: string
  /** value → count, for the low-cardinality fields only. */
  values: Record<string, number>
}

export interface CensusFinding {
  path: string
  kind: 'fallback-share' | 'new-value' | 'value-vanished'
  detail: string
  severity: 'warn' | 'error'
}

/** Values that mean "we could not read this", across the languages in play. */
export const FALLBACK_VALUES = new Set([
  'unknown',
  'otro',
  'other',
  'desconocido',
  'sin-datos',
  'n/a',
  '',
])

/**
 * Above this share of rows landing in a fallback, we are probably misreading the
 * source rather than the source being genuinely vague. 15% is chosen to sit well
 * clear of the healthy 5.2% and well below the 41% the bug produced.
 */
export const FALLBACK_CEILING = 0.15

/** Fields with more distinct values than this are free text, not vocabulary. */
export const MAX_ENUM_CARDINALITY = 12

/**
 * Below this many rows, a fallback share means nothing.
 *
 * The check's own first real run proved the need: `boe.items.epigrafe` tripped
 * the error threshold at 50% — which was 2 empty values out of 4 rows, in a
 * snapshot that legitimately holds a handful of entries, some of which have no
 * epigrafe at all. A percentage over a four-row sample is noise, and noise is
 * how a check earns a reputation for crying wolf and gets ignored. The
 * formalized bug it exists to catch was 298 rows out of 730.
 */
export const MIN_ROWS_FOR_SHARE = 30

export function censusFindings(current: FieldCensus[], baseline: FieldCensus[]): CensusFinding[] {
  const out: CensusFinding[] = []
  const base = new Map(baseline.map((b) => [b.path, b]))

  for (const c of current) {
    const total = Object.values(c.values).reduce((a, b) => a + b, 0)
    if (total === 0) continue

    const fb = Object.entries(c.values)
      .filter(([v]) => FALLBACK_VALUES.has(v.toLowerCase()))
      .reduce((a, [, n]) => a + n, 0)
    const share = fb / total
    if (share > FALLBACK_CEILING && total >= MIN_ROWS_FOR_SHARE) {
      out.push({
        path: c.path,
        kind: 'fallback-share',
        severity: 'error',
        detail:
          `${Math.round(share * 100)}% of rows fall back to unknown ` +
          `(${fb}/${total}). The source vocabulary has probably moved — compare ` +
          `the parser's allow-set against the raw values.`,
      })
    }

    const prev = base.get(c.path)
    if (!prev) continue // first sighting of a field is not drift
    for (const v of Object.keys(c.values)) {
      if (!(v in prev.values)) {
        out.push({
          path: c.path,
          kind: 'new-value',
          severity: 'warn',
          detail: `new upstream value ${JSON.stringify(v)} (${c.values[v]} row(s)) — is the parser expecting it?`,
        })
      }
    }
    // A value that used to be common and is now absent is the same smell in
    // reverse: an upstream rename we have started dropping on the floor.
    for (const [v, n] of Object.entries(prev.values)) {
      if (n >= 10 && !(v in c.values)) {
        out.push({
          path: c.path,
          kind: 'value-vanished',
          severity: 'warn',
          detail: `value ${JSON.stringify(v)} had ${n} row(s) and is now absent — renamed upstream?`,
        })
      }
    }
  }
  return out
}

/** Build a census from parsed rows. Skips free-text and numeric fields. */
export function buildCensus(
  path: string,
  rows: Array<Record<string, unknown>>,
): FieldCensus | null {
  if (!rows.length) return null
  const counts: Record<string, number> = {}
  for (const r of rows) {
    const v = r[path.split('.').pop() as string]
    if (typeof v !== 'string') continue
    counts[v] = (counts[v] ?? 0) + 1
  }
  const distinct = Object.keys(counts).length
  if (distinct < 2 || distinct > MAX_ENUM_CARDINALITY) return null
  return { path, values: counts }
}
