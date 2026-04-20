import { ulid } from 'ulid'
import type { Db } from './client.ts'

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
}

// Minimum apoyos to tag a queja as community-verified.
export const VERIFIED_THRESHOLD = 10

function newId(): string {
  // Short, readable, collision-resistant enough for a small muni.
  // ULID is monotonic; last 8 chars give us ~40 bits of timestamp+random.
  return 'Q-' + ulid().slice(-8)
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

export function listUserQuejas(db: Db, userId: number, limit = 20): QuejaRow[] {
  return db
    .prepare('SELECT * FROM quejas WHERE telegram_user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?')
    .all(userId, limit) as QuejaRow[]
}

export function listRecentQuejas(db: Db, limit = 20): QuejaRow[] {
  return db
    .prepare('SELECT * FROM quejas ORDER BY created_at DESC, id DESC LIMIT ?')
    .all(limit) as QuejaRow[]
}

export function listByNeighborhood(db: Db, neighborhood: string, limit = 50): QuejaRow[] {
  return db
    .prepare('SELECT * FROM quejas WHERE neighborhood = ? ORDER BY created_at DESC, id DESC LIMIT ?')
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

export function aggregateStats(db: Db): AggregateStats {
  const total = (db.prepare('SELECT COUNT(*) as n FROM quejas').get() as { n: number }).n
  const byState = Object.fromEntries(
    (db.prepare('SELECT state, COUNT(*) as n FROM quejas GROUP BY state').all() as Array<{
      state: string
      n: number
    }>).map((r) => [r.state, r.n])
  )
  const byNeighborhood = Object.fromEntries(
    (
      db
        .prepare(
          `SELECT neighborhood, COUNT(*) as n FROM quejas WHERE neighborhood IS NOT NULL GROUP BY neighborhood`
        )
        .all() as Array<{ neighborhood: string; n: number }>
    ).map((r) => [r.neighborhood, r.n])
  )
  const byCategory = Object.fromEntries(
    (db.prepare('SELECT category, COUNT(*) as n FROM quejas GROUP BY category').all() as Array<{
      category: string
      n: number
    }>).map((r) => [r.category, r.n])
  )
  return { total, byState, byNeighborhood, byCategory }
}
