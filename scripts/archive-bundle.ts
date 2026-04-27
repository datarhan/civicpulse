#!/usr/bin/env tsx
/**
 * Archive a contradicho-queue bundle. Curator marks it "reviewed,
 * unclear, no finding to publish". Validator-fronted edit of
 * public/data/curator-archive.json. Idempotent — re-archiving the
 * same (plenoId, topic) updates the timestamp + reason.
 *
 *   npm run archive-bundle -- <plenoId> <topic> [reason]
 *
 * Spawned by the curator dashboard's Archive button. Validates the
 * whole snapshot before writing — same discipline as promote-claim.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  EMPTY_ARCHIVE,
  validateArchiveSnapshot,
  type CuratorArchiveSnapshot,
} from '../src/scraper/curator-archive'

const ARCHIVE_PATH = resolve('public/data/curator-archive.json')

function loadSnapshot(): CuratorArchiveSnapshot {
  if (!existsSync(ARCHIVE_PATH)) return { ...EMPTY_ARCHIVE }
  const raw = readFileSync(ARCHIVE_PATH, 'utf8')
  try {
    return validateArchiveSnapshot(raw)
  } catch (err) {
    process.stderr.write(`[archive] existing file invalid: ${(err as Error).message}\n`)
    process.stderr.write('[archive] refusing to write — fix the file first\n')
    process.exit(1)
  }
}

function main() {
  const argv = process.argv.slice(2)
  if (argv.length < 2) {
    process.stderr.write('Usage: archive-bundle <plenoId> <topic> [reason]\n')
    process.exit(2)
  }
  const [plenoId, topic, ...rest] = argv
  const reason = rest.length > 0 ? rest.join(' ').trim().slice(0, 500) : null

  const snap = loadSnapshot()
  const key = `${plenoId}/${topic}`
  const existingIdx = snap.items.findIndex((it) => `${it.plenoId}/${it.topic}` === key)
  const entry = {
    plenoId,
    topic,
    archivedAt: new Date().toISOString(),
    reason: reason && reason.length > 0 ? reason : null,
    archivedBy: 'curator-v1',
  }
  if (existingIdx >= 0) {
    snap.items[existingIdx] = entry
  } else {
    snap.items.push(entry)
  }
  // Stable sort by archivedAt desc — newest first.
  snap.items.sort((a, b) => b.archivedAt.localeCompare(a.archivedAt))
  snap.generatedAt = new Date().toISOString()

  const serialized = JSON.stringify(snap, null, 2) + '\n'
  // Re-validate before writing — the schema check is the only thing
  // standing between a free-form curator action and the audit trail.
  validateArchiveSnapshot(serialized)

  mkdirSync(dirname(ARCHIVE_PATH), { recursive: true })
  writeFileSync(ARCHIVE_PATH, serialized, 'utf8')

  process.stdout.write(
    JSON.stringify({
      action: 'archive-bundle',
      plenoId,
      topic,
      reason: entry.reason,
      archivedAt: entry.archivedAt,
      totalArchived: snap.items.length,
    }) + '\n',
  )
}

main()
