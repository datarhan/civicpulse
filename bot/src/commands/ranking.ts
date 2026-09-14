import type { Bot } from 'grammy'
import type { Db } from '../db/client.ts'
import type { MyContext } from '../types.ts'

function prettyBarrio(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

interface BarrioStats {
  neighborhood: string
  total: number
  resueltas: number
  silencio: number
  pendientes: number
  resolucionPct: number
}

/**
 * El ranking por barrios de los últimos 60 días.
 *
 * Exportada para poder probarla: lo único que salía de este fichero era
 * `registerRanking`, que necesita un `Bot` de grammy, así que la parte con
 * aritmética dentro no tenía forma de comprobarse. `computeDigest`, al lado, ya
 * se exporta por el mismo motivo.
 */
export function computeRanking(db: Db): BarrioStats[] {
  const rows = db
    .prepare(
      // Las retiradas con `/olvidar` fuera. No es sólo un recuento de más: al
      // entrar en `total` mueven el DENOMINADOR del porcentaje de resolución, así
      // que el barrio aparecía con peor (o mejor) nota por quejas que ya no
      // existen y que su autor borró.
      `SELECT
         neighborhood,
         COUNT(*) as total,
         SUM(CASE WHEN state = 'resuelta' THEN 1 ELSE 0 END) as resueltas,
         SUM(CASE WHEN state = 'silencio_negativo' THEN 1 ELSE 0 END) as silencio,
         SUM(CASE WHEN state IN ('capturada','apoyada_verificada','registrada','notificada_10d','en_tramite') THEN 1 ELSE 0 END) as pendientes
       FROM quejas
       WHERE neighborhood IS NOT NULL
         AND deleted_at IS NULL
         AND date(created_at) > date('now','-60 days')
       GROUP BY neighborhood`,
    )
    .all() as Array<{
    neighborhood: string
    total: number
    resueltas: number
    silencio: number
    pendientes: number
  }>
  return rows
    .map((r) => ({
      ...r,
      resolucionPct: r.total > 0 ? Math.round((r.resueltas / r.total) * 100) : 0,
    }))
    .sort((a, b) => b.resolucionPct - a.resolucionPct || b.total - a.total)
}

export function registerRanking(bot: Bot<MyContext>, db: Db) {
  bot.command('ranking', async (ctx) => {
    const stats = computeRanking(db)
    if (stats.length === 0) {
      await ctx.reply(
        '🏁 Aún no hay datos suficientes (últimos 60 días). Vuelve cuando tengamos más quejas con ubicación y resoluciones registradas.',
      )
      return
    }
    const lines = stats.map((s, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  '
      return `${medal} ${prettyBarrio(s.neighborhood)} — ${s.resolucionPct}% resueltas · ${s.total} totales · ${s.pendientes} pendientes · ${s.silencio} silencios`
    })
    await ctx.reply(
      `🏁 *Ranking barrios · 60 días*\n\n${lines.join('\n')}\n\n_Las cifras se basan en transiciones de estado, no en valoraciones editoriales._`,
      { parse_mode: 'Markdown' },
    )
  })
}
