import { monotonicFactory } from 'ulid'
import type { Db } from './client.ts'

const ulidMonotonic = monotonicFactory()

export type QuejaState =
  | 'capturada'
  | 'apoyada_verificada'
  | 'registrada'
  | 'notificada_10d'
  | 'en_tramite'
  | 'resuelta'
  | 'silencio_negativo'
  | 'escalada_sindic'
  | 'cerrada_no_registrada'

export interface QuejaRow {
  id: string
  telegram_user_id: number
  telegram_username: string | null
  category: string
  title: string
  detail: string
  lat: number | null
  lng: number | null
  neighborhood: string | null
  photo_file_id: string | null
  concejalia_area: string | null
  concejal_slug: string | null
  state: QuejaState
  registro_entry_number: string | null
  registro_csv: string | null
  registered_at: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
  // LOPD/GDPR right-to-be-forgotten: when set, the row stays for audit but
  // every exporter + public renderer filters it out. See schema.sql for the
  // full retention rationale.
  deleted_at: string | null
}

export interface NewQuejaInput {
  telegram_user_id: number
  telegram_username?: string | null
  category: string
  title: string
  detail: string
  lat?: number | null
  lng?: number | null
  neighborhood?: string | null
  photo_file_id?: string | null
  concejalia_area?: string | null
  concejal_slug?: string | null
}

export interface EventRow {
  id: number
  queja_id: string
  kind: string
  payload: string | null
  created_at: string
}

export interface AggregateStats {
  total: number
  byState: Record<string, number>
  byNeighborhood: Record<string, number>
  byCategory: Record<string, number>
  byConcejal: Record<
    string,
    { total: number; resueltas: number; silencios: number; pendientes: number }
  >
}

// Minimum apoyos to tag a queja as community-verified.
export const VERIFIED_THRESHOLD = 10

function newId(): string {
  // Monotonic ULID — guarantees lexicographic ordering matches insertion
  // order even within the same millisecond. Last 8 chars give us ~40
  // bits of randomness, safe for a small muni.
  return 'Q-' + ulidMonotonic().slice(-8)
}

export function createQueja(db: Db, q: NewQuejaInput): QuejaRow {
  const id = newId()
  const insert = db.prepare(`
    INSERT INTO quejas (
      id, telegram_user_id, telegram_username, category, title, detail,
      lat, lng, neighborhood, photo_file_id, concejalia_area, concejal_slug
    ) VALUES (
      @id, @telegram_user_id, @telegram_username, @category, @title, @detail,
      @lat, @lng, @neighborhood, @photo_file_id, @concejalia_area, @concejal_slug
    )
  `)
  const event = db.prepare(`INSERT INTO events (queja_id, kind) VALUES (?, 'capturada')`)
  const tx = db.transaction((row: NewQuejaInput & { id: string }) => {
    insert.run({
      id: row.id,
      telegram_user_id: row.telegram_user_id,
      telegram_username: row.telegram_username ?? null,
      category: row.category,
      title: row.title,
      detail: row.detail,
      lat: row.lat ?? null,
      lng: row.lng ?? null,
      neighborhood: row.neighborhood ?? null,
      photo_file_id: row.photo_file_id ?? null,
      concejalia_area: row.concejalia_area ?? null,
      concejal_slug: row.concejal_slug ?? null,
    })
    event.run(row.id)
  })
  tx({ ...q, id })
  return getQueja(db, id)!
}

export function getQueja(db: Db, id: string): QuejaRow | null {
  const row = db.prepare('SELECT * FROM quejas WHERE id = ?').get(id) as QuejaRow | undefined
  return row ?? null
}

/**
 * LOPD/GDPR right-to-be-forgotten. Soft-delete: the row stays for audit
 * (5-year retention window per Art. 55 LOPD-GDD public-interest processing),
 * but every list/export helper below filters out rows with a deleted_at
 * timestamp. The citizen retains the ability to see their own deleted rows
 * via /mis (so they can confirm the deletion actually took effect).
 *
 * Returns true if a row was deleted, false if the id was missing OR not
 * owned by the requesting user (never leaks existence to unauthorised users).
 */
