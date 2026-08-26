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
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
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

/**
 * Content hash of one input, which may be a file or a whole directory.
 *
 * A trailing `/` means a directory, hashed as a manifest of `name:hash` over
 * its sorted immediate entries. **Not recursive**, deliberately:
 * `pleno-transcripts/` contains a `superseded/` subdirectory holding the
 * transcripts a session had BEFORE it was re-transcribed, and letting those
 * perturb the live corpus would mark the claims stale every time an old
 * transcript was archived. Measured on the real corpus: 44 files, 9.6 MB,
 * 52 ms.
 *
 * An input containing a `/` resolves from the repo root rather than
 * `public/data`, because `pleno-speaker-map/` sits outside it.
 */
export function hashOf(input: string, dir = DATA_DIR): string {
  const isDir = input.endsWith('/')
  const name = isDir ? input.slice(0, -1) : input
  // A bare basename lives in `dir`; anything with a path separator is
  // repo-relative.
  const path = name.includes('/') ? resolve(name) : resolve(dir, name)
  if (!existsSync(path)) return ABSENT

  if (!isDir) return sha256Short(readFileSync(path, 'utf8'))

  const entries = readdirSync(path, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .sort()
  const manifest = entries
    .map((n) => `${n}:${sha256Short(readFileSync(resolve(path, n), 'utf8'))}`)
    .join('\n')
  // An empty directory and a missing one are different facts: the first is a
  // real, hashable state (nothing has been built yet), the second is ABSENT.
  return sha256Short(manifest)
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

/**
 * Record what the node was built from, in the artifact itself.
 *
 * Runs AFTER the command, because the command rewrites the file and would
 * discard a stamp written before it.
 *
 * Vive aquí y no en `refresh.ts` desde que hay un segundo sellador. Los nodos
 * `llm` y `curated` no los reconstruye `refresh` —ése es justo el contrato— así
 * que los sella quien hizo el trabajo: la tubería tras una extracción, y
 * `promote-claim` tras una promoción. Dos copias de esto habrían sido el
 * duplicado que este repositorio ya ha pagado varias veces: una se arregla y la
 * otra se queda mal. A node whose output is not JSON, or which
 * did not produce its output at all, is reported rather than silently left
 * unstamped — an unstamped node is stale forever, which looks like a rebuild
 * loop and is very hard to read backwards.
 */
export function sellar(node: DataNode, dir = DATA_DIR): string | null {
  // TODAS las salidas, no sólo `node.id`.
  //
  // Sellaba únicamente el fichero homónimo del nodo, así que un nodo con varias
  // salidas dejaba las demás sin procedencia para siempre. `compute:press-analytics`
  // escribe tres —press-trust.json, press-coverage-gaps.json y
  // press-triangulation.json— y sólo la primera llevaba `builtFrom`: las otras
  // dos se publicaban sin decir de qué salieron, que es justo el contrato que
  // este mecanismo existe para cumplir.
  //
  // `node.id` es el que decide la frescura (`stalenessOf` lo lee), y eso no
  // cambia: sellar las hermanas no reintroduce el bucle que `stalenessInputs`
  // evita, porque el sello no entra en el cálculo de staleness.
  const problemas: string[] = []
  for (const salida of node.writes) {
    const path = resolve(dir, salida)
    if (!existsSync(path)) {
      // Sólo es fallo si falta el fichero del propio nodo. Una salida
      // secundaria que un comando no produce en esta pasada no es una avería.
      if (salida === node.id) problemas.push(`${salida} was not produced by its own command`)
      continue
    }
    let doc: unknown
    try {
      doc = JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      problemas.push(`${salida} is not JSON — cannot record provenance`)
      continue
    }
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
      problemas.push(`${salida} is not a JSON object — cannot record provenance`)
      continue
    }
    const next = { ...(doc as Record<string, unknown>), builtFrom: builtFromFor(node, dir) }
    writeFileSync(path, JSON.stringify(next, null, 2) + '\n')
  }
  return problemas.length > 0 ? problemas.join(' · ') : null
}
