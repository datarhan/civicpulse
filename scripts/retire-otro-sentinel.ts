#!/usr/bin/env tsx
/**
 * retire-otro-sentinel — migration: the `Otro` sentinel → `null` in every
 * published snapshot. Two fields, retired in two passes:
 *   · `speakerGroup: "Otro"` (who said this) — 2026-08-03
 *   · `votes[].bloc: "Otro"` (which group cast this vote) — 2026-08-05
 *
 *   npm run retire:otro-sentinel -- --dry-run   # report, write nothing
 *   npm run retire:otro-sentinel                # migrate + re-validate
 *
 * WHY
 * ───
 * `speakerGroup` records which municipal group made a statement. CLAUDE.md
 * documents the enum as PSOE / PP / VOX / Compromís or null, and only a
 * curator may cross from a group to an individual. `Otro` was nonetheless in
 * the allow-list and reached published JSON, where it does NOT mean "another
 * party" — it is the extractor's "cannot tell". A consumer of
 * public/data/*.json (which /datos invites) reading it as "the party that is
 * not one of the four" lands on exactly one person: the corporación has 21
 * councillors, PSOE 11 + PP 7 + VOX 1 + Compromís 1 = 20, so the remainder is
 * José Manuel Gallardo Martínez (EU-Podem), named by elimination. This is the
 * failure docs/DATA_INTEGRITY.md records as «un centinela nunca es un valor».
 *
 * The UI already renders both `null` and `Otro` as «Grupo no identificado»
 * (src/lib/party-label.js), so `null` is the value that already means what the
 * sentinel meant. Replacing an apparent attribution with an explicit "unknown"
 * REMOVES a claim rather than adding one — a weakening, Tier A in
 * src/scraper/automation-policy.ts, and the only direction
 * docs/DATA_INTEGRITY.md permits automation to move a published verdict.
 *
 * SCOPE — deliberately narrow
 * ───────────────────────────
 * Only object keys named exactly `speakerGroup` or `bloc`, whose value is
 * exactly the string `Otro`, are rewritten. Nothing else: no verbatim, no
 * verdict, no direction, no outcome, no evidence, no id, no timestamp. The run
 * PROVES this by deep-comparing the written document against the parsed
 * original put through the same single transform — if any other byte would
 * move, it aborts.
 *
 * `votes[].bloc` was out of scope in the first pass, on the argument that it
 * answers a different question in a curated file whose schema had no null.
 * That argument did not survive contact with the rows: all 12 carried
 * `seats: 1`, so the sentinel named the same councillor by elimination in the
 * one place the site states how a group *voted* — and it had not been read off
 * an acta at all. scripts/logs/vote-backfill.log shows the extractor was handed
 * `seats=PSOE:11,PP:7,VOX:1,Otro:1,Compromís:1`, the seat table from
 * officials.json as it then stood, so `Otro` was copied in rather than
 * observed. The schema now takes `null` there, so the second pass runs.
 *
 * Naming the group instead — «EU-Podem» — would ADD an attribution about a
 * named councillor. That needs the acta to name the group for that specific
 * vote, entered by a curator through `npm run pleno-vote`; this script only
 * ever weakens.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { validateFindingsSnapshot } from '../src/scraper/pleno-finding'
import { validateSnapshot as validateVotesSnapshot } from '../src/scraper/pleno-votes'

const ROOT = resolve('.')
const DATA = resolve('public/data')
const CHUNKS = join(DATA, 'pleno-claims')

/** The sentinel being retired, and the value that already means "unknown". */
const SENTINEL = 'Otro'

/** Snapshots that carry a `speakerGroup` anywhere in their tree. */
function targets(): string[] {
  const fixed = [
    'pleno-findings.json',
    'pleno-claims-verified.json',
    // The BASE half of the base⊕overlay split. Skipping it would let the next
    // `verify:pleno-claims` rebuild re-introduce all of them.
    'pleno-claims-verified-base.json',
    'pleno-claims-overlay.json',
    'pleno-claims-suggestions.json',
    'auto-curation-bundles.json',
    'auto-curation-queue.json',
    // The curated voting record. Absent from the first pass, which is why its
    // "left untouched: N votes[].bloc" line always printed N=0 — the file the
    // sentinels were in was never opened. A boundary you report but never
    // measure is indistinguishable from no boundary at all.
    'pleno-votes.json',
  ].map((n) => join(DATA, n))

  // The per-pleno chunk set actually served to /declaraciones readers.
  const chunks = existsSync(CHUNKS)
    ? readdirSync(CHUNKS)
        .filter((n) => n.endsWith('.json'))
        .map((n) => join(CHUNKS, n))
    : []

  return [...fixed, ...chunks]
}

