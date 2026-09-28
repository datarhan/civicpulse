/**
 * Las tarjetas de revisión: cada queja nueva llega a cada administrador, por
 * Telegram, con [Publicar] y [Descartar]; una publicada, con [Retirar]; una
 * descartada o retirada, con [Publicar], porque decidir tiene vuelta atrás.
 *
 * Hasta el 2026-09-27 una queja salía en el acto —en la web y en el canal
 * público— sin que nadie la leyera. Ahora nace `pendiente` y no es pública
 * hasta que un administrador decide (commands/moderar.ts). La puerta falla
 * cerrada: si la tarjeta no llega a ningún administrador ACTUAL —el bot
 * bloqueado, Telegram caído, un administrador que dejó de serlo—, la queja
 * sigue sin publicar, la pasada horaria la reenvía y `/health` lo dice.
 *
 * `avisos` guarda lo que el bot ha mandado de cada queja viva: cada copia de su
 * tarjeta (`admin:<id>`; `/revisar` manda copias de más), para cambiarlas todas
 * al decidir, y el aviso de cada decisión a su autor, sin decir a quién, para no
 * repetirlo. Un envío se RECLAMA antes de mandarlo —una fila sin resultado—, así
 * que dos pasadas a la vez no mandan dos; un reclamo que se quedó a medias caduca
 * a los diez minutos. Cuando la queja deja de estar viva, sus copias pasan a
 * `tarjetas_por_vaciar` en la misma transacción que la retira o la destruye
 * (`aVaciar`, db/queries.ts), y se vacían en el acto; lo que Telegram no deje
 * vaciar entonces lo reintenta la pasada horaria (`pasadaHoraria`). Todo lo que
 * toca las tarjetas de una queja va de uno en uno (`enSerie`).
 *
 * No se pausa con el bloqueo LOREG: decidir es de una persona, y la pausa es
 * para lo automático.
 */
import { randomUUID } from 'node:crypto'
import type { Api } from 'grammy'
import type { Db } from '../db/client.ts'
import type { Moderacion, MotivoVaciado } from '../db/migraciones.ts'
import {
  aVaciar,
  getQuejaViva,
  SQL_ES_TARJETA,
  TIPO_TARJETA,
  type QuejaRow,
} from '../db/queries.ts'
import type { EstadoModeracion } from './health.ts'
import { avisoAlAutor, DECISIONES_CON_AVISO } from './textos-revision.ts'
import { escaparHtml } from '../util/html.ts'
import { logger } from '../util/log.ts'
import { cortar, MAX_MENSAJE } from '../util/telegram.ts'

export interface Boton {
  texto: string
  data: string
}

/** Mandar y cambiar mensajes por Telegram. Si Telegram rechaza, lanza. */
export interface EnvioAdmin {
  enviar(adminId: number, html: string, botones: Boton[]): Promise<{ message_id: number }>
  editar(adminId: number, messageId: number, html: string, botones: Boton[]): Promise<void>
  /** Un texto plano a un chat: el aviso a quien escribió la queja. */
  mensaje(chatId: number, texto: string): Promise<{ message_id: number }>
}

const comoAdmin = (id: number) => `admin:${id}`
const idDeAdmin = (destinatario: string) => Number(destinatario.slice('admin:'.length))

const CABECERA: Record<Moderacion, string> = {
  pendiente: '🆕 Pendiente de revisión',
  retenida: '⚠️ Retenida: necesita tu decisión',
  publicada: '✅ Publicada',
  descartada: '🗑 Descartada',
  retirada: '↩️ Retirada de la publicación',
}

function botonesDe(q: QuejaRow): Boton[] {
  if (q.moderacion === 'pendiente' || q.moderacion === 'retenida') {
    return [
      { texto: '✅ Publicar', data: `mod:pub:${q.id}` },
      { texto: '🗑 Descartar', data: `mod:desc:${q.id}` },
    ]
  }
  if (q.moderacion === 'publicada') return [{ texto: '↩️ Retirar', data: `mod:ret:${q.id}` }]
  // Descartada o retirada: la decisión se puede revisar.
  return [{ texto: '✅ Publicar', data: `mod:pub:${q.id}` }]
}

