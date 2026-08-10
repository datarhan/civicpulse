// @ts-check
/**
 * What does the procurement register say happened to a cross-checked document?
 *
 * `crossChecked[]` lists the documents a finding's claims were checked
 * against — agreeing or not — and `RefList` publishes each one's DATE. It
 * never published its STATE. FIVE of those refs point at four PLACSP
 * expedientes annulled before award: `finalAmount: 0`, no assignee, and no
 * award, formalisation or start date at all. (That absence is also why the date
 * beside them stays blank — `endDate` is excluded from the date fields on
 * purpose, and an annulled expediente publishes nothing else.)
 *
 * Five and four, not the four and three a scan for «every row is void» finds:
 * expediente 68/2025, the Dirección Facultativa of the Centro Polivalente, is
 * `void` in the licitaciones table while its contract row publishes no status
 * at all. Ranking the two tables would have hidden it; pooling them does not.
 *
 * So a reader saw an abandoned procurement sitting under «Documentos
 * cotejados» beneath a finding about municipal spending, with nothing on screen
 * to say the council never signed it. The list is honest — it means «cotejado»,
 * not «coincide» — and no published prose names these four, so the established
 * removal criteria leave them in place. Which makes disclosure the fix: show
 * the one fact that tells an annulled procedure from a signed contract, and it
 * was already in the data.
 *
 * THREE OUTCOMES, kept apart on purpose, exactly as `crosschecked-date.js`
 * keeps its three:
 *
 *   · `{ kind: 'cancelled' | 'committed' | 'in-flight', status }`
 *        the register publishes a state, and which one
 *   · `null`      the document is known and publishes NO usable state
 *   · `undefined` nothing has resolved this ref yet (snapshot still loading)
 *
 * The middle one is the sentinel case and it is not a value. 42 contract rows
 * and one tender row carry `status: 'unknown'`, which is Gobierto's blank after
 * normalisation — «cannot tell», not «a state called unknown». It leaked into
 * reader-facing text anyway: `claim-verifier.ts` appends `· estado: ${status}`
 * to every tender snippet it writes, so 16 published snippets end with the
 * literal «· estado: unknown». `snippetWithoutStatus` strips that tail for
 * display now that a real field renders it properly.
 *
 * DERIVED, never curated. Nothing here writes to `pleno-findings.json`; the
 * state is read live from `tenders.json`, the same snapshot the date comes
 * from, so an expediente that formalises tomorrow stops reading as annulled
 * without anyone editing a published finding.
 */

import {
  procurementStatusKind,
  COMMITTED_STATUSES,
  CANCELLED_STATUSES,
  IN_FLIGHT_STATUSES,
} from './contract-status.js'

/**
 * @typedef {'committed'|'cancelled'|'in-flight'} RefStatusKind
 * @typedef {{ kind: RefStatusKind, status: string }} RefStatus
 * @typedef {{ permalink?: string, status?: string, [k: string]: unknown }} ProcurementRow
 */

/**
 * Which kind wins when one expediente's lots disagree, and which status names
 * it inside that kind.
 *
 * 9 of the 119 tender refs on `/hallazgos` have a void lot AND an awarded one:
 * `awarded+formalized+void` on seven, `awarded+provisionally_awarded+void` on
 * one. Those expedientes DID produce a contract, and marking them annulled
 * because one lot fell through would be the same error in the other direction.
 * So a contract that exists outranks one that does not, and «anulado» is
 * reserved for an expediente where NO lot reached an award.
 *
 * Vocabulary and order both come from `contract-status.js` — the module that
 * already owns this partition for the money figures. A fourth Gobierto status
 * lands in no bucket, resolves to `null`, and renders as «no consta»: an honest
 * miss, never a guess.
 *
 * @type {[RefStatusKind, string[]][]}
 */
const KIND_ORDER = [
  ['committed', COMMITTED_STATUSES],
  ['in-flight', IN_FLIGHT_STATUSES],
  ['cancelled', CANCELLED_STATUSES],
]

/**
 * The kinds a resolved ref can carry. Derived from the table above and
 * exported so the wording map in `PlenoFindings` is checked against it rather
 * than restating it — a hand-copied list of states is how six tests in this
 * repo stayed green while production matched nothing.
 * @type {RefStatusKind[]}
 */
export const REF_STATUS_KINDS = KIND_ORDER.map(([kind]) => /** @type {RefStatusKind} */ (kind))

