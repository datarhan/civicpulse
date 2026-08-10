/**
 * What was this artifact built from, and has any of it moved since?
 *
 * A derived snapshot records the content hash of every input it was built
 * from, in a top-level `builtFrom` beside the `generatedAt` and `source` these
 * files already carry. Stale means an input's hash today differs from the one
 * recorded — nothing to do with clocks.
 *
 * ## Why not mtime
 *
 * A CI checkout rewrites every file's mtime, so an mtime comparison marks the
 * entire corpus stale on every nightly run. A check that cries wolf on every
 * run is a check that gets switched off, which is worse than not having one.
 *
 * ## Why the artifact carries it, and not a side table
 *
 * `dept-stats.json` saying what it was built from is reviewable in a diff and
 * survives a rebase; a `.refresh-state.json` alongside it is a second source of
 * truth that can disagree with the file it describes. The one cost is that the
 * hash lives in the published JSON, which is fine — it is provenance, and this
 * project publishes provenance on purpose.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { sha256Short } from './hash'
import { stalenessInputs, type DataNode } from './data-graph'

const DATA_DIR = 'public/data'

/** Input basename → content hash. Absent inputs are recorded, not skipped. */
export type BuiltFrom = Record<string, string>

/**
 * Marker for an input that did not exist when the artifact was built.
 *
 * A distinct value rather than an omitted key: "this input was missing" and
 * "nobody recorded this input" are different facts, and only the second means
 * the artifact predates this scheme.
 */
export const ABSENT = 'absent'

export function hashOf(basename: string, dir = DATA_DIR): string {
  const path = resolve(dir, basename)
  if (!existsSync(path)) return ABSENT
  return sha256Short(readFileSync(path, 'utf8'))
}

/**
 * The `builtFrom` a node should record right now.
 *
 * Only `stalenessInputs` — an input the node also writes is excluded, or every
 * write-back node would be stale the instant it finished building.
 */
export function builtFromFor(node: DataNode, dir = DATA_DIR): BuiltFrom {
  const out: BuiltFrom = {}
  for (const input of stalenessInputs(node)) out[input] = hashOf(input, dir)
  return out
}

export type StaleReason =
  /** No artifact on disk. */
  | 'missing-output'
  /** Built before this scheme, or the field was stripped. */
  | 'no-builtFrom'
  /** The recorded block is not readable as one. */
  | 'unreadable-builtFrom'
  /** An input's hash differs from the recorded one. */
  | 'input-changed'
  /** The node has an input nothing recorded a hash for. */
  | 'input-unrecorded'

export interface Staleness {
  stale: boolean
  reason: StaleReason | null
  /** Which inputs moved, when `reason` is `input-changed`. */
  changed: string[]
}

const FRESH: Staleness = { stale: false, reason: null, changed: [] }

/**
 * Is `node`'s artifact out of date?
 *
 * Fails towards STALE at every ambiguity. A missing artifact, a missing
 * `builtFrom`, a malformed one, an input nobody recorded — each returns stale.
 * The alternative shape (`?? {}` and carry on) is the one that let a dead
 * backend print an all-clear, and here it would quietly stop rebuilding a page.
 */
export function stalenessOf(node: DataNode, dir = DATA_DIR): Staleness {
  const outputPath = resolve(dir, node.id)
  if (!existsSync(outputPath)) {
    return { stale: true, reason: 'missing-output', changed: [] }
  }

  let doc: unknown
  try {
    doc = JSON.parse(readFileSync(outputPath, 'utf8'))
  } catch {
    return { stale: true, reason: 'unreadable-builtFrom', changed: [] }
  }

  const recorded = (doc as { builtFrom?: unknown })?.builtFrom
  if (recorded === undefined) return { stale: true, reason: 'no-builtFrom', changed: [] }
  if (!recorded || typeof recorded !== 'object' || Array.isArray(recorded)) {
    return { stale: true, reason: 'unreadable-builtFrom', changed: [] }
  }

  const rec = recorded as Record<string, unknown>
  const changed: string[] = []
  for (const input of stalenessInputs(node)) {
    const was = rec[input]
    if (typeof was !== 'string') {
      return { stale: true, reason: 'input-unrecorded', changed: [input] }
    }
    if (was !== hashOf(input, dir)) changed.push(input)
  }

  return changed.length > 0 ? { stale: true, reason: 'input-changed', changed } : FRESH
}

/** One line for a report. */
export function describeStaleness(node: DataNode, s: Staleness): string {
  if (!s.stale) return `${node.id}: fresh`
  switch (s.reason) {
    case 'missing-output':
      return `${node.id}: never built`
    case 'no-builtFrom':
      return `${node.id}: built before provenance was recorded`
    case 'unreadable-builtFrom':
      return `${node.id}: builtFrom is unreadable`
    case 'input-unrecorded':
      return `${node.id}: ${s.changed[0]} is an input but no hash was recorded for it`
    default:
      return `${node.id}: ${s.changed.join(', ')} changed`
  }
}
