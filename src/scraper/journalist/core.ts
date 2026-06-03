/**
 * Journalist subsystem — validation primitives shared by ./sections and
 * ./validators: the error class, the ISO/URL/slug regexes, the `must`
 * assertion, and the snapshot-meta validator. Verbatim from the monolith.
 */

export class JournalistValidationError extends Error {
  constructor(msg: string) {
    super(`journalist: ${msg}`)
    this.name = 'JournalistValidationError'
  }
}

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}/
export const ISO_FULL = /^\d{4}-\d{2}-\d{2}T/
export const URL_RE = /^https?:\/\/\S+$/
export const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/

export function must(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new JournalistValidationError(msg)
}

export function validateSnapshotMeta(raw: Record<string, unknown>): {
  version: string
  generatedAt: string
} {
  must(typeof raw.version === 'string' && raw.version.length > 0, 'version required')
  must(
    typeof raw.generatedAt === 'string' && ISO_FULL.test(raw.generatedAt),
    'generatedAt must be ISO datetime',
  )
  return { version: raw.version, generatedAt: raw.generatedAt }
}
