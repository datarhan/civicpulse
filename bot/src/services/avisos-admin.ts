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
 * `avisos` guarda lo que el bot ha mandado de cada queja y a quién: la tarjeta
 * de cada administrador (`admin:<id>`), para cambiarlas todas al decidir, y el
 * aviso de cada decisión a su autor, para no repetirlo. Un envío se RECLAMA
 * antes de mandarlo —una fila sin resultado—, así que dos pasadas a la vez no
 * mandan dos; un reclamo que se quedó a medias caduca a los diez minutos.
 *
 * No se pausa con el bloqueo LOREG: decidir es de una persona, y la pausa es
 * para lo automático.
 */
import type { Api } from 'grammy'
import type { Db } from '../db/client.ts'
import type { Moderacion } from '../db/migraciones.ts'
import { autorDeQueja, getQuejaViva, type QuejaRow } from '../db/queries.ts'
import { avisoAlAutor } from './textos-revision.ts'
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
  mensaje(chatId: number, texto: string): Promise<{ message_id: number } | void>
}

/** El `tipo` de la tarjeta de revisión en `avisos`. */
export const TIPO_TARJETA = 'tarjeta'

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
  motivo: 'retirada' | 'destruida' = 'retirada',
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

function anotar(
  db: Db,
  quejaId: string,
  tipo: string,
  destinatario: string,
  resultado: 'entregado' | 'rechazado',
  messageId: number | null,
): void {
  db.prepare(
    'UPDATE avisos SET resultado = ?, message_id = ? WHERE queja_id = ? AND tipo = ? AND destinatario = ?',
  ).run(resultado, messageId, quejaId, tipo, destinatario)
}

function soltar(db: Db, quejaId: string, tipo: string, destinatario: string): void {
  db.prepare('DELETE FROM avisos WHERE queja_id = ? AND tipo = ? AND destinatario = ?').run(
    quejaId,
    tipo,
    destinatario,
  )
}

/**
 * Manda la tarjeta de una queja a cada administrador que no la tenga ya, y
 * anota las que llegaron. Una que falla se suelta para la pasada siguiente.
 */
export async function avisarAdmins(
  db: Db,
  q: QuejaRow,
  o: { admins: number[]; envio: EnvioAdmin },
): Promise<{ entregadas: number; fallidas: number }> {
  const { html, botones } = tarjetaDeQueja(q)
  let entregadas = 0
  let fallidas = 0
  for (const admin of o.admins) {
    const destinatario = comoAdmin(admin)
    if (!reclamar(db, q.id, TIPO_TARJETA, destinatario)) continue
    try {
      const m = await o.envio.enviar(admin, html, botones)
      anotar(db, q.id, TIPO_TARJETA, destinatario, 'entregado', m.message_id)
      entregadas += 1
    } catch (err) {
      soltar(db, q.id, TIPO_TARJETA, destinatario)
      fallidas += 1
      logger.warn('avisos-admin.tarjeta', { queja: q.id, admin, err: String(err) })
    }
  }
  return { entregadas, fallidas }
}

/**
 * La tarjeta de una queja viva a UN administrador, aunque ya la tuviera: la de
 * `/revisar`. La anterior se deja de seguir; sus botones siguen valiendo, porque
 * decidir es compare-and-set.
 */
export async function enviarTarjetaA(
  db: Db,
  q: QuejaRow,
  admin: number,
  envio: EnvioAdmin,
): Promise<boolean> {
  soltar(db, q.id, TIPO_TARJETA, comoAdmin(admin))
  return (await avisarAdmins(db, q, { admins: [admin], envio })).entregadas === 1
}

/**
 * Pone al día todas las copias de la tarjeta de una queja. Un fallo al editar
 * una copia no deshace nada: se registra y se sigue con las demás.
 */
export async function actualizarTarjetas(
  db: Db,
  id: string,
  o: { envio: EnvioAdmin; nota?: string; motivo?: 'retirada' | 'destruida' },
): Promise<{ editadas: number; fallidas: number }> {
  const q = getQuejaViva(db, id)
  const { html, botones } = q ? tarjetaDeQueja(q, o.nota) : tarjetaSinQueja(id, o.motivo)
  const copias = db
    .prepare(
      `SELECT destinatario, message_id FROM avisos
        WHERE queja_id = ? AND tipo = ? AND message_id IS NOT NULL`,
    )
    .all(id, TIPO_TARJETA) as Array<{ destinatario: string; message_id: number }>
  return editar(copias, html, botones, o.envio, id)
}

