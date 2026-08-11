/**
 * Withdrawing a whole published finding.
 *
 * `applyFindingCorrection` amends a finding, `applyFindingRemoval` drops one
 * row from it, and `applyFindingRedaction` rewrites its prose while digesting
 * what stood there. All three assume the finding survives. When it cannot —
 * when what is left after the editorial gate has taken its quotes is a page
 * that documents nothing — the module already says what to do:
 *
 *     "refusing to redact to a stub: … If the finding cannot be stated without
 *      the redacted material, retract it."   (applyFindingRedaction)
 *
 * There was no way to. `finding-exception.ts` records the gap in a comment —
 * "no such CLI exists" — and so three findings stayed published whose every
 * quote the gate withholds, their summaries carrying the accusation the gate
 * had refused to show.
 *
 * ## Why this is not `retract-pleno-vote`
 *
 * That CLI is the model for everything here except one thing: it tombstones
 * `original` VERBATIM, and says so on purpose — "a correction that does not
 * say what it corrected is not auditable." Right for a vote. A withdrawn tally
 * republished is a fact about how groups voted; nobody is harmed by reading
 * it, and the reader needs it to judge the withdrawal.
 *
 * These findings are withdrawn for the opposite reason: their content is an
 * accusation about a named political group that no record supports. A ledger
 * carrying the prose would keep it fetchable under `public/`, at a stable URL,
 * for exactly as long as the site exists — which is the publication the
 * retraction removes. "Not rendered" is not "not published"; that assumption
 * left 24 unreviewed drafts about named councillors web-fetchable for weeks.
 *
 * So the tombstone stores a **digest and counts**: enough to prove a specific
 * finding stood here, that it was withdrawn on a date by a named editor for a
 * stated reason, and enough for anyone holding the original to verify the
 * tombstone matches it. Not enough to read it. That is the trade this file
 * makes deliberately, and the leak test is its enforcement.
 *
 * ## Why there is no `--unretract`
 *
 * `retract-pleno-vote` has one, because its ledger holds the content and can
 * put it back. This one cannot: the prose is gone by design. A withdrawal here
 * is final, and the way back is to publish a new finding, with a new id and
 * its own evidence — which is the honest thing anyway. Restoring an accusation
 * because a curator changed their mind should look like publishing it, not
 * like flipping a flag.
 */
import { sha256Short } from './hash'
import { normaliseForQuoteMatch } from './quote-match'
import {
  ALLOWED_FINDING_SEVERITIES,
  reasonEchoesRemoved,
  type PlenoFinding,
  type PlenoFindingsSnapshot,
} from './pleno-finding'

/** Same floor as every other curator reason in this repo. */
export const RETRACTION_REASON_MIN = 20

/**
 * Consecutive normalised words of withdrawn prose that may not reappear in the
 * reason. Six is short enough to catch a quoted fragment and long enough that
 * ordinary description — "el sumario reproducía una cita que la puerta oculta"
 * — never trips it.
 */
const REASON_ECHO_WORDS = 6

/** What a finding tombstone looks like, for tests and for the validator. */
export const FINDING_DIGEST_RE = /^hallazgo · sha256:[0-9a-f]{12}$/

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/

export interface FindingRetraction {
  /** The withdrawn finding's id. Never reused. */
  findingId: string
  /** Why. ≥20 chars, and may not quote what was withdrawn. */
  reason: string
  /** Curator signature. A script name here would be a lie about who judged. */
  editor: string
  retractedAt: string
  /**
   * The withdrawn finding, digested. See the header for why this is not the
   * prose. Anyone holding the original can recompute it and confirm the match;
   * nobody can read it back out.
   */
  digest: string
  /** Countable without being readable — what the page used to hold. */
  quoteCount: number
  crossCheckedCount: number
  /** Public facts the reader needs to place the gap in the record. */
  severity: PlenoFinding['severity']
  plenoId: string
  plenoDate: string
}

/**
 * The digest, over every field whose prose the retraction unpublishes.
 *
 * Covers title, summary and quote texts — not ids, dates or counts, which the
 * tombstone publishes anyway. Serialised through JSON.stringify so a quote
 * containing the separator cannot collide with two quotes that do not.
 */
export function findingTombstone(finding: PlenoFinding): string {
  const material = JSON.stringify([
    finding.title,
    finding.summary,
    ...(finding.quotes ?? []).map((q) => q.text),
  ])
  return `hallazgo · sha256:${sha256Short(material)}`
}

/**
 * Every fragment of withdrawn prose the reason must not carry.
 *
 * `reasonEchoesRemoved` is the existing guard and stays first: it reads
 * capitalisation, so it catches a name even in a two-word overlap. It also
 * says plainly what it misses — "a reason that avoids every name and still
 * describes the allegation in lowercase passes this". Every accusation
 * withdrawn here is lowercase Spanish prose, which is precisely that blind
 * spot, so a shingle check backs it: no six consecutive words of the withdrawn
 * text may reappear in the reason.
 *
 * Returns the offending fragment, or null when the reason is clean.
 */
