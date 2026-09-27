import type { Bot } from 'grammy'
import type { Db } from '../db/client.ts'
import type { Moderacion } from '../db/migraciones.ts'
import {
  autorDeQueja,
  decidirModeracion,
  getQuejaPublica,
  type AccionModeracion,
} from '../db/queries.ts'
import { actualizarTarjetas, type EnvioAdmin } from '../services/avisos-admin.ts'
import type { Channel } from '../services/channel.ts'
import { pedirRepublicacion } from '../services/republicar.ts'
import { routeUsingLocalOfficials } from '../services/router.ts'
import { avisoAlAutor } from '../services/textos-revision.ts'
import type { MyContext } from '../types.ts'
import { parseAdminIds } from '../util/admins.ts'
import { logger } from '../util/log.ts'

/**
 * Los botones de las tarjetas de revisión (services/avisos-admin.ts).
 *
 * Sólo decide un administrador (`ADMIN_USER_IDS`), y sólo en su chat privado
 * con el bot. La decisión es compare-and-set (`decidirModeracion`): dos que
 * pulsan a la vez, o una tarjeta vieja, no deciden dos veces, y el segundo oye
 * cómo está de verdad. Tras decidir se ponen al día todas las copias de la
 * tarjeta, se avisa a quien la escribió, y si cambió lo público se pide
 * republicar la web. El canal público anuncia la queja al PUBLICARLA, no al
 * recibirla: antes se anunciaba sin que nadie la hubiera leído.
 */
export const PATRON_MODERAR = /^mod:(pub|desc|ret):(Q-[0-9A-HJKMNP-TV-Z]{8})$/

const ACCION: Record<string, AccionModeracion> = {
  pub: 'publicar',
  desc: 'descartar',
  ret: 'retirar',
}

const HECHO: Record<Moderacion, string> = {
  pendiente: 'Pendiente.',
  retenida: 'Retenida.',
  publicada: 'Publicada.',
  descartada: 'Descartada: no se publica.',
  retirada: 'Retirada de la publicación.',
}

export function registerModerar(
  bot: Bot<MyContext>,
  db: Db,
  o: { envio: EnvioAdmin; channel: Channel },
) {
  bot.callbackQuery(PATRON_MODERAR, async (ctx) => {
    const [, clave, id] = ctx.match as RegExpMatchArray
    if (ctx.chat?.type !== 'private' || !parseAdminIds().includes(ctx.from.id)) {
      await ctx.answerCallbackQuery({
        text: 'Sólo un administrador puede decidir sobre una queja.',
      })
      return
    }
    const r = decidirModeracion(db, id, ACCION[clave], `admin:${ctx.from.id}`)
    switch (r.resultado) {
      case 'aplicada': {
        await ctx.answerCallbackQuery({ text: HECHO[r.hasta] })
        await actualizarTarjetas(db, id, { envio: o.envio })
        const autor = autorDeQueja(db, id)
        const aviso = avisoAlAutor(id, r.hasta)
        if (autor?.canal === 'telegram' && aviso) {
          try {
            await ctx.api.sendMessage(Number(autor.ref), aviso)
          } catch (err) {
            // Quien la escribió puede haber bloqueado el bot: la decisión vale igual.
            logger.warn('moderar.aviso-autor', { queja: id, err: String(err) })
          }
        }
        if (r.hasta === 'publicada' || r.hasta === 'retirada') await pedirRepublicacion()
        const q = r.hasta === 'publicada' ? getQuejaPublica(db, id) : null
        if (q) {
          const routing = routeUsingLocalOfficials({
            title: q.title,
            detail: q.detail,
            category: q.category as never,
          })
          await o.channel.postNuevaQueja(q, routing)
        }
        return
      }
      case 'ya-decidida':
        await ctx.answerCallbackQuery({ text: `Ya estaba decidida: ${HECHO[r.actual]}` })
        await actualizarTarjetas(db, id, { envio: o.envio })
        return
      case 'retirada-por-autor':
        await ctx.answerCallbackQuery({ text: 'Su autor la retiró con /olvidar: no se publica.' })
        await actualizarTarjetas(db, id, { envio: o.envio })
        return
      case 'no-existe':
        await ctx.answerCallbackQuery({ text: 'Esa queja ya no existe.' })
        return
    }
  })
}