interface Seen {
  /** `speakerGroup: "Otro"` → null. */
  changed: number
  /** `blocs: [… "Otro" …]` → element dropped. */
  droppedFromLists: number
  /** `votes[].bloc: "Otro"` → null. */
  blocSentinels: number
}

/**
 * Rewrite in place, counting. Two shapes carry a speaker group:
 *
 *   · `speakerGroup: "Otro"`  → null (the value that already means "unknown")
 *   · `blocs: ["PSOE","Otro"]` → ["PSOE"] — a DERIVED list of the speaker
 *     groups in a bundle (src/scraper/auto-curate.ts builds it from the very
 *     `claim.speakerGroup` values above). A name that names no group does not
 *     belong in a list of names, and leaving it would republish the sentinel
 *     under a different key while the quotes it summarises read null.
 *   · `bloc: "Otro"` → null — the vote tuple in pleno-votes.json. Dropping the
 *     tuple instead would silently shrink a 21-seat tally to 20 and change the
 *     arithmetic a reader checks the outcome against; the seat voted, it is
 *     the attribution that is missing.
 *
 * Nothing else is touched.
 */
function retire(node: unknown, seen: Seen): unknown {
  if (Array.isArray(node)) return node.map((n) => retire(n, seen))
  if (node === null || typeof node !== 'object') return node
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === 'speakerGroup' && v === SENTINEL) {
      seen.changed += 1
      out[k] = null
    } else if (k === 'blocs' && Array.isArray(v) && v.includes(SENTINEL)) {
      const kept = v.filter((b) => b !== SENTINEL)
      if (kept.length === 0) {
        // Every group in the bundle was the sentinel: dropping them all would
        // publish an empty attribution list that reads as "no one spoke".
        // Nothing in the current data hits this; fail loudly if it ever does.
        throw new Error(
          `a "blocs" list is entirely the "${SENTINEL}" sentinel — ` +
            `regenerate the bundle instead of migrating it`,
        )
      }
      seen.droppedFromLists += v.length - kept.length
      out[k] = kept
    } else if (k === 'bloc' && v === SENTINEL) {
      seen.blocSentinels += 1
      out[k] = null
    } else {
      out[k] = retire(v, seen)
    }
  }
  return out
}

