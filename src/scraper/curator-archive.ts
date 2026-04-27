/**
 * Curator archive — bundles the curator marked "unclear, leave for later".
 *
 * Why a curated, schema-validated, git-committed file? An archive
 * decision is editorial: someone reviewed the bundle and decided not
 * to publish a finding from it. That decision is part of the
 * accountability trail. If a journalist later asks "why didn't you
 * cover claim X?", the archive entry — with its dated reason — is
 * the answer.
 *
 * Mutations only via:
 *   · `npm run archive-bundle -- <plenoId> <topic> [reason]`
 *   · `npm run unarchive-bundle -- <plenoId> <topic>`
 *
 * The Vite curator plugin spawns these CLIs from the dashboard's
 * Archive / Un-archive buttons. The CLIs validate before writing.
 */

export interface ArchiveEntry {
  plenoId: string
  topic: string
  /** ISO 8601 timestamp the archive happened. */
  archivedAt: string
  /** Optional explanation the curator typed. ≤500 chars. */
  reason: string | null
  /** Tag for the dashboard. Always 'curator-v1' for this iteration. */
  archivedBy: string
}

export interface CuratorArchiveSnapshot {
  version: string
  generatedAt: string
  legalNotice: string
  items: ArchiveEntry[]
}

export const EMPTY_ARCHIVE: CuratorArchiveSnapshot = {
  version: '1.0',
  generatedAt: new Date(0).toISOString(),
  legalNotice:
    'Bundles archived from the curator dashboard. An archived bundle is one the curator reviewed and decided not to publish a finding from — typically because the verifier evidence was inconclusive or a contradicho match was a false positive. Archive decisions are auditable: each entry carries a timestamp + an optional reason. To revisit, the curator can un-archive the bundle from the dashboard.',
  items: [],
}

export class ArchiveValidationError extends Error {
  constructor(msg: string) {
    super(`curator-archive.json: ${msg}`)
    this.name = 'ArchiveValidationError'
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T/
const PLENO_ID_RE = /^[a-z0-9-]{3,40}$/
const TOPIC_RE = /^[a-z-]{3,40}$/

function must(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new ArchiveValidationError(msg)
}

function validateEntry(e: unknown, idx: number): ArchiveEntry {
  must(typeof e === 'object' && e !== null, `items[${idx}] must be object`)
  const o = e as Record<string, unknown>
  must(
    typeof o.plenoId === 'string' && PLENO_ID_RE.test(o.plenoId),
    `items[${idx}].plenoId must match ${PLENO_ID_RE}`,
  )
  must(
    typeof o.topic === 'string' && TOPIC_RE.test(o.topic),
    `items[${idx}].topic must match ${TOPIC_RE}`,
  )
  must(
    typeof o.archivedAt === 'string' && ISO_DATE.test(o.archivedAt),
    `items[${idx}].archivedAt must be ISO 8601`,
  )
  if (o.reason !== null) {
    must(
      typeof o.reason === 'string' && o.reason.length <= 500,
      `items[${idx}].reason must be null or string ≤500 chars`,
    )
  }
  must(
    typeof o.archivedBy === 'string' && o.archivedBy.length >= 3,
    `items[${idx}].archivedBy required`,
  )
  return {
    plenoId: o.plenoId as string,
    topic: o.topic as string,
    archivedAt: o.archivedAt as string,
    reason: (o.reason as string | null) ?? null,
    archivedBy: o.archivedBy as string,
  }
}

export function validateArchiveSnapshot(json: string): CuratorArchiveSnapshot {
  const raw = JSON.parse(json) as Record<string, unknown>
  must(typeof raw.version === 'string', 'version required')
  must(typeof raw.generatedAt === 'string', 'generatedAt required')
  must(
    typeof raw.legalNotice === 'string' && raw.legalNotice.length >= 40,
    'legalNotice must be ≥40 chars',
  )
  must(Array.isArray(raw.items), 'items must be array')
  const items = (raw.items as unknown[]).map((it, i) => validateEntry(it, i))
  // Same (plenoId, topic) only allowed once. Last write wins via the
  // CLI's de-dup, but the file as written must be unique.
  const seen = new Set<string>()
  for (const it of items) {
    const key = `${it.plenoId}/${it.topic}`
    must(!seen.has(key), `duplicate archive entry ${key}`)
    seen.add(key)
  }
  return {
    version: raw.version as string,
    generatedAt: raw.generatedAt as string,
    legalNotice: raw.legalNotice as string,
    items,
  }
}

/** Fast lookup helper for refresh-curate-queue. */
export function archiveKeySet(snap: CuratorArchiveSnapshot | null): Set<string> {
  const out = new Set<string>()
  for (const it of snap?.items ?? []) out.add(`${it.plenoId}/${it.topic}`)
  return out
}
