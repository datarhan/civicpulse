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

/**
 * El resumen de `/barrio` sin argumento, sobre las últimas quejas.
 *
 * Desde el 2026-09-27 una queja del casco urbano no tiene barrio
 * (src/scraper/situar-barrio.ts), y este resumen la saltaba en silencio: con
 * las recientes en el casco decía «Aún no hay quejas con ubicación», que era
 * falso — tenían ubicación, y no barrio. Ahora las cuenta aparte, sin hacer
 * concordar el verbo con la cifra.
 */
export function resumenDeBarrios(recientes: Array<{ neighborhood: string | null }>): string {
  if (recientes.length === 0) return 'Aún no hay quejas. Usa /queja para abrir la primera.'
  const porBarrio = new Map<string, number>()
  let sinBarrio = 0
  for (const q of recientes) {
    if (!q.neighborhood) sinBarrio += 1
    else porBarrio.set(q.neighborhood, (porBarrio.get(q.neighborhood) ?? 0) + 1)
  }
  const porQue = 'el casco urbano no tiene, y una queja sin ubicación tampoco'
  if (porBarrio.size === 0) {
    return `🗺 Ninguna de las quejas recientes (${recientes.length}) tiene barrio: ${porQue}.`
  }
  const lines = Array.from(porBarrio.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([slug, n]) => `• ${prettyBarrio(slug)} — ${n}`)
  const nota =
    sinBarrio > 0 ? `\n\nSin barrio: ${sinBarrio} de ${recientes.length} (${porQue}).` : ''
  return (
    `🗺 *Quejas por barrio* (últimas ${recientes.length})\n\n${lines.join('\n')}${nota}` +
    '\n\nUso: `/barrio <slug>` para ver las de un barrio concreto.'
  )
}

export function registerBarrio(bot: Bot<MyContext>, db: Db) {
  bot.command('barrio', async (ctx) => {
    const arg = (ctx.match as string | undefined)?.trim()
    if (!arg) {
      await ctx.reply(resumenDeBarrios(listRecentQuejas(db, 30)), { parse_mode: 'Markdown' })
      return
    }
    const slug = arg.toLowerCase().replace(/\s+/g, '-')
    const rows = listByNeighborhood(db, slug, 15)
    if (rows.length === 0) {
      await ctx.reply(`Sin quejas en *${prettyBarrio(slug)}* por ahora.`, {
        parse_mode: 'Markdown',
      })
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
