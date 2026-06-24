/**
 * Print the re-grounding review queue for the curator (P2, read-only).
 *
 *   npm run regrounding:review [-- --reason ungrounded|weak-contradicho] [--max N]
 *
 * Reads public/data/pleno-claims-regrounding-flags.json (produced by
 * `npm run reground:verdicts`). Apply an approved downgrade with
 * `npm run downgrade-verdict`.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { RegroundFlag } from '../src/scraper/reground'

const FLAGS = resolve('public/data/pleno-claims-regrounding-flags.json')

let reasonFilter: string | null = null
let max = 40
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--reason') reasonFilter = process.argv[++i]
  else if (process.argv[i] === '--max') max = Number(process.argv[++i])
}

if (!existsSync(FLAGS)) {
  process.stderr.write('[review] no flags file — run `npm run reground:verdicts` first\n')
  process.exit(1)
}

const doc = JSON.parse(readFileSync(FLAGS, 'utf8')) as {
  generatedAt: string
  counts: Record<string, number>
  flags: RegroundFlag[]
}
const flags = reasonFilter ? doc.flags.filter((f) => f.reason === reasonFilter) : doc.flags

process.stdout.write(
  `Re-grounding queue (${doc.generatedAt}) · ${JSON.stringify(doc.counts)}\n` +
    `Showing ${Math.min(max, flags.length)} of ${flags.length}${reasonFilter ? ` (${reasonFilter})` : ''}\n\n`,
)
for (const f of flags.slice(0, max)) {
  process.stdout.write(
    `• ${f.claimId}  [${f.currentVerdict} → review: ${f.reason}]  entail=${f.maxEntail.toFixed(2)} contra=${f.maxContra.toFixed(2)}\n` +
      `  «${f.verbatim.slice(0, 140)}»\n` +
      f.evidence.map((e) => `    ↳ ${e.snippet.slice(0, 120)}`).join('\n') +
      `\n  downgrade: npm run downgrade-verdict -- ${f.claimId} sin-datos --reason "<≥20 chars>"\n\n`,
  )
}