async function editar(
  copias: Array<{ destinatario: string; message_id: number }>,
  html: string,
  botones: Boton[],
  envio: EnvioAdmin,
  id: string,
): Promise<{ editadas: number; fallidas: number }> {
  let editadas = 0
  let fallidas = 0
  for (const c of copias) {
    try {
      await envio.editar(idDeAdmin(c.destinatario), c.message_id, html, botones)
      editadas += 1
    } catch (err) {
      fallidas += 1
      logger.warn('avisos-admin.editar', { queja: id, err: String(err) })
    }
  }
  return { editadas, fallidas }
}

/** Una tarjeta en el chat de un administrador, como la devuelve la purga del plazo de conservación. */
export interface TarjetaEnviada {
  queja_id: string
  admin: number
  message_id: number
}

/** Las tarjetas entregadas de unas quejas: la purga las recoge ANTES de borrar sus filas. */
export function tarjetasDe(db: Db, ids: string[]): TarjetaEnviada[] {
  if (ids.length === 0) return []
  const filas = db
    .prepare(
      `SELECT queja_id, destinatario, message_id FROM avisos
        WHERE tipo = ? AND message_id IS NOT NULL AND queja_id IN (${ids.map(() => '?').join(', ')})
        ORDER BY queja_id, destinatario`,
    )
    .all(TIPO_TARJETA, ...ids) as Array<{
    queja_id: string
    destinatario: string
    message_id: number
  }>
  return filas.map((f) => ({
    queja_id: f.queja_id,
    admin: idDeAdmin(f.destinatario),
    message_id: f.message_id,
  }))
}

/** Quita el texto de las tarjetas de unas quejas ya destruidas por el plazo de conservación. */
export async function vaciarTarjetas(
  tarjetas: TarjetaEnviada[],
  envio: EnvioAdmin,
): Promise<number> {
  let vaciadas = 0
  for (const t of tarjetas) {
    const { html, botones } = tarjetaSinQueja(t.queja_id, 'destruida')
    const r = await editar(
      [{ destinatario: comoAdmin(t.admin), message_id: t.message_id }],
      html,
      botones,
      envio,
      t.queja_id,
    )
    vaciadas += r.editadas
  }
  return vaciadas
}

