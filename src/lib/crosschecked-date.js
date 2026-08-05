// @ts-check
/**
 * When is a cross-checked document from?
 *
 * `crossChecked[]` lists the documents a finding's claims were checked
 * against — agreeing or not. Every ref carries `kind`, `ref` and `snippet`,
 * and nothing else: no date. That gap is not cosmetic. `f-2026-07-03-cit-1e90e0`
 * documents a JULY 2026 debate about an emergency waste contract, and the
 * first document under it opens «contrato emergencia acondicionamiento de
 * caminos…» — an emergency contract, yes, but from the NOVEMBER 2022 storms,
 * about roads and a retaining wall. A reader scanning the list saw the words
 * «contrato emergencia» beneath a finding about an emergency contract and had
 * no way to tell the document was four years older than the debate.
 *
 * The reference is a true record and stays: the list means «cotejado», not
 * «coincide». What was missing was the one fact that tells the two apart, and
 * it was already in the data — just not on screen.
 *
 * WHICH date. A procurement record carries several, and they mean different
 * things, so the resolved date is always returned WITH the field it came from.
 * Anything a reader could mistake for "when this document happened" is
 * excluded — `endDate` in particular, which says when a contract will finish
 * and is routinely in the future.
 *
 * Contracts win over tenders when a permalink is in both arrays (390 of them
 * are): the same procurement, further along, and the contract row is the one
 * that carries the award date. And one permalink is one expediente but not
 * always one row — 66 of them have several, one per lot, with different (or
 * absent) dates. The strongest field any lot carries decides, and the earliest
 * value of that field wins, so the answer does not depend on array order.
 */

/**
 * @typedef {{ iso: string, field: string }} RefDate
 * @typedef {{ permalink?: string, [k: string]: unknown }} ProcurementRow
 */

/**
 * Contract date fields, in the order a reader would name the document by.
 * `endDate` is deliberately absent — see the module note.
 * @type {[string, string][]}
 */
const CONTRACT_FIELDS = [
  ['awardDate', 'award'],
  ['formalizedDate', 'formalized'],
  ['startDate', 'start'],
]

/**
 * Tender (not-yet-awarded) date fields. `openProposalsDate` first:
 * `submissionDate` is a deadline and can be a far-future placeholder — one row
 * in the current snapshot carries 2033 — which would print as the document's
 * date.
 * @type {[string, string][]}
 */
const TENDER_FIELDS = [
  ['openProposalsDate', 'opened'],
  ['submissionDate', 'submission'],
]

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Strongest field any of these rows carries, at its earliest value.
 * @param {ProcurementRow[]} rows
 * @param {[string, string][]} fields
 * @returns {RefDate|null}
 */
function pick(rows, fields) {
  for (const [key, field] of fields) {
    let earliest = null
    for (const row of rows) {
      const v = row[key]
      if (typeof v === 'string' && ISO_DATE.test(v) && (earliest === null || v < earliest)) {
        earliest = v
      }
    }
    if (earliest !== null) return { iso: earliest, field }
  }
  return null
}

/**
 * @param {Map<string, ProcurementRow[]>} into
 * @param {ProcurementRow[]|undefined} rows
 */
function group(into, rows) {
  for (const row of rows ?? []) {
    if (typeof row?.permalink !== 'string') continue
    const bucket = into.get(row.permalink)
    if (bucket) bucket.push(row)
    else into.set(row.permalink, [row])
  }
}

/**
 * Index a tenders snapshot by permalink → the date that names the document.
 *
 * A row present in both `contracts` and `tenders` resolves from the contract.
 * A row with no usable date is indexed as `null` — deliberately, so a caller
 * can tell "this document publishes no date" (render it as such) apart from
 * "this document is not in the snapshot" (say nothing, the index may be
 * loading). Collapsing the two is how a missing date starts reading as recent.
 *
 * @param {{ contracts?: ProcurementRow[], tenders?: ProcurementRow[] }|null|undefined} snapshot
 * @returns {Map<string, RefDate|null>}
 */
export function buildRefDateIndex(snapshot) {
  /** @type {Map<string, RefDate|null>} */
  const index = new Map()
  if (!snapshot) return index

  /** @type {Map<string, ProcurementRow[]>} */
  const contracts = new Map()
  /** @type {Map<string, ProcurementRow[]>} */
  const tenders = new Map()
  group(contracts, snapshot.contracts)
  group(tenders, snapshot.tenders)

  for (const link of new Set([...contracts.keys(), ...tenders.keys()])) {
    const fromContract = contracts.has(link)
      ? pick(contracts.get(link) ?? [], CONTRACT_FIELDS)
      : null
    // Falling back to the tender stage when no lot was ever awarded is more
    // than the contract row can say, and it is still a date this expediente
    // published — labelled as the stage it came from, not as an award.
    const chosen =
      fromContract ?? (tenders.has(link) ? pick(tenders.get(link) ?? [], TENDER_FIELDS) : null)
    index.set(link, chosen)
  }
  return index
}

/** @type {Map<string, RefDate|null>} */
const EMPTY_INDEX = new Map()

/**
 * Per-snapshot memo. `RefList` renders once per finding *and* once per ref
 * list, so on `/hallazgos` it mounts ~90 times; without this each mount would
 * walk all 1.231 procurement rows again. Keyed on the parsed snapshot object,
 * which the snapshot store keeps stable for the session, so the index is built
 * exactly once and drops when the snapshot does.
 *
 * @param {any} snapshot
 * @returns {Map<string, RefDate|null>}
 */
const memo = new WeakMap()
export function refDateIndexFor(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return EMPTY_INDEX
  const hit = memo.get(snapshot)
  if (hit) return hit
  const built = buildRefDateIndex(snapshot)
  memo.set(snapshot, built)
  return built
}

/**
 * The date to show beside one cross-checked ref.
 *
 * Three outcomes, kept distinct on purpose:
 *   · `{ iso, field }` — a date, and which date it is
 *   · `null`           — the document is known and publishes no usable date
 *   · `undefined`      — nothing resolved this ref yet (index absent/loading)
 *
 * @param {{ kind?: string, ref?: string }} ref
 * @param {Map<string, RefDate|null>} index
 * @param {string|null|undefined} plenoDate ISO date of the session the finding is about
 * @returns {RefDate|null|undefined}
 */
export function refDate(ref, index, plenoDate) {
  if (!ref) return undefined
  // A pleno recording is the session itself: its date is the session's, which
  // the finding already carries. No lookup, and no snapshot needed for it.
  if (ref.kind === 'pleno-video') {
    return typeof plenoDate === 'string' && ISO_DATE.test(plenoDate)
      ? { iso: plenoDate, field: 'session' }
      : undefined
  }
  if (typeof ref.ref !== 'string' || !index) return undefined
  return index.has(ref.ref) ? index.get(ref.ref) : undefined
}
