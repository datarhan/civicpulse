import type { Bot } from 'grammy'
import type { Db } from '../db/client.ts'
import { countApoyos, getQueja, listEvents } from '../db/queries.ts'
import { routeUsingLocalOfficials } from '../services/router.ts'
import type { MyContext } from '../types.ts'

function parseQuejaId(raw: string | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim().toUpperCase().replace(/^\/ESTADO[_\s]?/, '').replace(/^Q[-_]?/, '')
  if (!/^[0-9A-Z]{4,}$/.test(trimmed)) return null
  return 'Q-' + trimmed
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function stateLabel(state: string): string {
  return (
    {
      capturada: '📥 Capturada',
      apoyada_verificada: '👍 Verificada por la comunidad',
      registrada: '🗃 Registrada en sede',
      notificada_10d: '📨 Acuse recibido',
      en_tramite: '⚙️ En trámite',
      resuelta: '✅ Resuelta',
      silencio_negativo: '⚠️ Silencio administrativo',
      escalada_sindic: '⚖️ Escalada al Síndic',
      cerrada_no_registrada: '❌ Cerrada sin registrar',
    } as Record<string, string>
  )[state] ?? state
}

export function registerEstado(bot: Bot<MyContext>, db: Db) {
  const handler = async (ctx: MyContext, raw: string | undefined) => {
    const id = parseQuejaId(raw)
    if (!id) {
      await ctx.reply('Uso: `/estado Q-XXXX`', { parse_mode: 'Markdown' })
      return
    }
    const q = getQueja(db, id)
    if (!q) {
      await ctx.reply(`No encuentro la queja \`${id}\`.`, { parse_mode: 'Markdown' })
      return
    }
    const apoyos = countApoyos(db, id)
    const events = listEvents(db, id)
    const routing = routeUsingLocalOfficials({
      title: q.title,
      detail: q.detail,
      category: q.category as any,
    })

    const timeline = events
      .map((e) => `• ${formatDate(e.created_at)} — ${stateLabel(e.kind)}`)
      .join('\n')

    const responsible = routing.concejalia.responsible
    const plazo = routing.timeLimits.find((t) => t.kind === 'resolucion')?.days ?? 90

    const body =
      `🗂 *${q.id}* · ${q.category}\n` +
      `*${q.title}*\n\n` +
      `*Estado:* ${stateLabel(q.state)}\n` +
      `*Apoyos:* ${apoyos} / 10 para verificación\n` +
      `*Área:* ${routing.concejalia.area}\n` +
      (responsible ? `*Responsable político:* ${responsible.name} (${responsible.party})\n` : '') +
      `*Plazo legal:* ${plazo} días (${routing.silencio === 'positivo' ? 'silencio positivo' : 'silencio negativo'})\n` +
      (q.registro_entry_number
        ? `*Asiento:* \`${q.registro_entry_number}\`\n*Registrada:* ${formatDate(q.registered_at)}\n`
        : '*No registrada aún en sede.*\n') +
      `\n*Historial:*\n${timeline}\n\n` +
      `_Base legal: ${routing.legalBasis[0]?.law} ${routing.legalBasis[0]?.article}_`

    await ctx.reply(body, { parse_mode: 'Markdown' })
  }

  bot.command('estado', async (ctx) => handler(ctx, ctx.match as string))
  bot.hears(/^\/estado[_\s]?([A-Za-z0-9]+)$/, async (ctx) => handler(ctx, ctx.match[1]))
}