/**
 * La tarjeta de una queja, en el HTML de Telegram. Dice lo que se publica con
 * ella y no se ve en el texto: si trae foto —que se publica anonimizada y que
 * la tarjeta no enseña— y a qué área y cargo la atribuye el enrutador. El texto
 * es del vecino: pasa por `escaparHtml`, y se corta DESPUÉS de escapar (un `&`
 * escapado mide cinco), para que la tarjeta quepa siempre en un mensaje.
 */
export function tarjetaDeQueja(q: QuejaRow, nota?: string): { html: string; botones: Boton[] } {
  const cabecera = [
    `<b>${CABECERA[q.moderacion]}</b> · <code>${q.id}</code>`,
    escaparHtml([q.category, q.neighborhood].filter(Boolean).join(' · ')),
    escaparHtml(`Área: ${q.concejalia_area ?? '—'} · Cargo: ${q.concejal_slug ?? '—'}`),
    q.foto_ref
      ? '📷 Trae foto: se publica sólo anonimizada, y no se ve en esta tarjeta.'
      : 'Sin foto.',
    '',
    `<b>${cortar(escaparHtml(q.title), 600)}</b>`,
  ].join('\n')
  const pie = nota ? `\n\n<i>${escaparHtml(nota)}</i>` : ''
  const cabe = MAX_MENSAJE - cabecera.length - pie.length - 2
  const detalle = cortar(escaparHtml(q.detail), Math.max(0, cabe))
  return { html: `${cabecera}\n\n${detalle}${pie}`, botones: botonesDe(q) }
}

/**
 * La tarjeta de una queja cuyo texto ya no debe estar en ningún chat: su autor
 * la retiró con /olvidar o borró sus datos, o se destruyó al cumplirse el plazo
 * de conservación. Sin texto y sin botones.
 */
export function tarjetaSinQueja(
  id: string,
  motivo: MotivoVaciado = 'retirada',
): { html: string; botones: Boton[] } {
  const que =
    motivo === 'destruida'
      ? '⌛ Destruida al cumplirse el plazo de conservación'
      : '🚮 Retirada por su autor'
  return {
    html: `<b>${que}</b> · <code>${id}</code>\n\n<i>Su texto ya no se enseña aquí.</i>`,
    botones: [],
  }
}

/**
 * Lo que toca las tarjetas de una queja, de uno en uno. Sin esto, una edición con
 * el texto que salió antes de /olvidar podía llegar después de vaciar la tarjeta,
 * y el texto volvía al chat sin nada que lo recordara (revisión de la pasada de
 * #137). El bot corre en un solo proceso —una máquina en Fly, con la base en su
 * volumen—, así que basta un candado en memoria. No se anida: lo que corre dentro
 * no vuelve a pedirlo.
 */
const enCurso = new Map<string, Promise<void>>()

async function enSerie<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const antes = enCurso.get(id) ?? Promise.resolve()
  let terminar!: () => void
  const hecho = new Promise<void>((r) => (terminar = r))
  const esta = antes.then(() => hecho)
  enCurso.set(id, esta)
  await antes
  try {
    return await fn()
  } finally {
    terminar()
    if (enCurso.get(id) === esta) enCurso.delete(id)
  }
}

/** Reclama un envío: true si nadie lo tenía. Un reclamo a medias de hace más de diez minutos se libera. */
function reclamar(db: Db, quejaId: string, tipo: string, destinatario: string): boolean {
  db.prepare(
    `DELETE FROM avisos
      WHERE queja_id = ? AND tipo = ? AND destinatario = ?
        AND resultado IS NULL AND creado_at < datetime('now', '-10 minutes')`,
  ).run(quejaId, tipo, destinatario)
  return (
    db
      .prepare('INSERT OR IGNORE INTO avisos (queja_id, tipo, destinatario) VALUES (?, ?, ?)')
      .run(quejaId, tipo, destinatario).changes > 0
  )
}

/** Anota cómo acabó un envío reclamado. False si su reclamo ya no está: la queja dejó de estar viva mientras salía. */
function anotar(
  db: Db,
  quejaId: string,
  tipo: string,
  destinatario: string,
  resultado: 'entregado' | 'rechazado',
  messageId: number | null,
): boolean {
  return (
    db
      .prepare(
        'UPDATE avisos SET resultado = ?, message_id = ? WHERE queja_id = ? AND tipo = ? AND destinatario = ?',
      )
      .run(resultado, messageId, quejaId, tipo, destinatario).changes > 0
  )
}

