import type { Bot } from 'grammy'
import { InlineKeyboard } from 'grammy'
import { createConversation } from '@grammyjs/conversations'
import type { Db } from '../db/client.ts'
import { createQueja, type NewQuejaInput } from '../db/queries.ts'
import { routeUsingLocalOfficials } from '../services/router.ts'
import { matchNeighborhood } from '../services/neighborhoods.ts'
import type { Channel } from '../services/channel.ts'
import type { QuejaCategory } from '../../../src/scraper/queja-router.ts'
import type { MyContext, MyConversation } from '../types.ts'

const CATEGORIES: Array<{ id: QuejaCategory; label: string }> = [
  { id: 'via_publica', label: '🛣  Vía pública (baches, aceras)' },
  { id: 'alumbrado', label: '💡 Alumbrado (farolas)' },
  { id: 'limpieza', label: '🧹 Limpieza (basura, contenedores)' },
  { id: 'residuos', label: '♻️  Residuos y reciclaje' },
  { id: 'zonas_verdes', label: '🌳 Zonas verdes (parques)' },
  { id: 'agua_saneamiento', label: '💧 Agua y saneamiento' },
  { id: 'trafico', label: '🚦 Tráfico y señalización' },
  { id: 'transporte', label: '🚌 Transporte (metro L9, autobús)' },
  { id: 'mobiliario_urbano', label: '🪑 Mobiliario urbano' },
  { id: 'ruido', label: '🔊 Ruido' },
  { id: 'seguridad', label: '🚔 Seguridad ciudadana' },
  { id: 'accesibilidad', label: '♿ Accesibilidad' },
  { id: 'medio_ambiente', label: '🌿 Medio ambiente' },
  { id: 'bienestar_animal', label: '🐾 Bienestar animal' },
  { id: 'urbanismo', label: '🏗  Urbanismo / licencias' },
  { id: 'transparencia', label: '📂 Transparencia / acceso a información' },
  { id: 'otros', label: '📝 Otros' },
]

function categoryKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard()
  for (let i = 0; i < CATEGORIES.length; i++) {
    const c = CATEGORIES[i]
    kb.text(c.label, `cat:${c.id}`)
    if (i % 2 === 1) kb.row()
  }
  kb.row().text('Cancelar', 'cat:cancel')
  return kb
}

export function quejaConversationBuilder(db: Db, channel: Channel) {
  return async function quejaConversation(conv: MyConversation, ctx: MyContext) {
    await ctx.reply(
      '📝 *Nueva queja ciudadana*\n\n' +
        'Voy a guiarte paso a paso. Tu queja se añadirá al tablón público de Riba-roja de Túria. Cuando alcance 10 apoyos, entrará en el lote semanal al Registro Electrónico del Ayuntamiento.\n\n' +
        'Primer paso: *categoría*.',
      { parse_mode: 'Markdown', reply_markup: categoryKeyboard() }
    )

    const catCtx = await conv.waitForCallbackQuery(/^cat:/)
    await catCtx.answerCallbackQuery()
    const catChoice = catCtx.callbackQuery.data.replace('cat:', '')
    if (catChoice === 'cancel') {
      await ctx.reply('Cancelado. Cuando quieras, /queja para empezar de nuevo.')
      return
    }
    const category = catChoice as QuejaCategory
    const catLabel = CATEGORIES.find((c) => c.id === category)?.label ?? category

    await ctx.reply(
      `Categoría: *${catLabel}*\n\nAhora, escribe un *título breve* (máx. 140 caracteres). Ejemplo: _Bache profundo en Av. Primera_.`,
      { parse_mode: 'Markdown' }
    )
    const titleMsg = await conv.waitFor('message:text')
    const title = titleMsg.message.text.trim().slice(0, 140)
    if (title.length < 5) {
      await ctx.reply('El título es muy corto. Cancelo — prueba /queja otra vez.')
      return
    }

    await ctx.reply(
      '✍️ *Describe lo que pasa* con el detalle que puedas (máx. 2000 caracteres). Cuanto más concreto, más fácil de resolver.',
      { parse_mode: 'Markdown' }
    )
    const detailMsg = await conv.waitFor('message:text')
    const detail = detailMsg.message.text.trim().slice(0, 2000)
    if (detail.length < 20) {
      await ctx.reply('El detalle es muy corto. Cancelo — prueba /queja otra vez.')
      return
    }

    await ctx.reply(
      '📍 *Ubicación* — comparte la ubicación del incidente (botón 📎 → Ubicación), o escribe `saltar` si prefieres no indicarla.',
      { parse_mode: 'Markdown' }
    )
    const locMsg = await conv.waitFor(['message:location', 'message:text'])
    let lat: number | null = null
    let lng: number | null = null
    let neighborhood: string | null = null
    if ('location' in locMsg.message && locMsg.message.location) {
      lat = locMsg.message.location.latitude
      lng = locMsg.message.location.longitude
      neighborhood = matchNeighborhood(lat, lng)
    }

    await ctx.reply(
      '📸 *Foto* (opcional) — adjunta una foto, o escribe `saltar`. Las fotos se publican tras moderación; se anonimizan caras y matrículas.',
      { parse_mode: 'Markdown' }
    )
    const photoMsg = await conv.waitFor(['message:photo', 'message:text'])
    let photoFileId: string | null = null
    if ('photo' in photoMsg.message && photoMsg.message.photo) {
      const photos = photoMsg.message.photo
      photoFileId = photos[photos.length - 1].file_id
    }

    // Route (classify + assign concejalía) using local queja-router.
    const routing = routeUsingLocalOfficials({ title, detail, category })

    const payload: NewQuejaInput = {
      telegram_user_id: ctx.from!.id,
      telegram_username: ctx.from?.username ?? null,
      category,
      title,
      detail,
      lat,
      lng,
      neighborhood,
      photo_file_id: photoFileId,
      concejalia_area: routing.concejalia.area,
      concejal_slug: routing.concejalia.responsible?.slug ?? null,
    }
    const saved = createQueja(db, payload)

    // Broadcast to public channel (no-op when CHANNEL_ID unset).
    await channel.postNuevaQueja(saved, routing)

    const responsible = routing.concejalia.responsible
    const confirmation =
      `✅ *Queja registrada:* \`${saved.id}\`\n\n` +
      `*Categoría:* ${catLabel}\n` +
      `*Área responsable:* ${routing.concejalia.area}\n` +
      (responsible
        ? `*Responsable político:* ${responsible.name} (${responsible.party})\n`
        : '') +
      `\n*Plazo legal:* ${routing.timeLimits.find((t) => t.kind === 'resolucion')?.days} días (${routing.silencio === 'positivo' ? 'silencio positivo' : 'silencio negativo'})\n` +
      `*Base legal:* ${routing.legalBasis[0]?.law} ${routing.legalBasis[0]?.article}\n\n` +
      `Al llegar a *10 apoyos*, entrará en el lote semanal al Registro Electrónico.\n` +
      `Si nadie responde en plazo, escalamos al *Síndic de Greuges CV*.\n\n` +
      `• Estado: /estado\\_${saved.id.replace('Q-', '').toLowerCase()}\n` +
      `• Apoyar: /apoyar\\_${saved.id.replace('Q-', '').toLowerCase()}`

    await ctx.reply(confirmation, { parse_mode: 'Markdown' })
  }
}

export function registerQueja(bot: Bot<MyContext>, db: Db, channel: Channel) {
  bot.use(createConversation(quejaConversationBuilder(db, channel), 'queja'))
  bot.command('queja', async (ctx) => {
    await ctx.conversation.enter('queja')
  })
}
