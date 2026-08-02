/**
 * Curation of auto-curated findings the automation policy refused to publish.
 *
 * The bot is a REVIEW SURFACE, not a publish button. It reads the queue the
 * host writes (drafts + precomputed deterministic checks), renders a card, and
 * records a decision in SQLite. Publication happens host-side through the
 * validated CLI, so the schema validator runs and git history remains the audit
 * trail — the same discipline every other curated surface in this repo follows.
 *
 * Why the checks are precomputed rather than judged on the phone: two of the
 * four real defects found in the published corpus needed the source data to
 * spot — a company name checked against 1,231 contract rows, and a contract for
 * an exterior walkway cited as evidence for an interior floor. A reviewer on a
 * phone can read prose and judge tone. They cannot do those. So the machine
 * does its half and shows its working, and the human does the half machines are
 * bad at.
 *
 * Pure module: the queue is passed in, the DB handle is passed in.
 */

export type CheckLevel = 'blocker' | 'warn' | 'ok'

export interface CurationCheck {
  code: string
  level: CheckLevel
  message: string
}

export interface QueueItem {
  ref: string
  finding: {
    id?: string
    plenoId?: string
    plenoDate?: string
    title?: string
    summary?: string
    severity?: string
    quotes?: { text: string; speakerGroup?: string | null }[]
  }
  checks: CurationCheck[]
}

export interface CurationQueue {
  generatedAt?: string
  reason?: string
  items: QueueItem[]
}

export interface Decision {
  ref: string
  telegram_user_id: number
  decision: 'approve' | 'reject'
  note: string | null
  created_at: string
  applied_at: string | null
}

const MARK: Record<CheckLevel, string> = { blocker: '⛔', warn: '⚠️', ok: '✅' }

/** Telegram hard-limits a message to 4096 chars; leave room for the keyboard. */
const MAX_LEN = 3500

function esc(s: string): string {
  return (s ?? '').replace(
    /[<>&]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] as string,
  )
}

/**
 * Render one draft for review. Deliberately leads with the checks: the point of
 * the surface is that a reviewer sees the machine's evidence before the prose
 * has a chance to sound convincing.
 */
export function renderCard(item: QueueItem, position?: { index: number; total: number }): string {
  const f = item.finding
  const head = position ? ` (${position.index}/${position.total})` : ''
  const lines: string[] = []
  lines.push(`<b>Revisión de hallazgo${head}</b> · <code>${esc(item.ref)}</code>`)
  if (f.plenoDate || f.plenoId) {
    lines.push(`Pleno ${esc(f.plenoDate ?? '')} ${f.plenoId ? `· ${esc(f.plenoId)}` : ''}`.trim())
  }
  lines.push('')

  const blockers = item.checks.filter((c) => c.level === 'blocker')
  lines.push(blockers.length > 0 ? '<b>Comprobaciones automáticas</b>' : '<b>Comprobaciones</b>')
  for (const c of item.checks) lines.push(`${MARK[c.level]} ${esc(c.message)}`)
  lines.push('')

  lines.push(`<b>${esc(f.title ?? '(sin título)')}</b>`)
  lines.push(esc(f.summary ?? ''))

  const quotes = f.quotes ?? []
  if (quotes.length > 0) {
    lines.push('')
    lines.push('<b>Citas</b>')
    for (const q of quotes.slice(0, 4)) {
      lines.push(`· [${esc(q.speakerGroup ?? 'sin atribuir')}] «${esc(q.text.slice(0, 180))}»`)
    }
    if (quotes.length > 4) lines.push(`· …y ${quotes.length - 4} más`)
  }

  lines.push('')
  lines.push(
    blockers.length > 0
      ? '⛔ <i>Hay avisos bloqueantes. Compruébalos contra la fuente antes de aprobar.</i>'
      : '<i>Aprobar publica el hallazgo con tu firma. Rechazar lo descarta.</i>',
  )
  lines.push(
    `<code>/curar_ok ${item.ref}</code> · <code>/curar_no ${item.ref} &lt;motivo&gt;</code>`,
  )

  const out = lines.join('\n')
  return out.length > MAX_LEN ? `${out.slice(0, MAX_LEN)}\n…` : out
}

/**
 * Next item awaiting THIS admin's decision.
 *
 * Blockers are shown FIRST, not last. The instinct is to surface easy approvals
 * to build momentum, which is exactly how the risky ones end up rubber-stamped
 * at the end of a session.
 */
export function nextForReview(
  queue: CurationQueue,
  decided: ReadonlySet<string>,
): { item: QueueItem; index: number; total: number } | null {
  const pending = queue.items.filter((i) => !decided.has(i.ref))
  if (pending.length === 0) return null
  const withBlockers = pending.filter((i) => i.checks.some((c) => c.level === 'blocker'))
  const item = withBlockers[0] ?? pending[0]
  return { item, index: queue.items.indexOf(item) + 1, total: queue.items.length }
}

export function summarise(queue: CurationQueue, decided: ReadonlySet<string>): string {
  const pending = queue.items.filter((i) => !decided.has(i.ref))
  const blocked = pending.filter((i) => i.checks.some((c) => c.level === 'blocker')).length
  if (queue.items.length === 0) return 'No hay borradores pendientes de revisión.'
  return (
    `${pending.length} de ${queue.items.length} borrador(es) pendientes` +
    (blocked > 0 ? ` · ${blocked} con avisos bloqueantes` : '') +
    (queue.reason ? `\nMotivo de la cola: ${queue.reason}` : '')
  )
}

// ─── Persistence (better-sqlite3 handle injected) ───────────────────────────

export interface DbLike {
  prepare(sql: string): {
    run(...args: unknown[]): unknown
    get(...args: unknown[]): unknown
    all(...args: unknown[]): unknown[]
  }
}

export function recordDecision(
  db: DbLike,
  d: { ref: string; userId: number; decision: 'approve' | 'reject'; note?: string | null },
): void {
  db.prepare(
    `INSERT INTO curation_decisions (ref, telegram_user_id, decision, note)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(ref, telegram_user_id) DO UPDATE SET
       decision = excluded.decision, note = excluded.note, created_at = datetime('now')`,
  ).run(d.ref, d.userId, d.decision, d.note ?? null)
}

export function decidedRefs(db: DbLike, userId: number): Set<string> {
  const rows = db
    .prepare('SELECT ref FROM curation_decisions WHERE telegram_user_id = ?')
    .all(userId) as { ref: string }[]
  return new Set(rows.map((r) => r.ref))
}

export function pendingApplications(db: DbLike): Decision[] {
  return db
    .prepare('SELECT * FROM curation_decisions WHERE applied_at IS NULL ORDER BY created_at')
    .all() as Decision[]
}
