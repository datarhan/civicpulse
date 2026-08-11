/**
 * A record of which exception rows a person has already looked at.
 *
 * ## Why the queue could not converge without this
 *
 * The queue selects on `citasMostrables === 0` — no quote the editorial gate
 * would show outright. Deciding that a finding DESERVES the exception changes
 * nothing about the finding, so the row reappears on the next run, identical,
 * forever. Thirty-nine rows that never shrink is a list people stop opening,
 * and the ones that matter are then invisible among the ones already judged.
 *
 * Only "keep" needs recording. A decision to correct writes a summary through
 * `correct-pleno-finding`, which changes the finding and is its own evidence.
 *
 * ## The review is bound to the text that was reviewed
 *
 * Each entry stores a hash of the summary as it stood. If the summary later
 * changes, the review no longer describes what is published and the row comes
 * back. Reviewing a finding is not a permanent exemption for its id — it is a
 * judgement about specific words, and content-addressing it is the same
 * discipline as asking "has X changed" by hashing X.
 *
 * Lives in `editorial/`, never under `public/`: it names findings about
 * political groups alongside who cleared them.
 */
import { sha256Short } from './hash'

export const REVIEW_LOG_VERSION = 'finding-exception-review-v1'

export interface ExceptionReview {
  findingId: string
  /** Only `keep` is recorded; a correction is evidenced by the correction. */
  decision: 'keep'
  /** Who decided. Published nowhere, but it is a real signature. */
  reviewer: string
  reviewedAt: string
  /** The summary as it read when reviewed. */
  summaryHash: string
  /** Why it earns the exception, in the reviewer's own words. */
  note: string
}

export interface ExceptionReviewLog {
  version: string
  generatedAt: string
  reviews: ExceptionReview[]
}

export function summaryHash(summary: string): string {
  return sha256Short(summary.replace(/\s+/g, ' ').trim())
}

/**
 * Is this finding's CURRENT summary already reviewed?
 *
 * False whenever anything is uncertain — no log, no entry, or a summary that
 * has moved since. The cost of re-reviewing is a minute of someone's
 * attention; the cost of hiding an unreviewed claim about a political group is
 * the thing the queue exists to prevent.
 */
export function isReviewed(
  log: ExceptionReviewLog | null,
  findingId: string,
  currentSummary: string,
): boolean {
  if (!log?.reviews) return false
  const entry = log.reviews.find((r) => r.findingId === findingId)
  if (!entry) return false
  return entry.summaryHash === summaryHash(currentSummary)
}

/**
 * Add or replace a review. Replacing matters: a finding whose summary changed
 * and was re-reviewed should carry one current entry, not a pile of stale ones.
 */
export function recordReview(
  log: ExceptionReviewLog | null,
  review: ExceptionReview,
): ExceptionReviewLog {
  const reviews = (log?.reviews ?? []).filter((r) => r.findingId !== review.findingId)
  return {
    version: REVIEW_LOG_VERSION,
    generatedAt: review.reviewedAt,
    reviews: [...reviews, review].sort((a, b) => a.findingId.localeCompare(b.findingId)),
  }
}

/** Entries whose finding no longer exists, or whose summary moved on. */
export function staleReviews(
  log: ExceptionReviewLog | null,
  summariesById: ReadonlyMap<string, string>,
): ExceptionReview[] {
  return (log?.reviews ?? []).filter((r) => {
    const current = summariesById.get(r.findingId)
    return current === undefined || summaryHash(current) !== r.summaryHash
  })
}