function soltar(db: Db, quejaId: string, tipo: string, destinatario: string): void {
  db.prepare('DELETE FROM avisos WHERE queja_id = ? AND tipo = ? AND destinatario = ?').run(
    quejaId,
    tipo,
    destinatario,
  )
}

/**
 * Lo que Telegram no aceptará por mucho que se repita: quien recibe bloqueó el
 * bot (403), o el chat o el mensaje no existen (400).
 */
const RECHAZO_DEFINITIVO = new Set([400, 403])

/** grammY lanza lo que Telegram rechaza con el código en `error_code`; un error de red no lo trae. */
function esRechazoDefinitivo(err: unknown): boolean {
  const codigo = (err as { error_code?: unknown } | null)?.error_code
  return typeof codigo === 'number' && RECHAZO_DEFINITIVO.has(codigo)
}

interface CopiaDeTarjeta {
  destinatario: string
  message_id: number
}

/** Cómo acabó mandar una copia: `retirada` es que su autor la retiró antes de que saliera, y no salió. */
export type ResultadoCopia = 'entregada' | 'fallida' | 'ya-estaba' | 'retirada'

/**
 * Manda una copia de la tarjeta a un administrador y la anota; se llama con el
 * candado de la queja. La fila que trae quien llama puede ser vieja —la pasada
 * horaria lee su lista antes de mandar nada, `/revisar` la lee fuera del
 * candado—, así que se vuelve a leer aquí, sin un `await` hasta reclamar: si su
 * autor la retiró mientras tanto, no sale nada (revisión de la ronda 4 de #137).
 * Si al volver del envío su reclamo ya no está —la retirada llegó mientras
 * salía y borró el rastro—, la copia recién llegada va derecha a la cola de
 * vaciado, y se vacía.
 */
async function mandarCopia(
  db: Db,
  fila: QuejaRow,
  admin: number,
  tipo: string,
  envio: EnvioAdmin,
): Promise<ResultadoCopia> {
  const q = getQuejaViva(db, fila.id)
  if (!q) return 'retirada'
  const destinatario = comoAdmin(admin)
  if (!reclamar(db, q.id, tipo, destinatario)) return 'ya-estaba'
  const { html, botones } = tarjetaDeQueja(q)
  let m: { message_id: number }
  try {
    m = await envio.enviar(admin, html, botones)
  } catch (err) {
    soltar(db, q.id, tipo, destinatario)
    logger.warn('avisos-admin.tarjeta', { queja: q.id, admin, err: String(err) })
    return 'fallida'
  }
  if (anotar(db, q.id, tipo, destinatario, 'entregado', m.message_id)) return 'entregada'
  if (getQuejaViva(db, q.id)) {
    // Viva y sin reclamo: sólo si el envío tardó más que la caducidad del reclamo y
    // otro lo tomó. Se sigue como una copia más, para no perderla de vista.
    db.prepare(
      `INSERT INTO avisos (queja_id, tipo, destinatario, message_id, resultado)
       VALUES (?, ?, ?, ?, 'entregado')`,
    ).run(q.id, `${TIPO_TARJETA}:${randomUUID().slice(0, 8)}`, destinatario, m.message_id)
    return 'entregada'
  }
  const existe = db.prepare('SELECT 1 FROM quejas WHERE id = ?').get(q.id) !== undefined
  db.prepare(
    `INSERT OR IGNORE INTO tarjetas_por_vaciar (destinatario, message_id, queja_id, motivo)
     VALUES (?, ?, ?, ?)`,
  ).run(destinatario, m.message_id, q.id, existe ? 'retirada' : 'destruida')
  await vaciarColaDe(db, q.id, envio)
  return 'entregada'
}

/**
 * Manda la tarjeta de una queja a cada administrador que no la tenga ya, y
 * anota las que llegaron. Una que falla se suelta para la pasada siguiente. Si
 * su autor la retiró antes de que saliera, no sale ninguna (`retirada`).
 */
export async function avisarAdmins(
  db: Db,
  q: QuejaRow,
  o: { admins: number[]; envio: EnvioAdmin },
): Promise<{ entregadas: number; fallidas: number; retirada: boolean }> {
  return enSerie(q.id, async () => {
    const r = { entregadas: 0, fallidas: 0, retirada: false }
    for (const admin of o.admins) {
      const hecho = await mandarCopia(db, q, admin, TIPO_TARJETA, o.envio)
      if (hecho === 'retirada') {
        r.retirada = true
        break
      }
      if (hecho === 'entregada') r.entregadas += 1
      else if (hecho === 'fallida') r.fallidas += 1
    }
    return r
  })
}

