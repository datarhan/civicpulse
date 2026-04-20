import type { Bot } from 'grammy'
import type { Db } from '../db/client.ts'
import { listByNeighborhood, listRecentQuejas, countApoyos } from '../db/queries.ts'
import type { MyContext } from '../types.ts'

function prettyBarrio(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function registerBarrio(bot: Bot<MyContext>, db: Db) {
  bot.command('barrio', async (ctx) => {
    const arg = (ctx.match as string | undefined)?.trim()
    if (!arg) {
      const recent = listRecentQuejas(db, 30)
      const byNeigh = new Map<string, number>()
      for (const q of recent) {
        if (!q.neighborhood) continue
        byNeigh.set(q.neighborhood, (byNeigh.get(q.neighborhood) ?? 0) + 1)
      }
      if (byNeigh.size === 0) {
        await ctx.reply(
          'Aún no hay quejas con ubicación. Usa /queja y comparte tu ubicación para empezar a mapear.'
        )
        return
      }
      const lines = Array.from(byNeigh.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([slug, n]) => `• ${prettyBarrio(slug)} — ${n}`)
      await ctx.reply(
        `🗺 *Quejas por barrio* (últimas 30)\n\n${lines.join('\n')}\n\nUso: \`/barrio <slug>\` para ver las de un barrio concreto.`,
        { parse_mode: 'Markdown' }
      )
      return
    }
    const slug = arg.toLowerCase().replace(/\s+/g, '-')
    const rows = listByNeighborhood(db, slug, 15)
    if (rows.length === 0) {
      await ctx.reply(`Sin quejas en *${prettyBarrio(slug)}* por ahora.`, { parse_mode: 'Markdown' })
      return
    }
    const body = rows
      .map((q) => {
        const apoyos = countApoyos(db, q.id)
        const title = q.title.length > 60 ? q.title.slice(0, 60) + '…' : q.title
        return `\`${q.id}\` · ${q.state} · 👍${apoyos}\n  ${title}`
      })
      .join('\n\n')
    await ctx.reply(`🗺 *${prettyBarrio(slug)}* (${rows.length})\n\n${body}`, {
      parse_mode: 'Markdown',
    })
  })
}
