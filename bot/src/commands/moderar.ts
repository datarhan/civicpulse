import type { Bot } from 'grammy'
import type { Db } from '../db/client.ts'
import type { Moderacion } from '../db/migraciones.ts'
import { decidirModeracion, getQuejaViva, type AccionModeracion } from '../db/queries.ts'
import {
  completarSeguimiento,
  enviarTarjetaA,
  listarPendientes,
  type EnvioAdmin,
} from '../services/avisos-admin.ts'
import { ID_QUEJA, idDeQueja } from '../services/queja-id.ts'
import { pedirRepublicacion, type PeticionRepublicar } from '../services/republicar.ts'
import type { MyContext } from '../types.ts'
import { parseAdminIds } from '../util/admins.ts'
import { logger } from '../util/log.ts'
import { trocear } from '../util/telegram.ts'

/**
 * Los botones de las tarjetas de revisión (services/avisos-admin.ts), y las dos
 * órdenes de quien modera: `/revisar Q-…`, que manda la tarjeta de cualquier
 * queja viva —también de una publicada antes de la revisión, para poder
 * retirarla—, y `/pendientes`, la cola con lo que lleva cada una esperando.
 *
 * Sólo un administrador (`ADMIN_USER_IDS`), y sólo en su chat privado. La
 * decisión es compare-and-set (`decidirModeracion`): dos que pulsan a la vez, o
 * una tarjeta vieja, no deciden dos veces, y el segundo oye cómo está de
 * verdad. Lo que sigue a una decisión —las tarjetas al día, el aviso a su autor—
 * se hace de forma que se pueda repetir (`completarSeguimiento`): contestar al
 * botón puede fallar —un toque tardío, la red—, y eso no puede llevarse por
 * delante lo demás. Si cambia lo público, se pide republicar la web.
 *
 * El canal público de Telegram no anuncia la queja, ni al recibirla ni al
 * publicarla: un anuncio no se retiraba con la queja, y el plan lo retira.
 */
export const PATRON_MODERAR = new RegExp(`^mod:(pub|desc|ret):(${ID_QUEJA.source.slice(1, -1)})$`)

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

const SOLO_ADMIN = 'Sólo un administrador puede decidir sobre una queja.'

/** Líneas de `/pendientes` por bloque: `trocear` separa los bloques con una línea en blanco. */
const LINEAS_POR_BLOQUE = 20

/** Lo que se le dice a quien decide cuando la web no se vuelve a publicar sola. */
const SIN_REPUBLICAR: Record<Exclude<PeticionRepublicar, 'pedida'>, string> = {
  'sin-token':
    '⚠️ La web no se vuelve a publicar sola (falta GITHUB_DISPATCH_TOKEN): el cambio sale en su actualización diaria, o antes si alguien lanza pull-quejas.yml.',
  fallo:
    '⚠️ No he podido pedir que la web se vuelva a publicar: el cambio sale en su actualización diaria, o antes si alguien lanza pull-quejas.yml.',
}

const esAdmin = (ctx: MyContext) =>
  ctx.chat?.type === 'private' && !!ctx.from && parseAdminIds().includes(ctx.from.id)

/** Contestar al botón es sólo la señal en la pantalla de quien pulsa: si falla, se sigue. */
async function responder(ctx: MyContext, texto: string): Promise<void> {
  try {
    await ctx.answerCallbackQuery({ text: texto })
  } catch (err) {
    logger.warn('moderar.respuesta', { err: String(err) })
  }
}

export function registerModerar(bot: Bot<MyContext>, db: Db, o: { envio: EnvioAdmin }) {
  bot.callbackQuery(PATRON_MODERAR, async (ctx) => {
    const [, clave, id] = ctx.match as RegExpMatchArray
    if (!esAdmin(ctx)) {
      await responder(ctx, SOLO_ADMIN)
      return
    }
    const r = decidirModeracion(db, id, ACCION[clave], `admin:${ctx.from.id}`)
    switch (r.resultado) {
      case 'aplicada':
        await responder(ctx, HECHO[r.hasta])
        break
      case 'ya-decidida':
        await responder(ctx, `Ya estaba decidida: ${HECHO[r.actual]}`)
        break
      case 'retirada-por-autor':
        await responder(ctx, 'Su autor la retiró con /olvidar: no se publica.')
        break
      case 'no-existe':
        await responder(ctx, 'Esa queja ya no existe.')
        return
    }
    await completarSeguimiento(db, id, { envio: o.envio })
    // Publicar o retirar cambia lo que exporta el bot. Descartar una que no era
    // pública, no. Si la petición no sale, quien decide lo sabe: una retirada
    // seguiría en la web hasta su actualización diaria.
    if (r.resultado === 'aplicada' && (r.hasta === 'publicada' || r.hasta === 'retirada')) {
      const peticion = await pedirRepublicacion()
      if (peticion !== 'pedida') {
        try {
          await ctx.reply(SIN_REPUBLICAR[peticion])
        } catch (err) {
          logger.warn('moderar.republicar', { err: String(err) })
        }
      }
    }
  })

  bot.command('revisar', async (ctx) => {
    if (!esAdmin(ctx)) {
      await ctx.reply(SOLO_ADMIN)
      return
    }
    const id = idDeQueja(ctx.match as string)
    const q = id ? getQuejaViva(db, id) : null
    if (!q) {
      await ctx.reply(
        `No encuentro la queja ${id ?? ''} (o su autor la retiró).`.replace('  ', ' '),
      )
      return
    }
    const hecho = await enviarTarjetaA(db, q, ctx.from!.id, o.envio)
    if (hecho === 'retirada') {
      await ctx.reply(`Su autor acaba de retirar la queja ${q.id}: no te mando su tarjeta.`)
    } else if (hecho !== 'entregada') {
      await ctx.reply('No he podido mandarte la tarjeta; prueba otra vez.')
    }
  })

  bot.command('pendientes', async (ctx) => {
    if (!esAdmin(ctx)) {
      await ctx.reply(SOLO_ADMIN)
      return
    }
    const cola = listarPendientes(db)
    if (cola.length === 0) {
      await ctx.reply('No hay ninguna queja esperando revisión.')
      return
    }
    const edad = (h: number) =>
      h < 1 ? 'menos de 1 h' : h < 48 ? `${h} h` : `${Math.floor(h / 24)} d`
    // Sin el título: este mensaje no se vacía si su autor retira la queja. Y en
    // trozos que caben, que una cola larga es justo cuando más falta hace.
    const lineas = cola.map(
      (p) => `• ${p.id} · ${edad(p.horas)}${p.moderacion === 'retenida' ? ' · retenida' : ''}`,
    )
    const bloques = []
    for (let i = 0; i < lineas.length; i += LINEAS_POR_BLOQUE) {
      bloques.push({ texto: lineas.slice(i, i + LINEAS_POR_BLOQUE).join('\n'), id: i })
    }
    bloques.push({ texto: 'La tarjeta de cada una: /revisar Q-…', id: -1 })
    for (const t of trocear(`Esperan revisión ${cola.length}:`, bloques)) await ctx.reply(t.texto)
  })
}