/**
 * Una copia más de la tarjeta de una queja viva a UN administrador: la de
 * `/revisar`. Las anteriores siguen contadas —se ponen al día al decidir y
 * pierden el texto si la queja se retira—, y sus botones siguen valiendo, porque
 * decidir es compare-and-set.
 */
export async function enviarTarjetaA(
  db: Db,
  q: QuejaRow,
  admin: number,
  envio: EnvioAdmin,
): Promise<ResultadoCopia> {
  const tipo = `${TIPO_TARJETA}:${randomUUID().slice(0, 8)}`
  return enSerie(q.id, () => mandarCopia(db, q, admin, tipo, envio))
}

/**
 * Pone al día todas las copias de la tarjeta de una queja. Un fallo al editar una
 * copia no deshace nada: se registra y se sigue con las demás. Si la queja ya no
 * está viva, vacía las que esperan en su cola.
 */
export async function actualizarTarjetas(
  db: Db,
  id: string,
  o: { envio: EnvioAdmin; nota?: string },
): Promise<void> {
  await enSerie(id, async () => {
    const q = getQuejaViva(db, id)
    if (!q) {
      await vaciarColaDe(db, id, o.envio)
      return
    }
    const copias = db
      .prepare(
        `SELECT destinatario, message_id FROM avisos
          WHERE queja_id = ? AND ${SQL_ES_TARJETA} AND message_id IS NOT NULL`,
      )
      .all(id) as CopiaDeTarjeta[]
    const { html, botones } = tarjetaDeQueja(q, o.nota)
    await editar(copias, html, botones, o.envio, id)
  })
}

async function editar(
  copias: CopiaDeTarjeta[],
  html: string,
  botones: Boton[],
  envio: EnvioAdmin,
  id: string,
): Promise<void> {
  for (const c of copias) {
    try {
      await envio.editar(idDeAdmin(c.destinatario), c.message_id, html, botones)
    } catch (err) {
      logger.warn('avisos-admin.editar', { queja: id, err: String(err) })
    }
  }
}

/** Lo que hizo una pasada de vaciar tarjetas, contado por separado. */
export interface ResultadoVaciado {
  intentadas: number
  vaciadas: number
  /** En un chat que Telegram ya no deja tocar: no se reintentan. */
  sinAcceso: number
  /** Fallidas de paso: quedan para la pasada siguiente. */
  fallidas: number
}

const vaciadoVacio = (): ResultadoVaciado => ({
  intentadas: 0,
  vaciadas: 0,
  sinAcceso: 0,
  fallidas: 0,
})

/**
 * Quita el texto de las copias de la tarjeta de una queja que esperan en la cola;
 * se llama con su candado. Cada fila se va cuando ya no queda nada que hacer
 * —vaciada, ya vacía («message is not modified»), o en un chat que Telegram no
 * deja tocar— y se queda para la pasada horaria si falló de paso.
 */
async function vaciarColaDe(db: Db, id: string, envio: EnvioAdmin): Promise<ResultadoVaciado> {
  const filas = db
    .prepare(
      `SELECT destinatario, message_id, motivo FROM tarjetas_por_vaciar
        WHERE queja_id = ? ORDER BY destinatario, message_id`,
    )
    .all(id) as Array<CopiaDeTarjeta & { motivo: MotivoVaciado }>
  const r = vaciadoVacio()
  for (const f of filas) {
    r.intentadas += 1
    const { html, botones } = tarjetaSinQueja(id, f.motivo)
    let hecho: 'vaciadas' | 'sinAcceso' | 'fallidas' = 'vaciadas'
    try {
      await envio.editar(idDeAdmin(f.destinatario), f.message_id, html, botones)
    } catch (err) {
      if (!/message is not modified/i.test(String(err))) {
        hecho = esRechazoDefinitivo(err) ? 'sinAcceso' : 'fallidas'
        logger.warn('avisos-admin.vaciar', { queja: id, err: String(err) })
      }
    }
    if (hecho !== 'fallidas') {
      db.prepare('DELETE FROM tarjetas_por_vaciar WHERE destinatario = ? AND message_id = ?').run(
        f.destinatario,
        f.message_id,
      )
    }
    r[hecho] += 1
  }
  return r
}

