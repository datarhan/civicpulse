import type { Bot } from 'grammy'
import type { Db } from '../db/client.ts'
import {
  ALLOWED_FILTER_KINDS,
  addSubscription,
  listUserSubscriptions,
  removeSubscription,
  type FilterKind,
} from '../db/queries.ts'
import type { MyContext } from '../types.ts'

/**
 * /subscribe <kind> <value>   — subscribe to weekly digest
 * /unsubscribe <kind> <value> — cancel a subscription
 * /subscriptions             — list my active subscriptions
 *
 * Kinds: barrio | concejalia | categoria
 *
 * Every Monday at 09:00 local (Europe/Madrid), the digest cron emits a DM
 * to every subscribed user with matching quejas captured during the past
 * 7 days. Only non-deleted quejas (LOPD art. 17 respected). Skipped during
 * LOREG freeze.
 */
export function registerSubscribe(bot: Bot<MyContext>, db: Db) {
  bot.command('subscribe', async (ctx) => {
    const args = (ctx.match as string | undefined)?.trim().split(/\s+/) ?? []
    const kind = (args[0] ?? '').toLowerCase() as FilterKind
    const value = args.slice(1).join(' ').trim()
    if (!ALLOWED_FILTER_KINDS.includes(kind) || !value) {
      await ctx.reply(
        '*Cómo suscribirse*\n\n' +
          'Usa uno de estos formatos:\n' +
          '```\n' +
          '/subscribe barrio La Reva\n' +
          '/subscribe concejalia Urbanismo\n' +
          '/subscribe categoria residuos\n' +
          '```\n' +
          'Cada lunes a las 09:00 recibirás un resumen de las nuevas quejas que encajen.',
        { parse_mode: 'Markdown' },
      )
      return
    }
    const r = addSubscription(db, ctx.from!.id, kind, value)
    if (!r.added) {
      await ctx.reply(
        `Ya tenías esa suscripción activa (\`${kind}: ${value}\`). Usa /subscriptions para ver todas.`,
        { parse_mode: 'Markdown' },
      )
      return
    }
    await ctx.reply(
      `✅ Suscripción registrada: *${kind}* = _${value}_\n\n` +
        `Recibirás un resumen cada lunes con las quejas nuevas de los últimos 7 días que encajen. ` +
        `Puedes cancelar cuando quieras con \`/unsubscribe ${kind} ${value}\`.`,
      { parse_mode: 'Markdown' },
    )
  })

  bot.command('unsubscribe', async (ctx) => {
    const args = (ctx.match as string | undefined)?.trim().split(/\s+/) ?? []
    const kind = (args[0] ?? '').toLowerCase() as FilterKind
    const value = args.slice(1).join(' ').trim()
    if (!ALLOWED_FILTER_KINDS.includes(kind) || !value) {
      await ctx.reply('Usa: /unsubscribe barrio|concejalia|categoria <valor>')
      return
    }
    const r = removeSubscription(db, ctx.from!.id, kind, value)
    if (!r.removed) {
      await ctx.reply(
        `No tenías esa suscripción activa. /subscriptions para ver las que sí tienes.`,
      )
      return
    }
    await ctx.reply(`🗑 Suscripción cancelada: *${kind}* = _${value}_`, { parse_mode: 'Markdown' })
  })

  bot.command('subscriptions', async (ctx) => {
    const subs = listUserSubscriptions(db, ctx.from!.id)
    if (subs.length === 0) {
      await ctx.reply(
        'No tienes suscripciones activas.\n\n' +
          'Prueba: `/subscribe barrio La Reva` o `/subscribe concejalia Urbanismo`',
        { parse_mode: 'Markdown' },
      )
      return
    }
    const lines = subs.map((s) => `• *${s.filter_kind}* = _${s.filter_value}_`)
    await ctx.reply(
      `📬 *Tus suscripciones:*\n\n${lines.join('\n')}\n\n` +
        `_Para cancelar una: /unsubscribe <kind> <valor>_`,
      { parse_mode: 'Markdown' },
    )
  })
}
