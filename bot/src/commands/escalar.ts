/**
 * /escalar Q-XXXX — admin command that escalates a silencio-negativo
 * queja to the Síndic de Greuges de la Comunitat Valenciana:
 *   1. Transitions state to 'escalada_sindic'
 *   2. Tells the other admins it is marked as escalated (avisos-hitos.ts);
 *      until 2026-09-29 it went to the public channel
 *   3. Returns the URLs of the auto-generated template (md + html)
 *      so the reclamante can submit at https://www.elsindic.com
 *
 * Admin-gated via ADMIN_USER_IDS (same as /batch).
 */

import type { Bot } from 'grammy'
import type { Db } from '../db/client.ts'
import type { AvisosHitos } from '../services/avisos-hitos.ts'
import type { MyContext } from '../types.ts'
import { getQuejaPublica, setState } from '../db/queries.ts'
import { routeUsingLocalOfficials } from '../services/router.ts'
import {
  buildSindicTemplate,
  motivoParaNoEscalar,
  renderSindicMarkdown,
} from '../services/sindic.ts'
import { idDeQueja } from '../services/queja-id.ts'

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

export function registerEscalar(bot: Bot<MyContext>, db: Db, hitos: AvisosHitos) {
  const admins = parseAdmins()
  const botHost = process.env.WEBHOOK_URL ?? null

  bot.command('escalar', async (ctx) => {
    if (!isAdmin(ctx, admins)) {
      await ctx.reply('Comando reservado al moderador.')
      return
    }
    const id = idDeQueja(ctx.match as string)
    if (!id) {
      await ctx.reply('Uso: `/escalar Q-XXXX`', { parse_mode: 'Markdown' })
      return
    }
    const q = getQuejaPublica(db, id)
    if (!q) {
      await ctx.reply(`No encuentro la queja \`${id}\`.`, { parse_mode: 'Markdown' })
      return
    }
    const routing = routeUsingLocalOfficials({
      title: q.title,
      detail: q.detail,
      category: q.category as never,
    })
    // El escrito afirma que ha operado el silencio: una registrada sólo se
    // escala con el plazo vencido, contado como lo cuenta el bot (art. 30.5).
    const motivo = motivoParaNoEscalar(q, routing)
    if (motivo) {
      await ctx.reply(`\`${id}\` no se puede escalar: ${motivo}`, { parse_mode: 'Markdown' })
      return
    }

    const updated = setState(db, id, 'escalada_sindic')
    if (updated) {
      await hitos
        .avisar('escalada', updated.id)
        .catch((err) => console.error(`[escalar] el aviso de ${updated.id} no llegó:`, err))
    }

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