export function reasonEchoesWithdrawn(reason: string, finding: PlenoFinding): string | null {
  const prose = [finding.title, finding.summary, ...(finding.quotes ?? []).map((q) => q.text)]
  for (const text of prose) {
    const named = reasonEchoesRemoved(reason, { text, ref: null })
    if (named) return named
  }
  const haystack = normaliseForQuoteMatch(reason)
  if (!haystack) return null
  for (const text of prose) {
    const words = normaliseForQuoteMatch(text).split(' ').filter(Boolean)
    for (let i = 0; i + REASON_ECHO_WORDS <= words.length; i++) {
      const shingle = words.slice(i, i + REASON_ECHO_WORDS).join(' ')
      if (haystack.includes(shingle)) return shingle
    }
  }
  return null
}

export interface RetractFindingArgs {
  findingId: string
  reason: string
  editor: string
  retractedAt: string
}

/**
 * Withdraw a finding: out of `items`, into `retractions`.
 *
 * Pure — returns a new snapshot and never touches the one it was given. The
 * caller MUST re-validate the whole snapshot before persisting, exactly as
 * with the three appliers in `pleno-finding.ts`.
 */
export function retractFinding(
  snapshot: PlenoFindingsSnapshot,
  args: RetractFindingArgs,
): PlenoFindingsSnapshot {
  const { findingId, editor, retractedAt } = args
  const reason = args.reason.trim()

  const finding = snapshot.items.find((f) => f.id === findingId)
  if (!finding) {
    throw new Error(
      `no published finding with id "${findingId}" — it may already be retracted, ` +
        'and a retraction is not reversible',
    )
  }
  if (reason.length < RETRACTION_REASON_MIN) {
    throw new Error(
      `--reason must be ≥${RETRACTION_REASON_MIN} characters: it publishes beside the ` +
        'tombstone and is the only account a reader gets of why the page went away',
    )
  }
  if (!editor.trim()) throw new Error('--editor is required: a withdrawal is signed')

  const echo = reasonEchoesWithdrawn(reason, finding)
  if (echo) {
    throw new Error(
      `--reason echoes the withdrawn text ("${echo}"). The reason is published; ` +
        'quoting what was withdrawn re-publishes it. Describe the criterion, not the material.',
    )
  }

  const retraction: FindingRetraction = {
    findingId,
    reason,
    editor: editor.trim(),
    retractedAt,
    digest: findingTombstone(finding),
    quoteCount: (finding.quotes ?? []).length,
    crossCheckedCount: (finding.crossChecked ?? []).length,
    severity: finding.severity,
    plenoId: finding.plenoId,
    plenoDate: finding.plenoDate,
  }

  return {
    ...snapshot,
    items: snapshot.items.filter((f) => f.id !== findingId),
    retractions: [...(snapshot.retractions ?? []), retraction],
  }
}

export function isRetracted(snapshot: PlenoFindingsSnapshot, findingId: string): boolean {
  return (snapshot.retractions ?? []).some((r) => r.findingId === findingId)
}

/**
 * Gate for a hand-edited file. The load-bearing check is `digest`: someone
 * restoring readability "so the ledger is useful" would defeat the design, and
 * would do it in a file Vercel serves.
 */
export function validateFindingRetraction(r: unknown, idx = -1): FindingRetraction {
  const at = idx >= 0 ? `retractions[${idx}]` : 'retraction'
  const fail = (msg: string): never => {
    throw new Error(`${at}: ${msg}`)
  }
  if (!r || typeof r !== 'object' || Array.isArray(r)) fail('must be an object')
  const o = r as Record<string, unknown>

  const str = (k: string): string => {
    const v = o[k]
    if (typeof v !== 'string' || !v.trim()) fail(`${k} must be a non-empty string`)
    return v as string
  }
  const count = (k: string): number => {
    const v = o[k]
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
      fail(`${k} must be a non-negative integer`)
    }
    return v as number
  }

  const findingId = str('findingId')
  const reason = str('reason')
  if (reason.trim().length < RETRACTION_REASON_MIN) {
    fail(`reason must be ≥${RETRACTION_REASON_MIN} characters`)
  }
  const editor = str('editor')
  const retractedAt = str('retractedAt')
  if (!ISO_INSTANT.test(retractedAt)) fail('retractedAt must be an ISO instant')

  const digest = str('digest')
  if (!FINDING_DIGEST_RE.test(digest)) {
    fail(
      'digest must be a `hallazgo · sha256:…` tombstone, never the withdrawn prose. ' +
        'The ledger records that a finding stood here, not what it said.',
    )
  }

  const severity = o.severity
  if (!ALLOWED_FINDING_SEVERITIES.includes(severity as PlenoFinding['severity'])) {
    fail(`severity must be one of ${ALLOWED_FINDING_SEVERITIES.join(' | ')}`)
  }

  return {
    findingId,
    reason,
    editor,
    retractedAt,
    digest,
    quoteCount: count('quoteCount'),
    crossCheckedCount: count('crossCheckedCount'),
    severity: severity as PlenoFinding['severity'],
    plenoId: str('plenoId'),
    plenoDate: str('plenoDate'),
  }
}
