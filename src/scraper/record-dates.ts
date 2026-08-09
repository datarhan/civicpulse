/**
 * "Could the council have been discussing this record?" — the date half of a
 * cross-reference.
 *
 * A cross-reference pairs a sentence somebody said in a plenary session with a
 * document from the municipal record. Nothing in this repo checks that the
 * document *supports* the sentence (see `EvidenceStance` in claim-verifier.ts).
 * But one thing IS checkable, deterministically: whether the document existed
 * when the council met. A contract awarded after the session cannot be what the
 * session was talking about, so publishing it under «documentos cotejados»
 * beside that debate asserts a link that is not merely unmeasured — it is
 * impossible.
 *
 * Measured on the published corpus the day this module was written, 17 of the
 * 154 dated tender references on `/hallazgos` post-dated their own session, by
 * up to twelve months.
 *
 * ## Why the earliest date, not the award date
 *
 * Keying on `awardDate` alone would throw away true joins. A procurement is
 * public — and debatable in the chamber — from the moment the licitación is
 * published, months before anyone is awarded anything: in this snapshot 297
 * permalinks carry a licitación row that predates the award on the same
 * permalink, by 47, 64, 181 days in the first three. The council debating a
 * tender that is out to bid is the normal case, not the exception.
 *
 * So the question each record has to answer is "what is the earliest date at
 * which you are attested to have existed?", and the gate excludes only when
 * even THAT date falls after the session. Everything in `FIRST_KNOWN_FIELDS` is
 * a moment the procurement was already under way in public.
 *
 * ## What it deliberately does not do
 *
 * It never excludes a record it cannot date. A ref with no date, or one no
 * procurement snapshot covers (BDNS, budget, promise, a stale permalink), is
 * kept and counted — the gate reports what it could not evaluate rather than
 * quietly dropping it. `crossChecked[]` is by contract the log of what was
 * cross-checked, not a filtered list of what agrees, so a silent deletion would
 * misreport the machine's own work. Excluding requires proof; that proof is a
 * date on the record itself.
 */

/**
 * Fields that mark a moment a procurement record was already public. The
 * earliest value present on a row is that row's first-known date.
 *
 * `endDate` is excluded on purpose: it is when a contract stops running, always
 * later than the record's existence, and reading it as a first-known date would
 * exclude records that were live during the session.
 */
export const FIRST_KNOWN_FIELDS = [
  // Awarded-contract rows (tenders.json → contracts[]).
  'awardDate', // adjudicación
  'formalizedDate', // formalización
  'startDate', // inicio de ejecución
  // Licitación rows (tenders.json → tenders[]). Both precede the award; on an
  // SDA the submission window closes years out, so the minimum is what counts.
  'openProposalsDate', // apertura de proposiciones
  'submissionDate', // fin del plazo de presentación
  // TED notices (tenders-ted.json). `date` is the projected shape written by
  // tenders-ted.ts:asTenderRow, `publicationDate` the raw row. When TED could
  // only give the year, the scraper resolves it to 1 January — which moves the
  // date EARLIER, i.e. towards keeping the ref, so the gate stays sound.
  'publicationDate',
  'date',
] as const

/** Keys a row may carry the cross-reference target URL under. */
const REF_FIELDS = ['permalink', 'htmlUrl'] as const

/** Array properties a procurement snapshot may keep its rows in. */
const ROW_ARRAYS = ['contracts', 'tenders', 'items'] as const

const ISO_DAY = /^(\d{4}-\d{2}-\d{2})/

function isoDay(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const m = ISO_DAY.exec(value)
  return m ? m[1] : null
}

/**
 * The earliest date this row is attested to have existed, or `null` when it
 * carries none. 70 of the 1,233 rows in the current snapshot carry none — they
 * are undatable, not post-dated, and the caller must treat the two differently.
 */
export function firstKnownDate(row: unknown): string | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  let earliest: string | null = null
  for (const field of FIRST_KNOWN_FIELDS) {
    const day = isoDay(r[field])
    if (day && (earliest === null || day < earliest)) earliest = day
  }
  return earliest
}

/**
 * ref → first-known date. `null` means "the snapshot has this record and it
 * carries no date"; an absent key means "no snapshot covers this ref at all".
 * Both are un-datable, and the report keeps them apart so a run can say which.
 */
export type RecordDateIndex = ReadonlyMap<string, string | null>

/**
 * Index every procurement row in the given snapshots by its ref URL.
 *
 * One ref can name several rows — an SDA's derived call-offs, a licitación and
 * the contract it became — and the earliest date across all of them is the one
 * that answers the question, so rows merge by minimum rather than last-wins.
 */
export function buildRecordDateIndex(snapshots: readonly unknown[]): Map<string, string | null> {
  const index = new Map<string, string | null>()
  for (const snapshot of snapshots) {
    if (!snapshot || typeof snapshot !== 'object') continue
    const s = snapshot as Record<string, unknown>
    for (const arrayName of ROW_ARRAYS) {
      const rows = s[arrayName]
      if (!Array.isArray(rows)) continue
      for (const row of rows) {
        if (!row || typeof row !== 'object') continue
        const r = row as Record<string, unknown>
        let ref: string | null = null
        for (const field of REF_FIELDS) {
          if (typeof r[field] === 'string' && r[field]) {
            ref = r[field] as string
            break
          }
        }
        if (!ref) continue
        const day = firstKnownDate(row)
        if (!index.has(ref)) {
          index.set(ref, day)
          continue
        }
        const seen = index.get(ref) ?? null
        if (day && (seen === null || day < seen)) index.set(ref, day)
      }
    }
  }
  return index
}

/**
 * What the gate did, so a run can report attempted / dropped / not-evaluated
 * separately instead of folding "never checked" into "nothing to check".
 */
export interface RecordDateGateReport {
  /** Refs the index dated at or before the session. The gate ran on these. */
  kept: number
  /** Refs excluded, each with the date that proved the record post-dates. */
  postDated: Array<{ ref: string; firstKnown: string; plenoDate: string }>
  /** Refs the index covers but cannot date. Kept — undatable is not proof. */
  undated: string[]
  /** Refs no snapshot covers (BDNS, budget, promise, stale permalink). Kept. */
  unindexed: string[]
}

export function emptyRecordDateGateReport(): RecordDateGateReport {
  return { kept: 0, postDated: [], undated: [], unindexed: [] }
}

/**
 * `false` when the snapshot proves the record post-dates the session; `true`
 * in every other case, including every case the index cannot decide.
 *
 * Pass `report` to record which of those cases each ref fell into.
 */
export function recordKnowableAt(
  ref: string,
  plenoDate: string,
  index: RecordDateIndex | undefined,
  report?: RecordDateGateReport,
): boolean {
  if (!index || !index.has(ref)) {
    report?.unindexed.push(ref)
    return true
  }
  const firstKnown = index.get(ref) ?? null
  if (firstKnown === null) {
    report?.undated.push(ref)
    return true
  }
  if (firstKnown > plenoDate) {
    report?.postDated.push({ ref, firstKnown, plenoDate })
    return false
  }
  if (report) report.kept += 1
  return true
}

/** One-line run summary. Names what was never evaluated, not just what passed. */
export function summariseRecordDateGate(report: RecordDateGateReport): string {
  return (
    `${report.kept} dated & kept · ${report.postDated.length} dropped as post-dated · ` +
    `${report.undated.length} undated · ${report.unindexed.length} not in any procurement snapshot`
  )
}
