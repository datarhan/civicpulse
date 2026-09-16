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
 * La queja a la que el bot puede responder: la que existe y no se ha retirado con
 * /olvidar. `getQueja` a secas devuelve también las retiradas —la usa quien acaba
 * de escribir la fila—, y cinco sitios la llamaban para contestar a quien
 * preguntara por un id: /estado enseñaba el título de una retirada a cualquiera
 * que lo tuviera, /apoyar le sumaba apoyos y al décimo la volvía a anunciar en el
 * canal, /escalar la mandaba al Síndic, el lote la registraba y el documento del
 * Síndic la servía por HTTP. Para todos ellos, una retirada y un id que no existe
 * contestan igual.
 */
export function getQuejaViva(db: Db, id: string): QuejaRow | null {
  const row = db.prepare('SELECT * FROM quejas WHERE id = ? AND deleted_at IS NULL').get(id) as
    | QuejaRow
    | undefined
  return row ?? null
}

/**
 * Derecho al olvido (RGPD art. 17). La fila se conserva como rastro de auditoría
 * durante el plazo de conservación (cinco años, art. 55 LOPD-GDD), pero sin nada
 * que diga quién la escribió ni desde dónde: en la misma transacción que marca
 * `deleted_at` se borran la identidad de Telegram (id y usuario), las coordenadas
 * y la referencia a la foto. Quedan el texto, la categoría, las fechas y los
 * estados, y todo listado y export sigue filtrando por `deleted_at`.
 *
 * El aviso legal y la respuesta del bot prometían un «registro anónimo» y esta
 * función sólo ponía `deleted_at`: lo único anónimo era el nombre del evento. La
 * identidad servía, según el propio aviso, para consultar, apoyar o eliminar tus
 * quejas, y ese propósito se acaba con la retirada. Consecuencias buscadas: una
 * segunda petición del mismo autor ya no la encuentra, porque el registro ya no
 * sabe que era suya, y /mis deja de listarla.
 *
 * Devuelve true si la retira y false si el id no existe o no es de quien lo pide:
 * la misma respuesta en los dos casos, para no confirmar ids ajenos.
 */