/**
 * Las tarjetas que esperan en cola a perder el texto —de quejas retiradas por su
 * autor o destruidas por el plazo de conservación— porque Telegram falló al
 * vaciarlas entonces; cada queja, con su candado.
 */
export async function vaciarTarjetasEnCola(db: Db, envio: EnvioAdmin): Promise<ResultadoVaciado> {
  // Por el camino que sea —una retirada que no pasó por `softDeleteQueja`—, lo
  // que una queja muerta dejó en `avisos` pasa a la cola antes de vaciarla.
  const muertas = db
    .prepare(
      `SELECT DISTINCT a.queja_id FROM avisos a
         JOIN quejas q ON q.id = a.queja_id
        WHERE q.deleted_at IS NOT NULL`,
    )
    .all() as Array<{ queja_id: string }>
  if (muertas.length > 0) {
    db.transaction(() =>
      aVaciar(
        db,
        muertas.map((m) => m.queja_id),
        'retirada',
      ),
    )()
  }
  const ids = db
    .prepare('SELECT DISTINCT queja_id FROM tarjetas_por_vaciar ORDER BY queja_id')
    .all() as Array<{ queja_id: string }>
  const total = vaciadoVacio()
  for (const { queja_id } of ids) {
    const r = await enSerie(queja_id, () => vaciarColaDe(db, queja_id, envio))
    total.intentadas += r.intentadas
    total.vaciadas += r.vaciadas
    total.sinAcceso += r.sinAcceso
    total.fallidas += r.fallidas
  }
  return total
}

function tieneTarjetaActual(db: Db, quejaId: string, admins: number[]): boolean {
  if (admins.length === 0) return false
  return (
    db
      .prepare(
        `SELECT 1 FROM avisos
          WHERE queja_id = ? AND ${SQL_ES_TARJETA} AND message_id IS NOT NULL
            AND destinatario IN (${admins.map(() => '?').join(', ')})`,
      )
      .get(quejaId, ...admins.map(comoAdmin)) !== undefined
  )
}

/**
 * Las quejas en revisión que ningún administrador ACTUAL tiene, otra vez: la que
 * no llegó a nadie, y la que sólo tiene quien ya no administra. Cuenta las
 * quejas que intenta y las tarjetas que entrega y que fallan, por separado.
 */
export async function reenviarTarjetasPendientes(
  db: Db,
  o: { admins: number[]; envio: EnvioAdmin },
): Promise<{ quejas: number; entregadas: number; fallidas: number; retiradas: number }> {
  const enRevision = db
    .prepare(
      `SELECT * FROM quejas
        WHERE moderacion IN ('pendiente', 'retenida') AND deleted_at IS NULL
        ORDER BY rowid`,
    )
    .all() as QuejaRow[]
  const sinTarjeta = enRevision.filter((q) => !tieneTarjetaActual(db, q.id, o.admins))
  // `retiradas`: las que su autor retiró mientras la pasada mandaba las de antes.
  const r = { quejas: sinTarjeta.length, entregadas: 0, fallidas: 0, retiradas: 0 }
  if (o.admins.length === 0) return r
  for (const q of sinTarjeta) {
    const e = await avisarAdmins(db, q, o)
    r.entregadas += e.entregadas
    r.fallidas += e.fallidas
    if (e.retirada) r.retiradas += 1
  }
  return r
}

const horasDesde = (sqlite: string, ahora: Date) =>
  Math.floor((ahora.getTime() - Date.parse(`${sqlite.replace(' ', 'T')}Z`)) / 3_600_000)

export function estadoModeracion(db: Db, admins: number[], ahora = new Date()): EstadoModeracion {
  const enRevision = db
    .prepare(
      `SELECT id, created_at FROM quejas
        WHERE moderacion IN ('pendiente', 'retenida') AND deleted_at IS NULL
        ORDER BY created_at`,
    )
    .all() as Array<{ id: string; created_at: string }>
  const cola = db
    .prepare('SELECT COUNT(*) AS total, MIN(creada_at) AS desde FROM tarjetas_por_vaciar')
    .get() as { total: number; desde: string | null }
  return {
    pendientes: enRevision.length,
    sinTarjeta: enRevision.filter((q) => !tieneTarjetaActual(db, q.id, admins)).length,
    masAntiguaHoras: enRevision.length ? horasDesde(enRevision[0].created_at, ahora) : null,
    porVaciar: {
      total: cola.total,
      masAntiguaHoras: cola.desde ? horasDesde(cola.desde, ahora) : null,
    },
  }
}

