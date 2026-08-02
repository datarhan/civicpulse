/**
 * Mark decisions as applied, after the host published them.
 *
 * Separate from the export so a failed host-side apply does not silently lose
 * the decisions: they stay pending until the host confirms, and re-running the
 * apply is safe.
 *
 *   npm run mark-curation-applied -- ref1 ref2 ...
 */
import { openDb } from '../src/db/client.ts'

const refs = process.argv.slice(2).filter(Boolean)
if (refs.length === 0) {
  process.stderr.write('usage: mark-curation-applied <ref> [ref...]\n')
  process.exit(2)
}
const db = openDb()
const stmt = db.prepare(
  "UPDATE curation_decisions SET applied_at = datetime('now') WHERE ref = ? AND applied_at IS NULL",
)
let n = 0
for (const r of refs) n += (stmt.run(r) as { changes: number }).changes
process.stdout.write(`[mark-curation-applied] ${n} decision(s) marked\n`)