export function softDeleteQueja(db: Db, id: string, userId: number): boolean {
  const row = db.prepare('SELECT telegram_user_id, deleted_at FROM quejas WHERE id = ?').get(id) as
    | { telegram_user_id: number; deleted_at: string | null }
    | undefined
  if (!row) return false
  if (row.telegram_user_id !== userId) return false // never confirm existence cross-user
  // Sólo llega aquí una retirada de antes de este cambio que aún conserva su autor
  // (`anonimizaRetiradas` las limpia al abrir la base): cuenta como hecha.
  if (row.deleted_at) return true
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE quejas
          SET deleted_at = datetime('now'), updated_at = datetime('now'),
              telegram_user_id = 0, telegram_username = NULL,
              lat = NULL, lng = NULL, photo_file_id = NULL
        WHERE id = ?`,
    ).run(id)
    db.prepare(`INSERT INTO events (queja_id, kind, payload) VALUES (?, 'anonymised', ?)`).run(
      id,
      JSON.stringify({ reason: 'user_requested_deletion' }),
    )
  })
  tx()
  return true
}

/**
 * Las quejas retiradas ANTES de que /olvidar borrara la identidad conservan la fila
 * entera, y a quienes las retiraron se les dijo lo mismo: «registro anónimo».
 * `openDb` la llama al abrir la base, así que el primer arranque tras desplegar las
 * deja como las de ahora. Idempotente: devuelve cuántas tocó, y la segunda vez, 0.
 */
export function anonimizaRetiradas(db: Db): number {
  return db
    .prepare(
      `UPDATE quejas
          SET telegram_user_id = 0, telegram_username = NULL,
              lat = NULL, lng = NULL, photo_file_id = NULL
        WHERE deleted_at IS NOT NULL
          AND (telegram_user_id != 0 OR telegram_username IS NOT NULL
               OR lat IS NOT NULL OR lng IS NOT NULL OR photo_file_id IS NOT NULL)`,
    )
    .run().changes
}

/**
 * EL DESEMPATE ES `rowid`, Y NO `id`, POR UN MOTIVO MEDIDO.
 *
 * `created_at` es `datetime('now')`: resolución de SEGUNDO. Dos quejas del
 * mismo segundo empatan siempre, así que el desempate no es un detalle — es
 * quien decide el orden que ve el vecino.
 *
 * `id` no servía. Es `ulid().slice(-8)`, que se queda con el final ALEATORIO y
 * tira los diez caracteres de marca de tiempo que hacen ordenable a un ULID;
 * `monotonicFactory` sólo garantiza el incremento dentro de un mismo
 * milisegundo, y al cruzarlo el sufijo se resiembra al azar. En el portátil las
 * inserciones caían en el mismo milisegundo y el orden salía bien; la primera
 * vez que la suite corrió en CI, el 9-09-2026, salió al revés.
 *
 * `rowid` lo asigna SQLite en orden de inserción y no depende de relojes.
 */
export function listUserQuejas(db: Db, userId: number, limit = 20): QuejaRow[] {
  // Una queja retirada con /olvidar ya no sale aquí sin necesidad de filtrarla: el
  // registro deja de saber de quién era (`telegram_user_id = 0`).
  return db
    .prepare(
      'SELECT * FROM quejas WHERE telegram_user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?',
    )
    .all(userId, limit) as QuejaRow[]
}

export function listRecentQuejas(db: Db, limit = 20): QuejaRow[] {
  return db
    .prepare(
      'SELECT * FROM quejas WHERE deleted_at IS NULL ORDER BY created_at DESC, rowid DESC LIMIT ?',
    )
    .all(limit) as QuejaRow[]
}

/**
 * Non-deleted quejas that carry a Telegram photo_file_id — the input set for
 * the anonymize-and-publish job. Soft-deleted rows (right-to-be-forgotten) are
 * excluded so a withdrawn queja's photo is never processed or published.
 */
export function listQuejasWithPhoto(db: Db, limit = 1000): QuejaRow[] {
  return db
    .prepare(
      `SELECT * FROM quejas
       WHERE deleted_at IS NULL AND photo_file_id IS NOT NULL AND photo_file_id != ''
       ORDER BY created_at DESC, rowid DESC LIMIT ?`,
    )
    .all(limit) as QuejaRow[]
}

export function listByNeighborhood(db: Db, neighborhood: string, limit = 50): QuejaRow[] {
  return db
    .prepare(
      'SELECT * FROM quejas WHERE deleted_at IS NULL AND neighborhood = ? ORDER BY created_at DESC, rowid DESC LIMIT ?',
    )
    .all(neighborhood, limit) as QuejaRow[]
}

export function addApoyo(
  db: Db,
  quejaId: string,
  userId: number,
): { added: boolean; count: number } {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO apoyos (queja_id, telegram_user_id) VALUES (?, ?)',
  )
  const result = insert.run(quejaId, userId)
  const count = countApoyos(db, quejaId)
  if (result.changes === 0) return { added: false, count }

  // Al llegar al umbral, la queja PASA DE ESTADO. Antes esto sólo insertaba el
  // evento y dejaba la columna en `capturada`, y el lote semanal selecciona
  // `WHERE q.state = 'apoyada_verificada'` (services/batch.ts): no podía coger
  // nada, ninguna queja se registraba y el plazo de la LPACAP no arrancaba nunca.
  // El evento decía que el hito había ocurrido; la columna decía que no.
  //
  // En UNA transacción, y con el evento del hito haciendo también de evento de la
  // transición: `setState` inserta uno con el `kind` del estado nuevo, así que
  // llamarlo desde aquí emitiría dos `apoyada_verificada`.
  //
  // `>=` y no `==`: con la guarda de «ya hay evento» es idempotente igual, y así
  // una fila que rebase el umbral sin caer justo en él también promueve.
  //
  // Sólo desde `capturada`. Una queja registrada tiene número de entrada y plazo
  // en marcha; más apoyos no pueden devolverla a la cola.
  if (count >= VERIFIED_THRESHOLD) {
    const tx = db.transaction(() => {
      const promovida = db
        .prepare(
          `UPDATE quejas SET state = 'apoyada_verificada', updated_at = datetime('now')
           WHERE id = ? AND state = 'capturada'`,
        )
        .run(quejaId)
      const already = db
        .prepare(`SELECT 1 FROM events WHERE queja_id = ? AND kind = 'apoyada_verificada' LIMIT 1`)
        .get(quejaId)
      if (!already && promovida.changes > 0) {
        db.prepare(
          `INSERT INTO events (queja_id, kind, payload) VALUES (?, 'apoyada_verificada', ?)`,
        ).run(quejaId, JSON.stringify({ count }))
      }
    })
    tx()
  }
  return { added: true, count }
}

/**
 * Promueve las quejas que ya reunieron los apoyos y se quedaron sin promover.
 *
 * Hace falta porque el defecto estuvo publicado: hay filas con diez apoyos o más
 * y el estado en `capturada`, y nadie las va a volver a apoyar para que el nuevo
 * `addApoyo` las empuje. Es idempotente —la segunda pasada no promueve nada— y va
 * en el arranque, una vez por proceso.
 *
 * Informa de lo INTENTADO y de lo PROMOVIDO por separado, que es la regla 2 de
 * docs/DATA_INTEGRITY.md: doblar «no se intentó» dentro de «sin cambios» es lo
 * que dejó a un pase diciendo «re-judged 1017» sin haber hecho una sola llamada.
 */
export function reconcileApoyadas(db: Db): { intentadas: number; promovidas: number } {
  const pendientes = db
    .prepare(
      `SELECT q.id FROM quejas q
       JOIN (SELECT queja_id, COUNT(*) as n FROM apoyos GROUP BY queja_id) a ON a.queja_id = q.id
       WHERE q.state = 'capturada' AND q.deleted_at IS NULL AND a.n >= ?`,
    )
    .all(VERIFIED_THRESHOLD) as Array<{ id: string }>

  let promovidas = 0
  const tx = db.transaction(() => {
    for (const { id } of pendientes) {
      const r = db
        .prepare(
          `UPDATE quejas SET state = 'apoyada_verificada', updated_at = datetime('now')
           WHERE id = ? AND state = 'capturada'`,
        )
        .run(id)
      // La cuenta sale del `changes` del UPDATE, no de cuántas filas se
      // seleccionaron. Hoy parece lo mismo, porque el `WHERE` de arriba y el de
      // aquí piden lo mismo y SQLite serializa la transacción — de hecho una
      // mutación que borra esta línea SOBREVIVE a las pruebas, y se deja escrito
      // en vez de fingir que está cubierta. Se queda porque los dos criterios
      // pueden separarse el día que alguien toque uno solo, y entonces contar lo
      // seleccionado diría «promoví siete» habiendo promovido cero, que es la
      // regla 2 de docs/DATA_INTEGRITY.md exactamente.
      if (r.changes === 0) continue
      promovidas += 1
      const already = db
        .prepare(`SELECT 1 FROM events WHERE queja_id = ? AND kind = 'apoyada_verificada' LIMIT 1`)
        .get(id)
      if (!already) {
        db.prepare(
          `INSERT INTO events (queja_id, kind, payload) VALUES (?, 'apoyada_verificada', ?)`,
        ).run(id, JSON.stringify({ reconciliada: true }))
      }
    }
  })
  tx()
  return { intentadas: pendientes.length, promovidas }
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
  registro?: { entry_number: string; csv: string },
): QuejaRow | null {
  const update = registro
    ? db.prepare(
        `UPDATE quejas
         SET state = ?, registro_entry_number = ?, registro_csv = ?,
             registered_at = COALESCE(registered_at, datetime('now')),
             updated_at = datetime('now')
         WHERE id = ?`,
      )
    : db.prepare(`UPDATE quejas SET state = ?, updated_at = datetime('now') WHERE id = ?`)

  const resolvedPatch =
    state === 'resuelta'
      ? db.prepare(
          `UPDATE quejas SET resolved_at = COALESCE(resolved_at, datetime('now')) WHERE id = ?`,
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
      registro ? JSON.stringify(registro) : null,
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
    kind === 'barrio'
      ? "LOWER(COALESCE(neighborhood, ''))"
      : kind === 'concejalia'
        ? "LOWER(COALESCE(concejalia_area, ''))"
        : 'LOWER(category)'
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
  const total = (
    db.prepare('SELECT COUNT(*) as n FROM quejas WHERE deleted_at IS NULL').get() as { n: number }
  ).n
  const byState = Object.fromEntries(
    (
      db
        .prepare('SELECT state, COUNT(*) as n FROM quejas WHERE deleted_at IS NULL GROUP BY state')
        .all() as Array<{
        state: string
        n: number
      }>
    ).map((r) => [r.state, r.n]),
  )
  const byNeighborhood = Object.fromEntries(
    (
      db
        .prepare(
          `SELECT neighborhood, COUNT(*) as n FROM quejas WHERE deleted_at IS NULL AND neighborhood IS NOT NULL GROUP BY neighborhood`,
        )
        .all() as Array<{ neighborhood: string; n: number }>
    ).map((r) => [r.neighborhood, r.n]),
  )
  const byCategory = Object.fromEntries(
    (
      db
        .prepare(
          'SELECT category, COUNT(*) as n FROM quejas WHERE deleted_at IS NULL GROUP BY category',
        )
        .all() as Array<{
        category: string
        n: number
      }>
    ).map((r) => [r.category, r.n]),
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
       GROUP BY concejal_slug`,
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
    ]),
  )
  return { total, byState, byNeighborhood, byCategory, byConcejal }
}

/**
 * Eventos del repositorio ya avisados.
 *
 * Se lee entero en cada sondeo porque son cientos de filas como mucho, y una
 * consulta por evento no compraría nada. La poda deja un mes: pasado eso el
 * evento ya no puede reaparecer en las ventanas que sondea el cron, así que
 * conservar la fila sólo haría crecer la tabla.
 */
export function eventosRepoVistos(db: Db): Set<string> {
  const filas = db.prepare('SELECT id FROM repo_eventos_vistos').all() as { id: string }[]
  return new Set(filas.map((f) => f.id))
}

export function marcarEventoRepoVisto(db: Db, id: string): void {
  db.prepare('INSERT OR IGNORE INTO repo_eventos_vistos (id) VALUES (?)').run(id)
}

export function podarEventosRepo(db: Db): number {
  const r = db
    .prepare("DELETE FROM repo_eventos_vistos WHERE seen_at < datetime('now', '-30 days')")
    .run()
  return r.changes
}