function tieneTarjetaActual(db: Db, quejaId: string, admins: number[]): boolean {
  if (admins.length === 0) return false
  return (
    db
      .prepare(
        `SELECT 1 FROM avisos
          WHERE queja_id = ? AND tipo = ? AND message_id IS NOT NULL
            AND destinatario IN (${admins.map(() => '?').join(', ')})`,
      )
      .get(quejaId, TIPO_TARJETA, ...admins.map(comoAdmin)) !== undefined
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
): Promise<{ quejas: number; entregadas: number; fallidas: number }> {
  const enRevision = db
    .prepare(
      `SELECT * FROM quejas
        WHERE moderacion IN ('pendiente', 'retenida') AND deleted_at IS NULL
        ORDER BY rowid`,
    )
    .all() as QuejaRow[]
  const sinTarjeta = enRevision.filter((q) => !tieneTarjetaActual(db, q.id, o.admins))
  const r = { quejas: sinTarjeta.length, entregadas: 0, fallidas: 0 }
  if (o.admins.length === 0) return r
  for (const q of sinTarjeta) {
    const e = await avisarAdmins(db, q, o)
    r.entregadas += e.entregadas
    r.fallidas += e.fallidas
  }
  return r
}

/** La cola de revisión, para `/health`. */
export interface EstadoModeracion {
  pendientes: number
  /** Las que ningún administrador actual tiene en una tarjeta entregada. */
  sinTarjeta: number
  /** Horas que lleva esperando la más antigua, o null si no espera ninguna. */
  masAntiguaHoras: number | null
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
  return {
    pendientes: enRevision.length,
    sinTarjeta: enRevision.filter((q) => !tieneTarjetaActual(db, q.id, admins)).length,
    masAntiguaHoras: enRevision.length ? horasDesde(enRevision[0].created_at, ahora) : null,
  }
}

/** La cola de revisión, para `/pendientes`: de la más antigua a la más nueva. */
export function listarPendientes(
  db: Db,
  ahora = new Date(),
): Array<{ id: string; moderacion: Moderacion; titulo: string; horas: number }> {
  const filas = db
    .prepare(
      `SELECT id, moderacion, title, created_at FROM quejas
        WHERE moderacion IN ('pendiente', 'retenida') AND deleted_at IS NULL
        ORDER BY created_at`,
    )
    .all() as Array<{ id: string; moderacion: Moderacion; title: string; created_at: string }>
  return filas.map((f) => ({
    id: f.id,
    moderacion: f.moderacion,
    titulo: f.title,
    horas: horasDesde(f.created_at, ahora),
  }))
}

/**
 * Lo que sigue a una decisión, hecho de forma que se pueda repetir: las
 * tarjetas al día y el aviso de la última decisión a su autor, una sola vez
 * (`autor:<id de la decisión>`). Si contestar al botón falla, o el proceso cae a
 * mitad, un segundo toque o la pasada horaria lo terminan sin repetir nada. Un
 * aviso que Telegram rechaza para siempre —el autor bloqueó el bot— se anota
 * como rechazado y no se reintenta.
 */
export async function completarSeguimiento(
  db: Db,
  id: string,
  o: { envio: EnvioAdmin },
): Promise<void> {
  await actualizarTarjetas(db, id, { envio: o.envio })
  const decision = db
    .prepare(
      `SELECT id, decision FROM moderaciones
        WHERE queja_id = ? AND decision != 'heredada' ORDER BY id DESC LIMIT 1`,
    )
    .get(id) as { id: number; decision: Moderacion } | undefined
  const q = getQuejaViva(db, id)
  // Sin decisión, o decidida otra vez desde entonces, o retirada por su autor.
  if (!decision || !q || q.moderacion !== decision.decision) return
  const autor = autorDeQueja(db, id)
  const texto = avisoAlAutor(id, decision.decision)
  if (!autor || autor.canal !== 'telegram' || !texto) return
  const tipo = `autor:${decision.id}`
  const destinatario = `${autor.canal}:${autor.ref}`
  if (!reclamar(db, id, tipo, destinatario)) return
  try {
    const m = await o.envio.mensaje(Number(autor.ref), texto)
    anotar(db, id, tipo, destinatario, 'entregado', m?.message_id ?? null)
  } catch (err) {
    if (/\b403\b/.test(String(err))) anotar(db, id, tipo, destinatario, 'rechazado', null)
    else soltar(db, id, tipo, destinatario)
    logger.warn('avisos-admin.aviso-autor', { queja: id, err: String(err) })
  }
}

/** Las decisiones cuyo aviso a su autor no consta, para la pasada horaria. */
export async function completarSeguimientosPendientes(
  db: Db,
  o: { envio: EnvioAdmin },
): Promise<number> {
  const ultimas = db
    .prepare(
      `SELECT m.id, m.queja_id FROM moderaciones m
        WHERE m.decision != 'heredada'
          AND m.id = (SELECT MAX(id) FROM moderaciones WHERE queja_id = m.queja_id)
          AND NOT EXISTS (SELECT 1 FROM avisos a WHERE a.queja_id = m.queja_id AND a.tipo = 'autor:' || m.id)`,
    )
    .all() as Array<{ id: number; queja_id: string }>
  for (const u of ultimas) await completarSeguimiento(db, u.queja_id, o)
  return ultimas.length
}

const HORA_MS = 60 * 60 * 1000

/** Al arrancar y cada hora: las tarjetas que ningún administrador actual tiene, y los avisos que faltan. */
export function startReenvioTarjetas(o: {
  db: Db
  admins: () => number[]
  envio: EnvioAdmin
}): () => void {
  const tick = async () => {
    try {
      const r = await reenviarTarjetasPendientes(o.db, { admins: o.admins(), envio: o.envio })
      if (r.quejas > 0) logger.info('avisos-admin.reenvio', r)
      const avisos = await completarSeguimientosPendientes(o.db, { envio: o.envio })
      if (avisos > 0) logger.info('avisos-admin.seguimiento', { decisiones: avisos })
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
