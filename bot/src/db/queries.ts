import type { Db } from './client.ts'
import type { Canal, Moderacion } from './migraciones.ts'
import { nuevoIdDeQueja } from '../services/queja-id.ts'

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
  /** Quien la escribió, o null si la retiró (`/olvidar`) o borró sus datos. */
  ciudadano_id: number | null
  canal: Canal
  category: string
  title: string
  detail: string
  lat: number | null
  lng: number | null
  neighborhood: string | null
  /** La foto con su canal delante (`tg:<file_id>`), o null. Nunca se publica. */
  foto_ref: string | null
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
  /** Dónde está en la revisión antes de publicar. Sólo `publicada` es pública (`SQL_PUBLICA`). */
  moderacion: Moderacion
  /** Cuándo se publicó, o null si no se ha publicado nunca. */
  publicada_at: string | null
}

/**
 * Quien escribe o apoya: un canal y su referencia en él (el id de Telegram; en
 * WhatsApp, el que la plataforma da a cada usuario). Nunca un teléfono ni un
 * nombre. El mismo número en dos canales son dos personas.
 */
export interface Autor {
  canal: Canal
  ref: string
}

export const autorTelegram = (id: number): Autor => ({ canal: 'telegram', ref: String(id) })

/**
 * El ciudadano de un autor. Mirar no crea a nadie: sólo quien escribe o apoya
 * (`crear: true`) gana fila, y quien pregunta por sus quejas sin tener ninguna
 * no deja su id en la base.
 */
export function idCiudadano(db: Db, autor: Autor, o: { crear?: boolean } = {}): number | null {
  const fila = db
    .prepare('SELECT id FROM ciudadanos WHERE canal = ? AND ref = ?')
    .get(autor.canal, autor.ref) as { id: number } | undefined
  if (fila) return fila.id
  if (!o.crear) return null
  return Number(
    db.prepare('INSERT INTO ciudadanos (canal, ref) VALUES (?, ?)').run(autor.canal, autor.ref)
      .lastInsertRowid,
  )
}

/** ¿Es `autor` quien escribió la queja? Una retirada ya no es de nadie. */
export function esAutor(db: Db, quejaId: string, autor: Autor): boolean {
  const cid = idCiudadano(db, autor)
  if (cid === null) return false
  return (
    db.prepare('SELECT 1 FROM quejas WHERE id = ? AND ciudadano_id = ?').get(quejaId, cid) !==
    undefined
  )
}

