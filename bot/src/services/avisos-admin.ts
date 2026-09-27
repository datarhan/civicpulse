/**
 * Las tarjetas de revisión: cada queja nueva llega a cada administrador, por
 * Telegram, con [Publicar] y [Descartar]; una publicada, con [Retirar].
 *
 * Hasta el 2026-09-27 una queja salía en el acto —en la web y en el canal
 * público— sin que nadie la leyera. Ahora nace `pendiente` y no es pública
 * hasta que un administrador decide (commands/moderar.ts). La puerta falla
 * cerrada: si la tarjeta no llega a ningún administrador —el bot bloqueado,
 * Telegram caído—, la queja sigue sin publicar y la pasada horaria la reenvía.
 *
 * `avisos_admin` guarda qué mensaje recibió cada administrador, y sólo de los
 * que llegaron: así se cambian TODAS las copias al decidir, y así se sabe qué
 * queja no ha visto nadie. No se pausa con el bloqueo LOREG: decidir es de una
 * persona, y la pausa es para lo automático.
 */
import type { Api } from 'grammy'
import type { Db } from '../db/client.ts'
import type { Moderacion } from '../db/migraciones.ts'
import { getQuejaViva, type QuejaRow } from '../db/queries.ts'
import { escaparHtml } from '../util/html.ts'
import { logger } from '../util/log.ts'
import { cortar, MAX_MENSAJE } from '../util/telegram.ts'

export interface Boton {
  texto: string
  data: string
}

/** Mandar y cambiar mensajes en el chat privado de un administrador. Si Telegram rechaza, lanza. */
export interface EnvioAdmin {
  enviar(adminId: number, html: string, botones: Boton[]): Promise<{ message_id: number }>
  editar(adminId: number, messageId: number, html: string, botones: Boton[]): Promise<void>
}

/** El `tipo` de la tarjeta de revisión en `avisos_admin`. */
export const TIPO_TARJETA = 'tarjeta'

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
  return []
}

/**
 * La tarjeta de una queja, en el HTML de Telegram. El texto es del vecino: pasa
 * por `escaparHtml`, y se corta DESPUÉS de escapar (un `&` escapado mide cinco),
 * para que la tarjeta quepa siempre en un mensaje.
 */
export function tarjetaDeQueja(q: QuejaRow, nota?: string): { html: string; botones: Boton[] } {
  const cabecera = [
    `<b>${CABECERA[q.moderacion]}</b> · <code>${q.id}</code>`,
    escaparHtml([q.category, q.neighborhood].filter(Boolean).join(' · ')),
    '',
    `<b>${cortar(escaparHtml(q.title), 600)}</b>`,
  ].join('\n')
  const pie = nota ? `\n\n<i>${escaparHtml(nota)}</i>` : ''
  const cabe = MAX_MENSAJE - cabecera.length - pie.length - 2
  const detalle = cortar(escaparHtml(q.detail), Math.max(0, cabe))
  return { html: `${cabecera}\n\n${detalle}${pie}`, botones: botonesDe(q) }
}

/**
 * Manda la tarjeta de una queja a cada administrador que no la tenga ya, y
 * anota las que llegaron. Una que falla se cuenta y se deja para la pasada
 * siguiente.
 */
export async function avisarAdmins(
  db: Db,
  q: QuejaRow,
  o: { admins: number[]; envio: EnvioAdmin },
): Promise<{ entregadas: number; fallidas: number }> {
  const { html, botones } = tarjetaDeQueja(q)
  const yaLaTiene = db.prepare(
    'SELECT 1 FROM avisos_admin WHERE queja_id = ? AND tipo = ? AND admin_id = ?',
  )
  const anota = db.prepare(
    'INSERT OR IGNORE INTO avisos_admin (queja_id, tipo, admin_id, message_id) VALUES (?, ?, ?, ?)',
  )
  let entregadas = 0
  let fallidas = 0
  for (const admin of o.admins) {
    if (yaLaTiene.get(q.id, TIPO_TARJETA, admin)) continue
    try {
      const m = await o.envio.enviar(admin, html, botones)
      anota.run(q.id, TIPO_TARJETA, admin, m.message_id)
      entregadas += 1
    } catch (err) {
      fallidas += 1
      logger.warn('avisos-admin.tarjeta', { queja: q.id, admin, err: String(err) })
    }
  }
  return { entregadas, fallidas }
}

/**
 * La tarjeta de una queja que ya no está viva —su autor la retiró con /olvidar,
 * o ya no existe—: sin su texto, que así deja de estar también en los chats de
 * los administradores, y sin botones.
 */
export function tarjetaSinQueja(id: string): { html: string; botones: Boton[] } {
  return {
    html: `<b>🚮 Retirada por su autor</b> · <code>${id}</code>\n\n<i>Su texto ya no se enseña aquí.</i>`,
    botones: [],
  }
}

/**
 * Pone al día todas las copias de la tarjeta de una queja tras una decisión. Un
 * fallo al editar una copia no deshace nada: se registra y se sigue con las demás.
 */
export async function actualizarTarjetas(
  db: Db,
  id: string,
  o: { envio: EnvioAdmin; nota?: string },
): Promise<{ editadas: number; fallidas: number }> {
  const q = getQuejaViva(db, id)
  const { html, botones } = q ? tarjetaDeQueja(q, o.nota) : tarjetaSinQueja(id)
  const copias = db
    .prepare('SELECT admin_id, message_id FROM avisos_admin WHERE queja_id = ? AND tipo = ?')
    .all(id, TIPO_TARJETA) as Array<{ admin_id: number; message_id: number }>
  let editadas = 0
  let fallidas = 0
  for (const c of copias) {
    try {
      await o.envio.editar(c.admin_id, c.message_id, html, botones)
      editadas += 1
    } catch (err) {
      fallidas += 1
      logger.warn('avisos-admin.editar', { queja: id, admin: c.admin_id, err: String(err) })
    }
  }
  return { editadas, fallidas }
}

/**
 * Las quejas pendientes de revisión cuya tarjeta no ha llegado a NINGÚN
 * administrador, otra vez. Cuenta las quejas que intenta y las tarjetas que
 * entrega y que fallan, por separado.
 */
export async function reenviarTarjetasPendientes(
  db: Db,
  o: { admins: number[]; envio: EnvioAdmin },
): Promise<{ quejas: number; entregadas: number; fallidas: number }> {
  const sinTarjeta = db
    .prepare(
      `SELECT * FROM quejas q
        WHERE q.moderacion IN ('pendiente', 'retenida') AND q.deleted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM avisos_admin a WHERE a.queja_id = q.id AND a.tipo = ?)
        ORDER BY q.rowid`,
    )
    .all(TIPO_TARJETA) as QuejaRow[]
  const r = { quejas: sinTarjeta.length, entregadas: 0, fallidas: 0 }
  if (o.admins.length === 0) return r
  for (const q of sinTarjeta) {
    const e = await avisarAdmins(db, q, o)
    r.entregadas += e.entregadas
    r.fallidas += e.fallidas
  }
  return r
}

const HORA_MS = 60 * 60 * 1000

/** Al arrancar y cada hora: lo que no llegó a nadie, otra vez. */
export function startReenvioTarjetas(o: {
  db: Db
  admins: () => number[]
  envio: EnvioAdmin
}): () => void {
  const tick = async () => {
    try {
      const r = await reenviarTarjetasPendientes(o.db, { admins: o.admins(), envio: o.envio })
      if (r.quejas > 0) logger.info('avisos-admin.reenvio', r)
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
  }
}
