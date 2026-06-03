import type { Bot } from 'grammy'
import type { Db } from '../db/client.ts'
import type { MyContext } from '../types.ts'

interface Digest {
  windowDays: number
  nuevas: number
  resueltas: number
  pendientes: number
  silencios: number
  escaladas: number
  topCategorias: Array<{ category: string; n: number }>
}

export function computeDigest(db: Db, windowDays = 7): Digest {
  const window = `-${windowDays} days`
  const newCount = (
    db
      .prepare(`SELECT COUNT(*) as n FROM quejas WHERE date(created_at) > date('now', ?)`)
      .get(window) as { n: number }
  ).n
  const resueltas = (
    db
      .prepare(
        `SELECT COUNT(*) as n FROM quejas WHERE state = 'resuelta' AND date(resolved_at) > date('now', ?)`,
      )
      .get(window) as { n: number }
  ).n
  const silencios = (
    db.prepare(`SELECT COUNT(*) as n FROM quejas WHERE state = 'silencio_negativo'`).get() as {
      n: number
    }
  ).n
  const escaladas = (
    db.prepare(`SELECT COUNT(*) as n FROM quejas WHERE state = 'escalada_sindic'`).get() as {
      n: number
    }
  ).n
  const pendientes = (
    db
      .prepare(
        `SELECT COUNT(*) as n FROM quejas WHERE state IN ('capturada','apoyada_verificada','registrada','notificada_10d','en_tramite')`,
      )
      .get() as { n: number }
  ).n
  const topCategorias = db
    .prepare(
      `SELECT category, COUNT(*) as n FROM quejas
       WHERE date(created_at) > date('now', ?)
       GROUP BY category ORDER BY n DESC LIMIT 5`,
    )
    .all(window) as Array<{ category: string; n: number }>
  return {
    windowDays,
    nuevas: newCount,
    resueltas,
    pendientes,
    silencios,
    escaladas,
    topCategorias,
  }
}

export function formatDigest(d: Digest): string {
  const pretty = (c: string) => c.replace(/_/g, ' ')
  const cats =
    d.topCategorias.length > 0
      ? d.topCategorias.map((c) => `• ${pretty(c.category)} — ${c.n}`).join('\n')
      : '  (sin datos)'
  return [
    `📰 *Resumen últimos ${d.windowDays} días*`,
    '',
    `🆕 Nuevas: *${d.nuevas}*`,
    `✅ Resueltas: *${d.resueltas}*`,
    `⏳ Pendientes (total): *${d.pendientes}*`,
    `⚠️ Silencios: *${d.silencios}*`,
    `⚖️ Escaladas al Síndic: *${d.escaladas}*`,
    '',
    `*Categorías más reportadas:*`,
    cats,
    '',
    `Dashboard completo: ${process.env.PUBLIC_BASE_URL ?? 'https://civicpulse-virid.vercel.app'}/quejas`,
  ].join('\n')
}

export function registerDigest(bot: Bot<MyContext>, db: Db) {
  bot.command('digest', async (ctx) => {
    const argDays = Number((ctx.match as string | undefined)?.trim())
    const windowDays = Number.isFinite(argDays) && argDays > 0 ? Math.min(argDays, 90) : 7
    const d = computeDigest(db, windowDays)
    await ctx.reply(formatDigest(d), {
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: true },
    })
  })
}