export interface NewQuejaInput {
  autor: Autor
  category: string
  title: string
  detail: string
  lat?: number | null
  lng?: number | null
  neighborhood?: string | null
  /** La foto con su canal delante: `tg:<file_id>`. */
  foto_ref?: string | null
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

export function createQueja(db: Db, q: NewQuejaInput): QuejaRow {
  const id = nuevoIdDeQueja()
  const insert = db.prepare(`
    INSERT INTO quejas (
      id, ciudadano_id, canal, category, title, detail,
      lat, lng, neighborhood, foto_ref, concejalia_area, concejal_slug
    ) VALUES (
      @id, @ciudadano_id, @canal, @category, @title, @detail,
      @lat, @lng, @neighborhood, @foto_ref, @concejalia_area, @concejal_slug
    )
  `)
  const event = db.prepare(`INSERT INTO events (queja_id, kind) VALUES (?, 'capturada')`)
  const tx = db.transaction((row: NewQuejaInput & { id: string }) => {
    insert.run({
      id: row.id,
      ciudadano_id: idCiudadano(db, row.autor, { crear: true }),
      canal: row.autor.canal,
      category: row.category,
      title: row.title,
      detail: row.detail,
      lat: row.lat ?? null,
      lng: row.lng ?? null,
      neighborhood: row.neighborhood ?? null,
      foto_ref: row.foto_ref ?? null,
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
    QuejaRow | undefined
  return row ?? null
}

/**
 * Lo que ve el público: una queja PUBLICADA —revisada— y no retirada por su
 * autor. Hasta el 2026-09-27 «público» era `deleted_at IS NULL` a secas, escrito
 * en diecinueve sitios, y una queja salía en el acto sin que nadie la leyera.
 * Todo lector que sale fuera —el export y sus cifras, /estado y /apoyar para
 * quien no la escribió, /barrio, /ranking, /digest, los boletines, el lote del
 * Registro, el silencio, la foto y el documento del Síndic— filtra con esto y
 * sólo con esto; `tests/moderacion-publica.test.ts` barre el código y pone en
 * rojo un filtro por `deleted_at` fuera de su lista de lectores no públicos.
 */
export const SQL_PUBLICA = "deleted_at IS NULL AND moderacion = 'publicada'"

/** `SQL_PUBLICA` sobre una tabla con alias: `sqlPublica('q')`. */
export const sqlPublica = (alias: string) =>
  SQL_PUBLICA.replace(/\b(deleted_at|moderacion)\b/g, `${alias}.$1`)

/** La queja que ve el público, o null: para todos ellos, una sin publicar y una que no existe contestan igual. */
export function getQuejaPublica(db: Db, id: string): QuejaRow | null {
  const row = db.prepare(`SELECT * FROM quejas WHERE id = ? AND ${SQL_PUBLICA}`).get(id) as
    QuejaRow | undefined
  return row ?? null
}

/** Lo que un administrador puede hacer con una queja desde su tarjeta. */
export const ACCIONES_MODERACION = ['publicar', 'descartar', 'retirar'] as const
export type AccionModeracion = (typeof ACCIONES_MODERACION)[number]

const TRANSICIONES: Record<AccionModeracion, { desde: Moderacion[]; hasta: Moderacion }> = {
  // Descartar y retirar tienen vuelta atrás: su autor puede impugnarlo, y quien
  // modera, publicarla después (revisión de #137).
  publicar: { desde: ['pendiente', 'retenida', 'descartada', 'retirada'], hasta: 'publicada' },
  descartar: { desde: ['pendiente', 'retenida'], hasta: 'descartada' },
  retirar: { desde: ['publicada'], hasta: 'retirada' },
}

export type ResultadoDecision =
  | { resultado: 'aplicada'; hasta: Moderacion }
  | { resultado: 'ya-decidida'; actual: Moderacion }
  | { resultado: 'retirada-por-autor' }
  | { resultado: 'no-existe' }

/**
 * Decide una queja, con compare-and-set: sólo cambia si sigue en un estado desde
 * el que la acción tiene sentido. Dos administradores que pulsan a la vez, o uno
 * que pulsa una tarjeta vieja, no deciden dos veces: el segundo recibe
 * `ya-decidida` con el estado de verdad. Una queja que su autor retiró con
 * /olvidar no se publica. Cada decisión deja una fila en `moderaciones` —quién,
 * qué— y un evento, en la misma transacción.
 */
export function decidirModeracion(
  db: Db,
  id: string,
  accion: AccionModeracion,
  por: string,
): ResultadoDecision {
  const t = TRANSICIONES[accion]
  return db.transaction((): ResultadoDecision => {
    const fila = db.prepare('SELECT moderacion, deleted_at FROM quejas WHERE id = ?').get(id) as
      { moderacion: Moderacion; deleted_at: string | null } | undefined
    if (!fila) return { resultado: 'no-existe' }
    if (fila.deleted_at) return { resultado: 'retirada-por-autor' }
    const lugares = t.desde.map(() => '?').join(', ')
    const cambio = db
      .prepare(
        `UPDATE quejas
            SET moderacion = ?,
                publicada_at = CASE WHEN ? = 'publicada' THEN datetime('now') ELSE publicada_at END,
                updated_at = datetime('now')
          WHERE id = ? AND deleted_at IS NULL AND moderacion IN (${lugares})`,
      )
      .run(t.hasta, t.hasta, id, ...t.desde)
    if (cambio.changes === 0) return { resultado: 'ya-decidida', actual: fila.moderacion }
    db.prepare('INSERT INTO moderaciones (queja_id, decision, por) VALUES (?, ?, ?)').run(
      id,
      t.hasta,
      por,
    )
    db.prepare('INSERT INTO events (queja_id, kind, payload) VALUES (?, ?, ?)').run(
      id,
      `moderacion_${t.hasta}`,
      JSON.stringify({ por }),
    )
    return { resultado: 'aplicada', hasta: t.hasta }
  })()
}

/** Quién escribió una queja, para avisarle; null si la retiró o borró sus datos. */
export function autorDeQueja(db: Db, id: string): Autor | null {
  const fila = db
    .prepare(
      'SELECT c.canal, c.ref FROM quejas q JOIN ciudadanos c ON c.id = q.ciudadano_id WHERE q.id = ?',
    )
    .get(id) as Autor | undefined
  return fila ?? null
}

/**
 * Derecho al olvido (RGPD art. 17). La fila se conserva como rastro de auditoría
 * durante el plazo de conservación (`CONSERVACION_QUEJAS_ANIOS`, art. 55
 * LOPD-GDD), pero sin nada que diga quién la escribió ni desde dónde: en la misma
 * transacción que marca `deleted_at` se borran el autor (`ciudadano_id`, que queda
 * en NULL: antes era el centinela 0), las coordenadas y la referencia a la foto.
 * Quedan el texto, la categoría, las fechas y los estados, y todo listado y export
 * sigue filtrando por `deleted_at`.
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
export function softDeleteQueja(db: Db, id: string, autor: Autor): boolean {
  const cid = idCiudadano(db, autor)
  if (cid === null) return false
  const row = db.prepare('SELECT ciudadano_id, deleted_at FROM quejas WHERE id = ?').get(id) as
    { ciudadano_id: number | null; deleted_at: string | null } | undefined
  if (!row) return false
  if (row.ciudadano_id !== cid) return false // never confirm existence cross-user
  // Sólo llega aquí una retirada de antes de este cambio que aún conserva su autor
  // (`anonimizaRetiradas` las limpia al abrir la base): cuenta como hecha.
  if (row.deleted_at) return true
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE quejas
          SET deleted_at = datetime('now'), updated_at = datetime('now'),
              ciudadano_id = NULL, lat = NULL, lng = NULL, foto_ref = NULL
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
          SET ciudadano_id = NULL, lat = NULL, lng = NULL, foto_ref = NULL
        WHERE deleted_at IS NOT NULL
          AND (ciudadano_id IS NOT NULL OR lat IS NOT NULL OR lng IS NOT NULL
               OR foto_ref IS NOT NULL)`,
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
export function listUserQuejas(db: Db, autor: Autor, limit = 20): QuejaRow[] {
  // Una queja retirada con /olvidar ya no sale aquí sin necesidad de filtrarla: el
  // registro deja de saber de quién era (`ciudadano_id` en NULL).
  const cid = idCiudadano(db, autor)
  if (cid === null) return []
  return db
    .prepare(
      'SELECT * FROM quejas WHERE ciudadano_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?',
    )
    .all(cid, limit) as QuejaRow[]
}

export function listRecentQuejas(db: Db, limit = 20): QuejaRow[] {
  return db
    .prepare(
      `SELECT * FROM quejas WHERE ${SQL_PUBLICA} ORDER BY created_at DESC, rowid DESC LIMIT ?`,
    )
    .all(limit) as QuejaRow[]
}

/**
 * Las quejas PÚBLICAS con foto: lo que la pasada de fotos anonimiza, y la lista
 * contra la que poda. Sólo lo publicado: sin su `QUEJAS_PHOTOS_DIR`, la pasada
 * escribe junto al quejas.json del sitio, y una foto de una queja sin revisar
 * acabaría en `public/` (revisión de #137). Al publicarse, la foto llega en la
 * pasada siguiente; al retirarse, se poda.
 */
export function listQuejasWithPhoto(db: Db, limit = 1000): QuejaRow[] {
  return db
    .prepare(
      `SELECT * FROM quejas
       WHERE ${SQL_PUBLICA} AND foto_ref IS NOT NULL
       ORDER BY created_at DESC, rowid DESC LIMIT ?`,
    )
    .all(limit) as QuejaRow[]
}

export function listByNeighborhood(db: Db, neighborhood: string, limit = 50): QuejaRow[] {
  return db
    .prepare(
      `SELECT * FROM quejas WHERE ${SQL_PUBLICA} AND neighborhood = ? ORDER BY created_at DESC, rowid DESC LIMIT ?`,
    )
    .all(neighborhood, limit) as QuejaRow[]
}

export function addApoyo(db: Db, quejaId: string, autor: Autor): { added: boolean; count: number } {
  // En una transacción: si la queja no existe, el apoyo falla por su clave ajena
  // y el ciudadano recién creado no se queda en la base sin nada.
  const result = db.transaction(() =>
    db
      .prepare('INSERT OR IGNORE INTO apoyos (queja_id, ciudadano_id) VALUES (?, ?)')
      .run(quejaId, idCiudadano(db, autor, { crear: true })),
  )()
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
       WHERE q.state = 'capturada' AND ${sqlPublica('q')} AND a.n >= ?`,
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
      // La ventana va sobre cuándo se PUBLICÓ: una queja escrita el domingo y
      // publicada el martes no salía ni en el resumen del lunes —aún no era
      // pública— ni en el siguiente —ya tenía más de siete días de escrita—.
      `SELECT * FROM quejas
       WHERE ${SQL_PUBLICA}
         AND COALESCE(publicada_at, created_at) >= ?
         AND ${col} LIKE ?
       ORDER BY created_at DESC
       LIMIT 50`,
    )
    .all(cutoffIso, pattern) as QuejaRow[]
}

export function aggregateStats(db: Db): AggregateStats {
  // Las cifras públicas salen del MISMO conjunto que las quejas del export:
  // publicadas y no retiradas (`SQL_PUBLICA`). Contadas sobre otro, el total
  // diría quejas que el listado no enseña.
  const total = (
    db.prepare(`SELECT COUNT(*) as n FROM quejas WHERE ${SQL_PUBLICA}`).get() as { n: number }
  ).n
  const byState = Object.fromEntries(
    (
      db
        .prepare(`SELECT state, COUNT(*) as n FROM quejas WHERE ${SQL_PUBLICA} GROUP BY state`)
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
          `SELECT neighborhood, COUNT(*) as n FROM quejas WHERE ${SQL_PUBLICA} AND neighborhood IS NOT NULL GROUP BY neighborhood`,
        )
        .all() as Array<{ neighborhood: string; n: number }>
    ).map((r) => [r.neighborhood, r.n]),
  )
  const byCategory = Object.fromEntries(
    (
      db
        .prepare(
          `SELECT category, COUNT(*) as n FROM quejas WHERE ${SQL_PUBLICA} GROUP BY category`,
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
       WHERE ${SQL_PUBLICA} AND concejal_slug IS NOT NULL AND concejal_slug != ''
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

/**
 * Fotos que la pasada horaria no ha podido anonimizar (ver `fotos_retenidas` en
 * schema.sql). La pasada las anota, las olvida al publicarlas y, al pasar un
 * día, pide avisar de ellas una vez.
 */
export interface FotoRetenida {
  queja_id: string
  /** La PRIMERA retención, en ISO. No se mueve con los reintentos. */
  desde: string
  motivo: string
  intentos: number
  avisada_at: string | null
}

/** Anota una retención: la primera fija `desde`; las siguientes cuentan intentos y actualizan el motivo. */
export function registrarFotoRetenida(db: Db, quejaId: string, motivo: string, ahora: Date): void {
  db.prepare(
    `INSERT INTO fotos_retenidas (queja_id, desde, motivo) VALUES (?, ?, ?)
     ON CONFLICT(queja_id) DO UPDATE SET motivo = excluded.motivo, intentos = intentos + 1`,
  ).run(quejaId, ahora.toISOString(), motivo.slice(0, 500))
}

export function olvidarFotoRetenida(db: Db, quejaId: string): void {
  db.prepare('DELETE FROM fotos_retenidas WHERE queja_id = ?').run(quejaId)
}

export function fotosRetenidas(db: Db): FotoRetenida[] {
  return db
    .prepare('SELECT * FROM fotos_retenidas ORDER BY desde, queja_id')
    .all() as FotoRetenida[]
}

/** Las retenidas desde `hasta` o antes que aún no se han avisado. */
export function fotosRetenidasSinAvisar(db: Db, hasta: Date): FotoRetenida[] {
  return db
    .prepare(
      'SELECT * FROM fotos_retenidas WHERE avisada_at IS NULL AND desde <= ? ORDER BY desde, queja_id',
    )
    .all(hasta.toISOString()) as FotoRetenida[]
}

export function marcarFotoRetenidaAvisada(db: Db, quejaId: string, ahora: Date): void {
  db.prepare('UPDATE fotos_retenidas SET avisada_at = ? WHERE queja_id = ?').run(
    ahora.toISOString(),
    quejaId,
  )
}

/**
 * Deja sólo las filas de las fotos que siguen pendientes. Una queja retirada, o
 * cuya foto ya está publicada, deja de estar retenida, y su fila no debe
 * producir un aviso.
 */
export function podarFotosRetenidas(db: Db, pendientes: string[]): number {
  const vivas = new Set(pendientes)
  const borrar = db.prepare('DELETE FROM fotos_retenidas WHERE queja_id = ?')
  let n = 0
  for (const f of fotosRetenidas(db)) {
    if (!vivas.has(f.queja_id)) n += borrar.run(f.queja_id).changes
  }
  return n
}
