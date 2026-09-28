/**
 * Cada update se atiende una vez; los de un mismo chat, de uno en uno; y ninguno
 * tumba el proceso.
 *
 * El webhook de grammy (services/webhook-telegram.ts) contesta 500 a un update que
 * pasa de diez segundos, y lo deja seguir corriendo. Telegram lo da por perdido: lo
 * vuelve a mandar, y sigue con los siguientes del chat, con el primero todavía a
 * medias. Tarda así una queja cuya tarjeta a los administradores o cuyo recibo se
 * atasca en la API de Telegram, o una decisión que espera el candado de su queja
 * (services/avisos-admin.ts).
 *
 * Las conversaciones no lo aguantan: guardan su estado en memoria, lo leen al
 * empezar, lo cambian en el sitio y lo escriben al acabar, sin candado. Medido el
 * 2026-09-28 (bot/tests/una-vez-y-en-orden.test.ts): el último paso de /queja,
 * repetido con el primero a medias, creó dos quejas con sus tarjetas y colgó las dos
 * entregas sin recibo, y desde ahí cada update de la vecina creaba otra queja y se
 * colgaba, hasta reiniciar. Repetido con el primero ya acabado, un título se
 * guardaba como el detalle.
 *
 * Así que, antes que nada:
 *
 * - Un `update_id` ya visto no se atiende, y se contesta en el acto, para que
 *   Telegram deje de mandarlo. Se recuerda un día: lo más que Telegram guarda un
 *   update sin entregar.
 * - Los de un mismo chat —la clave con que las conversaciones y la sesión guardan su
 *   estado— se atienden de uno en uno, en el orden en que llegan. Los de chats
 *   distintos, a la vez.
 * - Uno que falla queda en el log y no rechaza. El rechazo sólo servía para que
 *   Telegram lo repitiera, y la repetición ya no se atiende; y pasado el plazo del
 *   webhook, grammy encadena a la entrega un `finally` que nadie recoge, así que un
 *   rechazo tumbaba el proceso con todas las conversaciones en curso.
 *
 * En memoria y no en la base, como el candado de las tarjetas: el bot corre en un
 * solo proceso, en una máquina de Fly. Las conversaciones también viven en memoria,
 * así que tras un reinicio la repetición de un paso no encuentra ninguna que rehacer;
 * y si el reinicio cortó un update a medias, su repetición sí se atiende, que es lo
 * que conviene y lo que una tabla impediría.
 *
 * Lo que se pierde es la repetición de un update que falló. Una conversación que
 * falla ya se daba por terminada, y decidir, /olvidar o /apoyar contestan la segunda
 * vez que ya está hecho: repetirlos no arreglaba nada. Quien no recibe respuesta
 * vuelve a escribir, y eso es otro update.
 */
import type { Context, MiddlewareFn } from 'grammy'
import { logger } from '../util/log.ts'

/** Lo más que Telegram guarda un update sin entregar: pasado esto no lo repite. */
export const RECUERDA_MS = 24 * 60 * 60 * 1000

export function unaVezYEnOrden<C extends Context>(): MiddlewareFn<C> {
  /** `update_id` → cuándo llegó, en el orden en que llegaron. */
  const vistos = new Map<number, number>()
  /** Chat → cuándo acaba el último de sus updates que se atiende o espera turno. */
  const colas = new Map<string, Promise<void>>()

  return async (ctx, next) => {
    const id = ctx.update.update_id
    const ahora = Date.now()
    for (const [visto, cuando] of vistos) {
      if (ahora - cuando <= RECUERDA_MS) break
      vistos.delete(visto)
    }
    if (vistos.has(id)) {
      logger.warn('telegram.repetido', { update_id: id })
      return
    }
    vistos.set(id, ahora)

    const chat = ctx.chatId === undefined ? undefined : String(ctx.chatId)
    const anterior = chat === undefined ? undefined : colas.get(chat)
    let acabar!: () => void
    const acabado = new Promise<void>((r) => (acabar = r))
    if (chat !== undefined) colas.set(chat, acabado)
    try {
      await anterior
      await next()
    } catch (err) {
      logger.error('telegram.update', {
        update_id: id,
        err: String(err),
        stack: err instanceof Error ? err.stack : undefined,
      })
    } finally {
      acabar()
      if (chat !== undefined && colas.get(chat) === acabado) colas.delete(chat)
    }
  }
}