export function softDeleteQueja(db: Db, id: string, userId: number): boolean {
  const row = db.prepare('SELECT telegram_user_id, deleted_at FROM quejas WHERE id = ?').get(id) as
    | { telegram_user_id: number; deleted_at: string | null }
    | undefined
  if (!row) return false
  if (row.telegram_user_id !== userId) return false  // never confirm existence cross-user
  if (row.deleted_at) return true  // idempotent — already deleted counts as success
  const tx = db.transaction(() => {
    db.prepare(`UPDATE quejas SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(id)
    db.prepare(`INSERT INTO events (queja_id, kind, payload) VALUES (?, 'anonymised', ?)`).run(
      id,
      JSON.stringify({ reason: 'user_requested_deletion' }),
    )
  })
  tx()
  return true
}

export function listUserQuejas(db: Db, userId: number, limit = 20): QuejaRow[] {
  // Includes soft-deleted rows so the citizen can confirm their /olvidar
  // request took effect. The UI marks them visually.
  return db
    .prepare('SELECT * FROM quejas WHERE telegram_user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?')
    .all(userId, limit) as QuejaRow[]
}

export function listRecentQuejas(db: Db, limit = 20): QuejaRow[] {
  return db
    .prepare('SELECT * FROM quejas WHERE deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT ?')
    .all(limit) as QuejaRow[]
}

export function listByNeighborhood(db: Db, neighborhood: string, limit = 50): QuejaRow[] {
  return db
    .prepare('SELECT * FROM quejas WHERE deleted_at IS NULL AND neighborhood = ? ORDER BY created_at DESC, id DESC LIMIT ?')
    .all(neighborhood, limit) as QuejaRow[]
}

export function addApoyo(
  db: Db,
  quejaId: string,
  userId: number
): { added: boolean; count: number } {
  const insert = db.prepare('INSERT OR IGNORE INTO apoyos (queja_id, telegram_user_id) VALUES (?, ?)')
  const result = insert.run(quejaId, userId)
  const count = countApoyos(db, quejaId)
  if (result.changes === 0) return { added: false, count }

  if (count === VERIFIED_THRESHOLD) {
    const already = db
      .prepare(`SELECT 1 FROM events WHERE queja_id = ? AND kind = 'apoyada_verificada' LIMIT 1`)
      .get(quejaId)
    if (!already) {
      db.prepare(`INSERT INTO events (queja_id, kind, payload) VALUES (?, 'apoyada_verificada', ?)`).run(
        quejaId,
        JSON.stringify({ count })
      )
    }
  }
  return { added: true, count }
}

export function countApoyos(db: Db, quejaId: string): number {
  const r = db.prepare('SELECT COUNT(*) as n FROM apoyos WHERE queja_id = ?').get(quejaId) as {
    n: number
  }
  return r.n
}

export function listEvents(db: Db, quejaId: string): EventRow[] {
  return db
    .prepare('SELECT * FROM events WHERE queja_id = ? ORDER BY id ASC')
    .all(quejaId) as EventRow[]
}

export function setState(
  db: Db,
  id: string,
  state: QuejaState,
  registro?: { entry_number: string; csv: string }
): QuejaRow | null {
  const update = registro
    ? db.prepare(
        `UPDATE quejas
         SET state = ?, registro_entry_number = ?, registro_csv = ?,
             registered_at = COALESCE(registered_at, datetime('now')),
             updated_at = datetime('now')
         WHERE id = ?`
      )
    : db.prepare(`UPDATE quejas SET state = ?, updated_at = datetime('now') WHERE id = ?`)

  const resolvedPatch =
    state === 'resuelta'
      ? db.prepare(
          `UPDATE quejas SET resolved_at = COALESCE(resolved_at, datetime('now')) WHERE id = ?`
        )
      : null

  const tx = db.transaction(() => {
    if (registro) {
      update.run(state, registro.entry_number, registro.csv, id)
    } else {
      update.run(state, id)
    }
    if (resolvedPatch) resolvedPatch.run(id)
    db.prepare('INSERT INTO events (queja_id, kind, payload) VALUES (?, ?, ?)').run(
      id,
      state,
      registro ? JSON.stringify(registro) : null
    )
  })
  tx()
  return getQueja(db, id)
}

// ─── Subscriptions (weekly digest) ─────────────────────────────────────────

export type FilterKind = 'barrio' | 'concejalia' | 'categoria'

export interface SubscriptionRow {
  telegram_user_id: number
  filter_kind: FilterKind
  filter_value: string
  created_at: string
}

export const ALLOWED_FILTER_KINDS: FilterKind[] = ['barrio', 'concejalia', 'categoria']

/** Upsert a subscription. Idempotent — primary key covers the triple. */
export function addSubscription(
  db: Db,
  userId: number,
  kind: FilterKind,
  value: string,
): { added: boolean } {
  const normalised = value.trim().toLowerCase()
  if (!normalised) return { added: false }
  const r = db
    .prepare(
      `INSERT OR IGNORE INTO subscriptions (telegram_user_id, filter_kind, filter_value)
       VALUES (?, ?, ?)`,
    )
    .run(userId, kind, normalised)
  return { added: r.changes > 0 }
}

export function removeSubscription(
  db: Db,
  userId: number,
  kind: FilterKind,
  value: string,
): { removed: boolean } {
  const r = db
    .prepare(
      `DELETE FROM subscriptions
       WHERE telegram_user_id = ? AND filter_kind = ? AND filter_value = ?`,
    )
    .run(userId, kind, value.trim().toLowerCase())
  return { removed: r.changes > 0 }
}

export function listUserSubscriptions(db: Db, userId: number): SubscriptionRow[] {
  return db
    .prepare('SELECT * FROM subscriptions WHERE telegram_user_id = ? ORDER BY created_at DESC')
    .all(userId) as SubscriptionRow[]
}

export function listAllSubscriptions(db: Db): SubscriptionRow[] {
  return db.prepare('SELECT * FROM subscriptions').all() as SubscriptionRow[]
}

/**
 * Find all recent (past `days`) non-deleted quejas matching the given filter.
 * Case-insensitive substring match on the relevant column:
 *   - barrio     → neighborhood (OR address_string via fallback)
 *   - concejalia → concejalia_area
 *   - categoria  → category
 */
export function findMatchingQuejas(
  db: Db,
  kind: FilterKind,
  value: string,
  days: number,
  nowIso: string = new Date().toISOString(),
): QuejaRow[] {
  const cutoff = new Date(nowIso)
  cutoff.setUTCDate(cutoff.getUTCDate() - days)
  const cutoffIso = cutoff.toISOString()
  const pattern = `%${value.trim().toLowerCase()}%`
  const col =
    kind === 'barrio'     ? 'LOWER(COALESCE(neighborhood, \'\'))' :
    kind === 'concejalia' ? 'LOWER(COALESCE(concejalia_area, \'\'))' :
                            'LOWER(category)'
  return db
    .prepare(
      `SELECT * FROM quejas
       WHERE deleted_at IS NULL
         AND created_at >= ?
         AND ${col} LIKE ?
       ORDER BY created_at DESC
       LIMIT 50`,
    )
    .all(cutoffIso, pattern) as QuejaRow[]
}

export function aggregateStats(db: Db): AggregateStats {
  // All public-facing aggregates EXCLUDE soft-deleted rows. The audit trail
  // in `events` keeps the record, but every public surface (UI stats, snapshot
  // export, dashboard) must look through a deleted_at filter.
  const total = (db.prepare('SELECT COUNT(*) as n FROM quejas WHERE deleted_at IS NULL').get() as { n: number }).n
  const byState = Object.fromEntries(
    (db.prepare('SELECT state, COUNT(*) as n FROM quejas WHERE deleted_at IS NULL GROUP BY state').all() as Array<{
      state: string
      n: number
    }>).map((r) => [r.state, r.n])
  )
  const byNeighborhood = Object.fromEntries(
    (
      db
        .prepare(
          `SELECT neighborhood, COUNT(*) as n FROM quejas WHERE deleted_at IS NULL AND neighborhood IS NOT NULL GROUP BY neighborhood`
        )
        .all() as Array<{ neighborhood: string; n: number }>
    ).map((r) => [r.neighborhood, r.n])
  )
  const byCategory = Object.fromEntries(
    (db.prepare('SELECT category, COUNT(*) as n FROM quejas WHERE deleted_at IS NULL GROUP BY category').all() as Array<{
      category: string
      n: number
    }>).map((r) => [r.category, r.n])
  )
  const concejalRows = db
    .prepare(
      `SELECT concejal_slug,
              COUNT(*) as total,
              SUM(CASE WHEN state = 'resuelta' THEN 1 ELSE 0 END) as resueltas,
              SUM(CASE WHEN state = 'silencio_negativo' OR state = 'escalada_sindic' THEN 1 ELSE 0 END) as silencios,
              SUM(CASE WHEN state IN ('capturada','apoyada_verificada','registrada','notificada_10d','en_tramite') THEN 1 ELSE 0 END) as pendientes
       FROM quejas
       WHERE deleted_at IS NULL AND concejal_slug IS NOT NULL AND concejal_slug != ''
       GROUP BY concejal_slug`
    )
    .all() as Array<{
    concejal_slug: string
    total: number
    resueltas: number
    silencios: number
    pendientes: number
  }>
  const byConcejal = Object.fromEntries(
    concejalRows.map((r) => [
      r.concejal_slug,
      {
        total: r.total,
        resueltas: r.resueltas,
        silencios: r.silencios,
        pendientes: r.pendientes,
      },
    ])
  )
  return { total, byState, byNeighborhood, byCategory, byConcejal }
}
