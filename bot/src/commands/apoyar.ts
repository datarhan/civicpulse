import type { Bot } from 'grammy'
import type { Db } from '../db/client.ts'
import { addApoyo, getQueja, VERIFIED_THRESHOLD } from '../db/queries.ts'
import type { Channel } from '../services/channel.ts'
import type { MyContext } from '../types.ts'

function parseQuejaId(raw: string | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim().toUpperCase().replace(/^\/APOYAR[_\s]?/, '').replace(/^Q[-_]?/, '')
  if (!/^[0-9A-Z]{4,}$/.test(trimmed)) return null
  return 'Q-' + trimmed
}

export function registerApoyar(bot: Bot<MyContext>, db: Db, channel: Channel) {
  const handler = async (ctx: MyContext, raw: string | undefined) => {
    const id = parseQuejaId(raw)
    if (!id) {
      await ctx.reply('Uso: `/apoyar Q-XXXX`', { parse_mode: 'Markdown' })
      return
    }
    const q = getQueja(db, id)
    if (!q) {
      await ctx.reply(`No encuentro la queja \`${id}\`.`, { parse_mode: 'Markdown' })
      return
    }
    if (q.telegram_user_id === ctx.from!.id) {
      await ctx.reply(
        'No puedes apoyar tu propia queja — cuenta ya como 1 voz. Dile a vecinos que apoyen 🙌'
      )
      return
    }
    const { added, count } = addApoyo(db, id, ctx.from!.id)
    if (!added) {
      await ctx.reply(`Ya apoyabas \`${id}\`. Apoyos totales: *${count}*.`, { parse_mode: 'Markdown' })
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
    // Broadcast once, exactly when we cross the threshold.
    if (count === VERIFIED_THRESHOLD) {
      await channel.postApoyoMilestone(q, count)
    }
  }

  bot.command('apoyar', async (ctx) => handler(ctx, ctx.match as string))
  bot.hears(/^\/apoyar[_\s]?([A-Za-z0-9]+)$/, async (ctx) => handler(ctx, ctx.match[1]))
}