/**
 * La cola de revisión, para `/pendientes`: de la más antigua a la más nueva. Sin
 * el texto de ninguna: ese mensaje no se vacía cuando su autor retira la queja,
 * y para leerla está su tarjeta (`/revisar`).
 */
export function listarPendientes(
  db: Db,
  ahora = new Date(),
): Array<{ id: string; moderacion: Moderacion; horas: number }> {
  const filas = db
    .prepare(
      `SELECT id, moderacion, created_at FROM quejas
        WHERE moderacion IN ('pendiente', 'retenida') AND deleted_at IS NULL
        ORDER BY created_at`,
    )
    .all() as Array<{ id: string; moderacion: Moderacion; created_at: string }>
  return filas.map((f) => ({
    id: f.id,
    moderacion: f.moderacion,
    horas: horasDesde(f.created_at, ahora),
  }))
}

/** Lo que hizo una pasada de avisos a autores, contado por separado. */
export interface ResultadoAvisos {
  intentados: number
  entregados: number
  /** Rechazados para siempre: se anotan y no se reintentan. */
  rechazados: number
  /** Fallidos de paso —la red, un 429—: quedan para la pasada siguiente. */
  fallidos: number
}

interface AvisoQueFalta {
  decision: number
  queja_id: string
  hasta: Moderacion
  ref: string
}

/**
 * Los avisos a su autor que faltan: el de la ÚLTIMA decisión de cada queja viva
 * de un autor de Telegram, si esa decisión lleva aviso y no consta entregado ni
 * rechazado. Lo que no sale aquí no tiene a quién ni qué decir —su autora la
 * retiró o borró sus datos, o la decisión no lleva aviso—, así que ninguna
 * pasada vuelve sobre ello. Un reclamo sin resultado sí sale: si caducó porque
 * el proceso cayó al mandarlo, `reclamar` lo toma.
 */
function avisosQueFaltan(db: Db, quejaId?: string): AvisoQueFalta[] {
  return db
    .prepare(
      `SELECT m.id AS decision, m.queja_id, m.decision AS hasta, c.ref
         FROM moderaciones m
         JOIN quejas q ON q.id = m.queja_id
         JOIN ciudadanos c ON c.id = q.ciudadano_id
        WHERE q.deleted_at IS NULL AND q.moderacion = m.decision AND c.canal = 'telegram'
          AND m.decision IN (${DECISIONES_CON_AVISO.map(() => '?').join(', ')})
          AND m.id = (SELECT MAX(id) FROM moderaciones WHERE queja_id = m.queja_id)
          AND NOT EXISTS (SELECT 1 FROM avisos a
                           WHERE a.queja_id = m.queja_id AND a.tipo = 'autor:' || m.id
                             AND a.resultado IS NOT NULL)
          ${quejaId ? 'AND m.queja_id = ?' : ''}
        ORDER BY m.id`,
    )
    .all(...DECISIONES_CON_AVISO, ...(quejaId ? [quejaId] : [])) as AvisoQueFalta[]
}

/**
 * Manda los avisos a su autor que faltan, de una queja o de todas. Cada uno se
 * reclama antes de mandarlo, así que dos pasadas a la vez no avisan dos veces.
 */
