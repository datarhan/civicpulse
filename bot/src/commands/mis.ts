import type { Bot } from 'grammy'
import type { Db } from '../db/client.ts'
import { listUserQuejas } from '../db/queries.ts'
import type { MyContext } from '../types.ts'

export function registerMis(bot: Bot<MyContext>, db: Db) {
  bot.command('mis', async (ctx) => {
    const quejas = listUserQuejas(db, ctx.from!.id, 20)
    if (quejas.length === 0) {
      await ctx.reply('No tienes quejas registradas aún. Usa /queja para crear la primera.')
      return
    }
    const lines = quejas.map((q) => {
      const date = new Date(q.created_at).toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
      })
      const deletedMark = q.deleted_at ? ' · 🗑 *eliminada*' : ''
      return `\`${q.id}\` · ${date} · ${q.state}${deletedMark}\n  ${q.title.slice(0, 80)}`
    })
    await ctx.reply(
      `📋 *Tus quejas:*\n\n${lines.join('\n\n')}\n\n` +
        `_Para borrar una queja y ejercer tu derecho al olvido (RGPD): /olvidar Q-XXXX_`,
      { parse_mode: 'Markdown' },
    )
  })
}
