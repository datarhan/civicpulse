import type { Bot } from 'grammy'
import type { Db } from '../db/client.ts'
import {
  addApoyo,
  autorTelegram,
  esAutor,
  getQuejaPublica,
  VERIFIED_THRESHOLD,
} from '../db/queries.ts'
import type { AvisosHitos } from '../services/avisos-hitos.ts'
import type { MyContext } from '../types.ts'
import { idDeQueja } from '../services/queja-id.ts'

export function registerApoyar(bot: Bot<MyContext>, db: Db, hitos: AvisosHitos) {
  const handler = async (ctx: MyContext, raw: string | undefined) => {
    const id = idDeQueja(raw)
    if (!id) {
      await ctx.reply('Uso: `/apoyar Q-XXXX`', { parse_mode: 'Markdown' })
      return
    }
    // Sólo se apoya lo público: una queja sin publicar no la conoce nadie más.
    const q = getQuejaPublica(db, id)
    if (!q) {
      await ctx.reply(`No encuentro la queja \`${id}\`.`, { parse_mode: 'Markdown' })
      return
    }
    const autor = autorTelegram(ctx.from!.id)
    if (esAutor(db, id, autor)) {
      await ctx.reply(
        'No puedes apoyar tu propia queja — cuenta ya como 1 voz. Dile a vecinos que apoyen 🙌',
      )
      return
    }
    const { added, count } = addApoyo(db, id, autor)
    if (!added) {
      await ctx.reply(`Ya apoyabas \`${id}\`. Apoyos totales: *${count}*.`, {
        parse_mode: 'Markdown',
      })
      return
    }
    const remaining = Math.max(0, VERIFIED_THRESHOLD - count)
    const body =
      `👍 Gracias por apoyar \`${id}\`.\n\n` +
      `*${q.title}*\n\n` +
      `Apoyos: *${count}* / ${VERIFIED_THRESHOLD}\n` +
      (remaining === 0
        ? '🎯 *Verificada* — entra en el próximo lote semanal al Registro Electrónico.'
        : `Faltan *${remaining}* apoyos para que entre al lote oficial.`)
    await ctx.reply(body, { parse_mode: 'Markdown' })
    // Una vez, justo al cruzar el umbral: a quien modera, que la lleva al lote. El
    // apoyo ya está hecho y contestado: si el aviso no llega, queda en el log.
    if (count === VERIFIED_THRESHOLD) {
      await hitos
        .avisar('apoyada', q.id, { apoyos: count })
        .catch((err) => console.error(`[apoyar] el aviso de ${q.id} no llegó:`, err))
    }
  }

  bot.command('apoyar', async (ctx) => handler(ctx, ctx.match as string))
  bot.hears(/^\/apoyar[_\s]?([A-Za-z0-9]+)$/, async (ctx) => handler(ctx, ctx.match[1]))
}