/**
 * Strongest state any of these rows reached.
 *
 * The sentinel cannot come out of here BY CONSTRUCTION rather than by a filter:
 * the only way to return a status is to find it inside one of the three ordered
 * lists, and `unknown` is in none of them. The `procurementStatusKind` call
 * below is belt-and-braces — it states the rule where it applies, and deleting
 * it changes no answer. `tests/crosschecked-status.test.ts` pins the structural
 * property by driving every status the parser can emit through the index, so
 * the one edit that COULD leak the sentinel — adding it to an ordered list —
 * goes red.
 *
 * @param {ProcurementRow[]} rows
 * @returns {RefStatus|null}
 */
function pickStatus(rows) {
  const present = new Set()
  for (const row of rows) {
    const s = typeof row?.status === 'string' ? row.status.trim().toLowerCase() : ''
    // `unknown` and anything unrecognised contribute NOTHING — they are the
    // absence of a state, and a lot that publishes none cannot outvote a lot
    // that does. Same treatment `pick()` gives a row with no date.
    if (s && procurementStatusKind(s)) present.add(s)
  }
  if (present.size === 0) return null
  for (const [kind, order] of KIND_ORDER) {
    for (const status of order) {
      if (present.has(status)) return { kind, status }
    }
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
 * Index a tenders snapshot by permalink → the state that names the document.
 *
 * Contracts and tenders are pooled rather than ranked: unlike a date, where the
 * contract row is authoritative because it is the one carrying the award, a
 * state is a state whichever table publishes it — and one of the four void refs
 * is void in `tenders` while its contract row says `unknown`.
 *
 * A permalink whose rows publish no usable state is indexed as `null`, so a
 * caller can tell «this document publishes no state» (say so) apart from «this
 * document is not in the snapshot» (say nothing, it may be loading).
 *
 * @param {{ contracts?: ProcurementRow[], tenders?: ProcurementRow[] }|null|undefined} snapshot
 * @returns {Map<string, RefStatus|null>}
 */
export function buildRefStatusIndex(snapshot) {
  /** @type {Map<string, RefStatus|null>} */
  const index = new Map()
  if (!snapshot) return index
  /** @type {Map<string, ProcurementRow[]>} */
  const rows = new Map()
  group(rows, snapshot.contracts)
  group(rows, snapshot.tenders)
  for (const [link, bucket] of rows) index.set(link, pickStatus(bucket))
  return index
}

/** @type {Map<string, RefStatus|null>} */
const EMPTY_INDEX = new Map()

/**
 * Per-snapshot memo, for the same reason `refDateIndexFor` has one: `RefList`
 * mounts ~90 times on `/hallazgos` and this walks all 1.231 procurement rows.
 * Keyed on the parsed snapshot object, which the session store keeps stable.
 *
 * @param {any} snapshot
 * @returns {Map<string, RefStatus|null>}
 */
const memo = new WeakMap()
export function refStatusIndexFor(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return EMPTY_INDEX
  const hit = memo.get(snapshot)
  if (hit) return hit
  const built = buildRefStatusIndex(snapshot)
  memo.set(snapshot, built)
  return built
}

/**
 * The state to show beside one cross-checked ref. See the module note for the
 * three outcomes.
 *
 * A `pleno-video` ref is a recording of a session, not a procurement: it has no
 * state to publish and asking the index about it would be a category error.
 *
 * @param {{ kind?: string, ref?: string }} ref
 * @param {Map<string, RefStatus|null>} index
 * @returns {RefStatus|null|undefined}
 */
export function refStatus(ref, index) {
  if (!ref || ref.kind === 'pleno-video') return undefined
  if (typeof ref.ref !== 'string' || !index) return undefined
  return index.has(ref.ref) ? index.get(ref.ref) : undefined
}

/**
 * The `· estado: <token>` tail `claim-verifier.ts` appends to every tender
 * snippet, removed for display.
 *
 * Display only. `pleno-findings.json` is curated and its single writer is
 * `npm run correct-pleno-finding`; the sentinel survives underneath, in the
 * committed snippet and in the verifier output that produced it, and fixing it
 * at the source is a change to the writer, not to the page.
 *
 * Conservative by construction: it strips a trailing separator, the literal
 * `estado:` and ONE token — never a snippet that merely mentions the word, and
 * never text in the middle. The token may be cut off (`· estado: awarde…`):
 * snippets are truncated at a fixed length upstream, so one of the 119 lands
 * mid-word, and half a status word is no more use to a reader than a whole one.
 *
 * @param {string|null|undefined} snippet
 * @returns {string}
 */
export function snippetWithoutStatus(snippet) {
  if (typeof snippet !== 'string') return ''
  return snippet.replace(/\s*·\s*estado:\s*[a-z_]*(?:…|\.\.\.)?\s*$/i, '').trim()
}
