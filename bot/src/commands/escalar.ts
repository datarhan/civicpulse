/**
 * /escalar Q-XXXX — admin command that escalates a silencio-negativo
 * queja to the Síndic de Greuges de la Comunitat Valenciana:
 *   1. Transitions state to 'escalada_sindic'
 *   2. Broadcasts [ESCALADA] to the public channel
 *   3. Returns the URLs of the auto-generated template (md + html)
 *      so the reclamante can submit at https://www.elsindic.com
 *
 * Admin-gated via ADMIN_USER_IDS (same as /batch).
 */

import type { Bot } from 'grammy'
import type { Db } from '../db/client.ts'
import type { Channel } from '../services/channel.ts'
import type { MyContext } from '../types.ts'
import { getQueja, setState } from '../db/queries.ts'
import { routeUsingLocalOfficials } from '../services/router.ts'
import { buildSindicTemplate, renderSindicMarkdown } from '../services/sindic.ts'

function parseAdmins(): Set<number> {
  const raw = process.env.ADMIN_USER_IDS ?? ''
  const ids = new Set<number>()
  for (const s of raw.split(',')) {
    const n = Number(s.trim())
    if (Number.isFinite(n) && n > 0) ids.add(n)
  }
  return ids
}

function isAdmin(ctx: MyContext, admins: Set<number>): boolean {
  const id = ctx.from?.id
  return !!id && admins.has(id)
}

function parseQuejaId(raw: string | undefined): string | null {
  if (!raw) return null
  const trimmed = raw
    .trim()
    .toUpperCase()
    .replace(/^\/ESCALAR[_\s]?/, '')
    .replace(/^Q[-_]?/, '')
  if (!/^[0-9A-Z]{4,}$/.test(trimmed)) return null
  return 'Q-' + trimmed
}

export function registerEscalar(bot: Bot<MyContext>, db: Db, channel: Channel) {
  const admins = parseAdmins()
  const botHost = process.env.WEBHOOK_URL ?? null

  bot.command('escalar', async (ctx) => {
    if (!isAdmin(ctx, admins)) {
      await ctx.reply('Comando reservado al moderador.')
      return
    }
    const id = parseQuejaId(ctx.match as string)
    if (!id) {
      await ctx.reply('Uso: `/escalar Q-XXXX`', { parse_mode: 'Markdown' })
      return
    }
    const q = getQueja(db, id)
    if (!q) {
      await ctx.reply(`No encuentro la queja \`${id}\`.`, { parse_mode: 'Markdown' })
      return
    }
    if (q.state !== 'silencio_negativo' && q.state !== 'registrada') {
      await ctx.reply(
        `\`${id}\` está en estado *${q.state}*. Solo puedes escalar quejas en silencio_negativo o registrada (con el plazo vencido).`,
        { parse_mode: 'Markdown' },
      )
      return
    }

    const updated = setState(db, id, 'escalada_sindic')
    if (updated) {
      await channel.postEscaladaSindic(updated)
    }

    const routing = routeUsingLocalOfficials({
      title: q.title,
      detail: q.detail,
      category: q.category as never,
    })
    const template = buildSindicTemplate(q, routing)
    const preview = renderSindicMarkdown(template).split('\n').slice(0, 6).join('\n')

    const links = botHost
      ? `\n\n📎 Documento para el Síndic:\n• Markdown: ${botHost}/sindic/${q.id.toLowerCase()}.md\n• HTML imprimible: ${botHost}/sindic/${q.id.toLowerCase()}.html`
      : '\n\n_Para URLs del documento, despliega el bot con WEBHOOK_URL._'

    await ctx.reply(
      `⚖️ *Escalado \`${q.id}\`* al Síndic de Greuges CV.\n\n${preview}\n…${links}\n\nPresenta en https://www.elsindic.com/es/presenta-una-queja`,
      { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } },
    )
  })
}
