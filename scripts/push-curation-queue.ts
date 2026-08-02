/**
 * push-curation-queue — send the curation queue to a remotely deployed bot, and
 * pull back what the curator decided.
 *
 * The bot runs on Fly with a volume and no view of this filesystem, so the queue
 * `auto-curate` writes to `editorial/` never reaches it on its own. Without this
 * step `/curar` answers "no hay cola" forever: installed, and doing nothing.
 *
 *   npm run push-curation-queue                 # host → bot
 *   npm run push-curation-queue -- --pull       # bot → host (decisions)
 *   npm run push-curation-queue -- --applied a b  # close the loop
 *
 * Needs BOT_BASE_URL and EXPORT_TOKEN. Both live in bot/.env; this reads that
 * file directly so the two stay in sync rather than being duplicated.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const QUEUE = resolve('editorial/auto-curation-queue-pending-measurement.json')
const DECISIONS = resolve('editorial/curation-decisions.json')

function botEnv(): { base: string; token: string } {
  const envPath = resolve('bot/.env')
  const vals: Record<string, string> = {}
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim())
      if (m) vals[m[1]] = m[2]
    }
  }
  const base = process.env.BOT_BASE_URL || vals.BOT_BASE_URL || vals.WEBHOOK_URL || ''
  const token = process.env.EXPORT_TOKEN || vals.EXPORT_TOKEN || ''
  if (!base) {
    process.stderr.write(
      '[push-curation] no BOT_BASE_URL (e.g. https://munigraph-ribarroja.fly.dev). ' +
        'Set it in bot/.env or the environment.\n',
    )
    process.exit(2)
  }
  if (!token) {
    process.stderr.write(
      '[push-curation] no EXPORT_TOKEN — the bot refuses unauthenticated calls\n',
    )
    process.exit(2)
  }
  return { base: base.replace(/\/$/, ''), token }
}

async function main() {
  const { base, token } = botEnv()
  const auth = { Authorization: `Bearer ${token}` }
  const argv = process.argv.slice(2)

  if (argv[0] === '--pull') {
    const r = await fetch(`${base}/curation/decisions`, { headers: auth })
    if (!r.ok) {
      process.stderr.write(`[push-curation] pull failed: ${r.status} ${await r.text()}\n`)
      process.exit(1)
    }
    const body = await r.text()
    writeFileSync(DECISIONS, body + '\n')
    const n = (JSON.parse(body).decisions ?? []).length
    process.stdout.write(`[push-curation] ${n} decision(s) → ${DECISIONS}\n`)
    return
  }

  if (argv[0] === '--applied') {
    const refs = argv.slice(1).filter(Boolean)
    if (refs.length === 0) {
      process.stderr.write('[push-curation] --applied needs at least one ref\n')
      process.exit(2)
    }
    const r = await fetch(`${base}/curation/applied`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refs }),
    })
    process.stdout.write(`[push-curation] applied: ${r.status} ${await r.text()}\n`)
    return
  }

  if (!existsSync(QUEUE)) {
    process.stdout.write(`[push-curation] no queue at ${QUEUE} — run auto-curate first\n`)
    return
  }
  const body = readFileSync(QUEUE, 'utf8')
  const r = await fetch(`${base}/curation/queue`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body,
  })
  if (!r.ok) {
    process.stderr.write(`[push-curation] push failed: ${r.status} ${await r.text()}\n`)
    process.exit(1)
  }
  process.stdout.write(`[push-curation] ${await r.text()}\n`)
}

main().catch((err) => {
  process.stderr.write(`[push-curation] FATAL: ${err instanceof Error ? err.message : err}\n`)
  process.exit(1)
})
