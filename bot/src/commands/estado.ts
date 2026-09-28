import type { Bot } from 'grammy'
import type { Db } from '../db/client.ts'
import {
  autorTelegram,
  countApoyos,
  EVENTO_DATOS_RETIRADOS,
  EVENTO_RECORTE_REVISION,
  esAutor,
  getQuejaPublica,
  getQuejaViva,
  listEvents,
} from '../db/queries.ts'
import { REVISION_PARA_AUTOR } from '../services/textos-revision.ts'
import { routeUsingLocalOfficials } from '../services/router.ts'
import { plazoHumano } from '../../../src/scraper/queja-router.ts'
import type { MyContext } from '../types.ts'
import { EVENTO_BARRIO_CORREGIDO } from '../services/rebarrio.ts'
import { idDeQueja } from '../services/queja-id.ts'

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
    (
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
        // Una corrección del barrio con la regla de 2026-09-27 (services/rebarrio.ts):
        // se enseña, porque cambia un dato publicado.
        [EVENTO_BARRIO_CORREGIDO]: '📍 Barrio corregido',
        // Las decisiones de la revisión antes de publicar (decidirModeracion). Las
        // dos últimas las ve su autor mientras la queja no es pública; si después
        // se publica, quedan en su historial, que es lo que pasó.
        moderacion_publicada: '🌐 Publicada tras revisarla',
        moderacion_descartada: '🚫 No publicada tras revisarla',
        moderacion_retirada: '↩️ Retirada de la publicación',
        // Los datos personales que el bot quitó del texto al guardarla (services/pii.ts).
        [EVENTO_DATOS_RETIRADOS]: '🧹 Datos personales retirados al guardarla',
        // Los fragmentos que quitó después la revisión automática (services/moderacion.ts).
        [EVENTO_RECORTE_REVISION]: '✂️ Datos de otras personas retirados en la revisión',
      } as Record<string, string>
    )[state] ?? state
  )
}

export function registerEstado(bot: Bot<MyContext>, db: Db) {
  const handler = async (ctx: MyContext, raw: string | undefined) => {
    const id = idDeQueja(raw)
    if (!id) {
      await ctx.reply('Uso: `/estado Q-XXXX`', { parse_mode: 'Markdown' })
      return
    }
    // Lo público, para cualquiera; lo que no se ha publicado, sólo para su autor
    // y sólo en privado: /estado contesta también en un grupo, y ahí su autor
    // pondría a la vista de todos una queja que nadie ha revisado.
    // Para los demás, una sin publicar y una que no existe contestan igual.
    const q =
      getQuejaPublica(db, id) ??
      (ctx.chat?.type === 'private' && ctx.from && esAutor(db, id, autorTelegram(ctx.from.id))
        ? getQuejaViva(db, id)
        : null)
    if (!q) {
      await ctx.reply(`No encuentro la queja \`${id}\`.`, { parse_mode: 'Markdown' })
      return
    }
    const revision = REVISION_PARA_AUTOR[q.moderacion]
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
    const plazo = routing.timeLimits.find((t) => t.kind === 'resolucion')

    const body =
      `🗂 *${q.id}* · ${q.category}\n` +
      `*${q.title}*\n\n` +
      (revision ? `${revision}\n\n` : '') +
      `*Estado:* ${stateLabel(q.state)}\n` +
      `*Apoyos:* ${apoyos} / 10 para verificación\n` +
      `*Área:* ${routing.concejalia.area}\n` +
      (responsible ? `*Responsable político:* ${responsible.name} (${responsible.party})\n` : '') +
      `*Plazo legal:* ${plazo ? plazoHumano(plazo) : '—'} (${routing.silencio === 'positivo' ? 'silencio positivo' : 'silencio negativo'})\n` +
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
