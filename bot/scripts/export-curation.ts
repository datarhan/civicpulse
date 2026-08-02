/**
 * Export pending curation decisions so the host can apply them.
 *
 * The host does NOT read the bot's SQLite: better-sqlite3 is a bot dependency,
 * and more importantly the bot owning its own database is what keeps the two
 * packages separable. It exports, exactly as it does for quejas.json.
 *
 *   npm run export-curation            # → ../editorial/curation-decisions.json
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { openDb } from '../src/db/client.ts'
import { pendingApplications } from '../src/services/curation.ts'

const out = resolve(
  process.argv[2] ?? process.env.CURATION_JSON_OUT ?? '../editorial/curation-decisions.json',
)
const db = openDb()
const decisions = pendingApplications(db as never)
mkdirSync(dirname(out), { recursive: true })
writeFileSync(
  out,
  JSON.stringify({ generatedAt: new Date().toISOString(), decisions }, null, 2) + '\n',
)
process.stdout.write(`[export-curation] ${decisions.length} pending decision(s) → ${out}\n`)