export async function avisarAutores(
  db: Db,
  o: { envio: EnvioAdmin; quejaId?: string },
): Promise<ResultadoAvisos> {
  const r: ResultadoAvisos = { intentados: 0, entregados: 0, rechazados: 0, fallidos: 0 }
  for (const leido of avisosQueFaltan(db, o.quejaId)) {
    // La lista se leyó antes de mandar nada: mientras salían los anteriores, su
    // autor pudo retirar la queja o alguien decidirla otra vez. Se mira de nuevo,
    // sin un `await` hasta reclamar.
    const f = avisosQueFaltan(db, leido.queja_id).find((a) => a.decision === leido.decision)
    if (!f) continue
    const texto = avisoAlAutor(f.queja_id, f.hasta)
    const tipo = `autor:${f.decision}`
    // Sin decir a quién: el destinatario sale de `ciudadanos` al mandarlo, y así
    // /olvidar y /borrar_mis_datos no dejan aquí su identidad.
    const destinatario = 'autor'
    if (!texto || !reclamar(db, f.queja_id, tipo, destinatario)) continue
    r.intentados += 1
    try {
      const m = await o.envio.mensaje(Number(f.ref), texto)
      anotar(db, f.queja_id, tipo, destinatario, 'entregado', m.message_id)
      r.entregados += 1
    } catch (err) {
      if (esRechazoDefinitivo(err)) {
        anotar(db, f.queja_id, tipo, destinatario, 'rechazado', null)
        r.rechazados += 1
      } else {
        soltar(db, f.queja_id, tipo, destinatario)
        r.fallidos += 1
      }
      logger.warn('avisos-admin.aviso-autor', { queja: f.queja_id, err: String(err) })
    }
  }
  return r
}

/**
 * Lo que sigue a una decisión, hecho de forma que se pueda repetir: las
 * tarjetas al día y el aviso de la última decisión a su autor, una sola vez
 * (`autor:<id de la decisión>`). Si contestar al botón falla, o el proceso cae a
 * mitad, un segundo toque o la pasada horaria lo terminan sin repetir nada.
 */
export async function completarSeguimiento(
  db: Db,
  id: string,
  o: { envio: EnvioAdmin },
): Promise<ResultadoAvisos> {
  await actualizarTarjetas(db, id, { envio: o.envio })
  return avisarAutores(db, { envio: o.envio, quejaId: id })
}

/**
 * La pasada horaria de lo que sigue a las decisiones: sólo los avisos que
 * faltan. Las tarjetas no se reescriben cada hora: se ponen al día al decidir,
 * y una que se quedó atrás, al tocar su botón viejo (`ya-decidida`).
 */
export function completarSeguimientosPendientes(
  db: Db,
  o: { envio: EnvioAdmin },
): Promise<ResultadoAvisos> {
  return avisarAutores(db, { envio: o.envio })
}

/**
 * La pasada horaria: las tarjetas que ningún administrador actual tiene, las
 * que esperan en cola a perder el texto de una queja retirada o destruida, y los
 * avisos que faltan a sus autores. Cada parte cuenta lo suyo.
 */
export async function pasadaHoraria(db: Db, o: { admins: number[]; envio: EnvioAdmin }) {
  const tarjetas = await reenviarTarjetasPendientes(db, o)
  const vaciadas = await vaciarTarjetasEnCola(db, o.envio)
  const avisos = await completarSeguimientosPendientes(db, { envio: o.envio })
  return { tarjetas, vaciadas, avisos }
}

const HORA_MS = 60 * 60 * 1000

/** Al arrancar y cada hora, `pasadaHoraria`. */
export function startReenvioTarjetas(o: {
  db: Db
  admins: () => number[]
  envio: EnvioAdmin
}): () => void {
  const tick = async () => {
    try {
      const r = await pasadaHoraria(o.db, { admins: o.admins(), envio: o.envio })
      if (r.tarjetas.quejas > 0) logger.info('avisos-admin.reenvio', r.tarjetas)
      if (r.vaciadas.intentadas > 0) logger.info('avisos-admin.vaciado', { ...r.vaciadas })
      if (r.avisos.intentados > 0) logger.info('avisos-admin.seguimiento', { ...r.avisos })
    } catch (err) {
      logger.error('avisos-admin.reenvio', { err: String(err) })
    }
  }
  void tick()
  const handle = setInterval(() => void tick(), HORA_MS)
  return () => clearInterval(handle)
}

/** El envío de verdad, por la API del bot. */
export function envioDesdeApi(api: Api): EnvioAdmin {
  const teclado = (botones: Boton[]) => ({
    inline_keyboard: botones.length
      ? [botones.map((b) => ({ text: b.texto, callback_data: b.data }))]
      : [],
  })
  return {
    enviar: async (admin, html, botones) => {
      const m = await api.sendMessage(admin, html, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup: teclado(botones),
      })
      return { message_id: m.message_id }
    },
    editar: async (admin, messageId, html, botones) => {
      await api.editMessageText(admin, messageId, html, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup: teclado(botones),
      })
    },
    mensaje: async (chatId, texto) => {
      const m = await api.sendMessage(chatId, texto)
      return { message_id: m.message_id }
    },
  }
}
