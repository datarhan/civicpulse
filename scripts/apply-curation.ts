/**
 * apply-curation — publish the drafts a curator approved from the bot.
 *
 * The bot records decisions in its own SQLite and EXPORTS them; it never writes
 * `public/data/pleno-findings.json`, and this script never opens the bot's
 * database. Each package owns its own storage, the same separation quejas.json
 * already uses. This is the only path from a Telegram tap to a published
 * finding, and it runs `validateFindingsSnapshot` like every other curated
 * mutation, so a malformed draft is refused rather than shipped and the commit
 * is the audit trail.
 *
 * Each published finding records WHO approved it and what they said they
 * checked. A finding approved despite a blocker carries the curator's note into
 * `curatorNotes`, permanently — approving over a machine warning should leave a
 * mark, not vanish.
 *
 * Three steps, deliberately not one:
 *   bot/  npm run export-curation          decisions → editorial/
 *   host  npm run apply-curation           publish + validate + commit
 *   bot/  npm run mark-curation-applied    close the loop
 * If the middle step dies, the decisions stay pending and re-running is safe.
 *
 *   npm run apply-curation -- [--dry-run]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { validateFindingsSnapshot } from '../src/scraper/pleno-finding'

const FINDINGS = resolve('public/data/pleno-findings.json')
const QUEUE = resolve('editorial/auto-curation-queue-pending-measurement.json')
const DECISIONS = resolve('editorial/curation-decisions.json')

interface Decision {
  ref: string
  telegram_user_id: number
  decision: 'approve' | 'reject'
  note: string | null
  created_at: string
  applied_at: string | null
}

function main() {
  const dryRun = process.argv.includes('--dry-run')

  if (!existsSync(DECISIONS)) {
    process.stdout.write(
      `[apply-curation] no decisions at ${DECISIONS} — run \`npm run export-curation\` in bot/ first\n`,
    )
    return
  }
  if (!existsSync(QUEUE)) {
    process.stdout.write('[apply-curation] no curation queue on disk — nothing to apply\n')
    return
  }

  const pending =
    (JSON.parse(readFileSync(DECISIONS, 'utf8')) as { decisions?: Decision[] }).decisions ?? []
  if (pending.length === 0) {
    process.stdout.write('[apply-curation] no pending decisions\n')
    return
  }

  const queue = JSON.parse(readFileSync(QUEUE, 'utf8')) as {
    items: { ref: string; finding: Record<string, unknown>; checks: { level: string }[] }[]
  }
  const byRef = new Map(queue.items.map((i) => [i.ref, i]))
  const snap = JSON.parse(readFileSync(FINDINGS, 'utf8')) as { items: Record<string, unknown>[] }
  const existingIds = new Set(snap.items.map((f) => String(f.id)))

  let published = 0
  let rejected = 0
  let skipped = 0
  const applied: string[] = []

  for (const d of pending) {
    const entry = byRef.get(d.ref)
    if (!entry) {
      process.stderr.write(`[apply-curation] ${d.ref}: not in the current queue — skipped\n`)
      skipped++
      continue
    }
    if (d.decision === 'reject') {
      rejected++
      applied.push(d.ref)
      process.stdout.write(`[apply-curation] 🗑 ${d.ref} rechazado · ${d.note ?? ''}\n`)
      continue
    }

    const finding = { ...entry.finding } as Record<string, unknown>
    if (existingIds.has(String(finding.id))) {
      process.stderr.write(`[apply-curation] ${d.ref}: ya publicado — skipped\n`)
      skipped++
      applied.push(d.ref)
      continue
    }
    const hadBlocker = entry.checks.some((c) => c.level === 'blocker')
    finding.curatorName = `telegram:${d.telegram_user_id}`
    finding.publishedAt = new Date().toISOString()
    if (!Array.isArray(finding.corrections)) finding.corrections = []
    // An approval over a machine blocker keeps its justification forever.
    if (hadBlocker || d.note) {
      const prefix = hadBlocker ? 'Aprobado pese a aviso automático. ' : ''
      finding.curatorNotes = `${prefix}${d.note ?? ''}`.trim()
    }
    snap.items.push(finding)
    existingIds.add(String(finding.id))
    published++
    applied.push(d.ref)
    process.stdout.write(
      `[apply-curation] ✅ ${d.ref} → ${finding.id}${hadBlocker ? ' (sobre aviso bloqueante)' : ''}\n`,
    )
  }

  if (published > 0) {
    try {
      validateFindingsSnapshot(JSON.stringify(snap))
    } catch (err) {
      process.stderr.write(
        `[apply-curation] FATAL: el snapshot resultante no pasa el validador: ` +
          `${err instanceof Error ? err.message : String(err)}\n` +
          `[apply-curation] nada escrito; ninguna decisión marcada como aplicada.\n`,
      )
      process.exit(1)
    }
  }

  if (dryRun) {
    process.stdout.write(
      `[apply-curation] DRY RUN · ${published} publicaría(n) · ${rejected} rechazo(s) · ${skipped} omitido(s)\n`,
    )
    return
  }

  if (published > 0) writeFileSync(FINDINGS, JSON.stringify(snap, null, 2) + '\n')

  process.stdout.write(
    `[apply-curation] ${published} publicado(s) · ${rejected} rechazado(s) · ${skipped} omitido(s)\n`,
  )
  if (applied.length > 0) {
    // The bot still owns the decision state. Marking them applied is a separate
    // step ON PURPOSE: if this script died halfway, the decisions stay pending
    // and re-running is safe rather than silently losing a curator's work.
    process.stdout.write(
      `[apply-curation] ahora, en bot/: npm run mark-curation-applied -- ${applied.join(' ')}\n`,
    )
  }
}

main()
