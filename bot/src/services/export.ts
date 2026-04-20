/**
 * Exports the SQLite state to public/data/quejas.json.
 * Thin wrapper around buildSnapshot() — meant for a nightly cron
 * that commits the resulting JSON to the main repo.
 *
 * Usage:
 *   tsx src/services/export.ts            # default: ../public/data/quejas.json
 *   tsx src/services/export.ts out.json   # custom path
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import 'dotenv/config'
import { openDb } from '../db/client.ts'
import { buildSnapshot } from './snapshot.ts'

function main() {
  const outPath = resolve(
    process.cwd(),
    process.argv[2] ?? process.env.QUEJAS_JSON_OUT ?? '../public/data/quejas.json'
  )
  const db = openDb()
  const snap = buildSnapshot(db)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(snap, null, 2))
  console.log(
    `[export] wrote ${snap.items.length} quejas · total=${snap.stats.total} · to ${outPath}`
  )
}

main()