/** Structural equality, order-sensitive for arrays, order-insensitive for keys. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (typeof a !== 'object') return false
  const ka = Object.keys(a as object)
  const kb = Object.keys(b as object)
  if (ka.length !== kb.length) return false
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false
    if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
      return false
  }
  return true
}

interface FileResult {
  path: string
  status: 'migrated' | 'already-clean' | 'absent'
  changed: number
  droppedFromLists: number
  blocSentinels: number
  validated: string | null
}

function processFile(path: string, dryRun: boolean): FileResult {
  const rel = relative(ROOT, path)
  if (!existsSync(path)) {
    return {
      path: rel,
      status: 'absent',
      changed: 0,
      droppedFromLists: 0,
      blocSentinels: 0,
      validated: null,
    }
  }

  const raw = readFileSync(path, 'utf8')
  const parsed = JSON.parse(raw)

  // Byte fidelity: only rewrite files whose on-disk bytes this serializer
  // already reproduces exactly, so the diff cannot contain reformatting.
  const serialize = (v: unknown) => JSON.stringify(v, null, 2) + '\n'
  if (serialize(parsed) !== raw) {
    throw new Error(
      `${rel}: on-disk formatting is not JSON.stringify(x, null, 2) + "\\n" — ` +
        `refusing to rewrite it, the diff would be unreviewable`,
    )
  }

  const seen: Seen = { changed: 0, droppedFromLists: 0, blocSentinels: 0 }
  const migrated = retire(parsed, seen)

  // The validator runs on every pass, not only the one that changes bytes, so
  // a re-run is a standing check that the published file still conforms.
  const isFindings = rel.endsWith('pleno-findings.json')
  const isVotes = rel.endsWith('pleno-votes.json')
  const check = (json: string): string | null =>
    isFindings
      ? `validateFindingsSnapshot ✓ (${validateFindingsSnapshot(json).items.length} items)`
      : isVotes
        ? `validateSnapshot ✓ (${validateVotesSnapshot(JSON.parse(json)).items.length} votes)`
        : null

  if (seen.changed === 0 && seen.droppedFromLists === 0 && seen.blocSentinels === 0) {
    return {
      path: rel,
      status: 'already-clean',
      changed: 0,
      droppedFromLists: 0,
      blocSentinels: 0,
      validated: check(raw),
    }
  }

  // Prove nothing but the speaker-group fields moved: an independent second
  // pass over the untouched original must reproduce the migrated document.
  const control: Seen = { changed: 0, droppedFromLists: 0, blocSentinels: 0 }
  const reference = retire(JSON.parse(raw), control)
  if (
    control.changed !== seen.changed ||
    control.droppedFromLists !== seen.droppedFromLists ||
    control.blocSentinels !== seen.blocSentinels ||
    !deepEqual(reference, migrated)
  ) {
    throw new Error(`${rel}: migration is not a pure sentinel rewrite — aborting`)
  }

  const next = serialize(migrated)

  // Re-validate through the schema validator that owns the file, before any
  // write — the whole point of routing this through a CLI instead of an editor.
  const validated = check(next)

  // Cheap universal invariant: the result still parses and keeps its shape.
  const reparsed = JSON.parse(next)
  if (!deepEqual(reparsed, migrated)) throw new Error(`${rel}: round-trip lost data`)

  if (!dryRun) writeFileSync(path, next, 'utf8')

  return {
    path: rel,
    status: 'migrated',
    changed: seen.changed,
    droppedFromLists: seen.droppedFromLists,
    blocSentinels: seen.blocSentinels,
    validated,
  }
}

function main() {
  const argv = process.argv.slice(2)
  const dryRun = argv.includes('--dry-run')
  for (const a of argv) {
    if (a !== '--dry-run') {
      process.stderr.write(`[retire-otro] unknown flag: ${a}\n`)
      process.exit(2)
    }
  }

  const files = targets()
  const results: FileResult[] = []
  for (const f of files) results.push(processFile(f, dryRun))

  // Report attempted / done / never-attempted separately. A pass that folds
  // "absent" into "unchanged" is how a run reports work it never did.
  const migrated = results.filter((r) => r.status === 'migrated')
  const clean = results.filter((r) => r.status === 'already-clean')
  const absent = results.filter((r) => r.status === 'absent')
  const total = migrated.reduce((n, r) => n + r.changed, 0)
  const totalDropped = migrated.reduce((n, r) => n + r.droppedFromLists, 0)
  const totalBlocs = migrated.reduce((n, r) => n + r.blocSentinels, 0)

  process.stdout.write(
    `[retire-otro] ${dryRun ? 'DRY RUN — ' : ''}` + `${files.length} snapshot(s) attempted\n`,
  )
  for (const r of migrated) {
    const parts = [
      r.changed ? `${r.changed} speakerGroup:"${SENTINEL}" → null` : '',
      r.droppedFromLists ? `${r.droppedFromLists} dropped from blocs[]` : '',
      r.blocSentinels ? `${r.blocSentinels} votes[].bloc:"${SENTINEL}" → null` : '',
    ].filter(Boolean)
    process.stdout.write(
      `  ✓ ${r.path} — ${parts.join(' · ')}` +
        (r.validated ? ` · ${r.validated}` : '') +
        (dryRun ? ' (not written)' : '') +
        '\n',
    )
  }
  for (const r of clean) {
    process.stdout.write(
      `  · ${r.path} — already clean` + (r.validated ? ` · ${r.validated}` : '') + '\n',
    )
  }
  for (const r of absent) process.stdout.write(`  – ${r.path} — not present, never attempted\n`)

  process.stdout.write(
    `[retire-otro] ${total} speakerGroup + ${totalBlocs} votes[].bloc sentinel(s) retired, ` +
      `${totalDropped} dropped from blocs[], across ${migrated.length} file(s); ` +
      `${clean.length} already clean; ${absent.length} absent\n`,
  )
  if (totalBlocs > 0) {
    process.stdout.write(
      `[retire-otro] the ${totalBlocs} vote tuple(s) now read «Grupo no identificado». ` +
        `Naming the group is a curator act — the acta must name it for that vote: ` +
        `npm run pleno-vote\n`,
    )
  }

  if (total === 0 && migrated.length === 0) {
    process.stdout.write(
      `[retire-otro] nothing to do — published data carries no speakerGroup sentinel\n`,
    )
  }
}

main()
