#!/usr/bin/env tsx
/**
 * Un-archive a previously-archived bundle. Restores it to the
 * dashboard's contradicho queue.
 *
 *   npm run unarchive-bundle -- <plenoId> <topic>
 *
 * Spawned by the curator dashboard's "Un-archive" button. The archive
 * is the audit trail, so we don't lie about it: removing the entry is
 * the right operation (the absence of an entry = "no longer archived").
 * If you want a record of "I archived this, then changed my mind", git
 * history of public/data/curator-archive.json carries that.
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
  return validateArchiveSnapshot(readFileSync(ARCHIVE_PATH, 'utf8'))
}

function main() {
  const argv = process.argv.slice(2)
  if (argv.length < 2) {
    process.stderr.write('Usage: unarchive-bundle <plenoId> <topic>\n')
    process.exit(2)
  }
  const [plenoId, topic] = argv

  const snap = loadSnapshot()
  const before = snap.items.length
  snap.items = snap.items.filter((it) => !(it.plenoId === plenoId && it.topic === topic))
  const removed = before - snap.items.length
  snap.generatedAt = new Date().toISOString()

  const serialized = JSON.stringify(snap, null, 2) + '\n'
  validateArchiveSnapshot(serialized)

  mkdirSync(dirname(ARCHIVE_PATH), { recursive: true })
  writeFileSync(ARCHIVE_PATH, serialized, 'utf8')

  process.stdout.write(
    JSON.stringify({
      action: 'unarchive-bundle',
      plenoId,
      topic,
      removed,
      totalArchived: snap.items.length,
    }) + '\n',
  )
}

main()
