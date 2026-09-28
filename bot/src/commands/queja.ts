import type { Bot } from 'grammy'
import { InlineKeyboard } from 'grammy'
import { createConversation } from '@grammyjs/conversations'
import type { Db } from '../db/client.ts'
import { autorTelegram, createQueja, type NewQuejaInput } from '../db/queries.ts'
import { routeUsingLocalOfficials } from '../services/router.ts'
import { situar } from '../services/neighborhoods.ts'
import { comandoDe } from '../services/solo-en-privado.ts'
import { avisarAdmins, type EnvioAdmin } from '../services/avisos-admin.ts'
import { parseAdminIds } from '../util/admins.ts'
import type { QuejaCategory, QuejaRouting } from '../../../src/scraper/queja-router.ts'
import { plazoHumano } from '../../../src/scraper/queja-router.ts'

/** «3 meses» / «1 mes»: la unidad en que lo fija la norma, no días. */
const plazoDeLaRuta = (r: QuejaRouting) => {
  const limite = r.timeLimits.find((t) => t.kind === 'resolucion')
  return limite ? plazoHumano(limite) : '—'
}
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

/**
 * Lo más que espera cada paso de la queja.
 *
 * Sin plazo, quien dejaba la queja en «escribe un título» y días después
 * mandaba cualquier cosa veía su mensaje convertido en el título de una queja;
 * dos mensajes más y se publicaba. Pasado el plazo, el plugin termina la
 * conversación y el mensaje sigue su camino hasta el último manejador, que
 * contesta `SIN_QUEJA_EN_CURSO` (commands/registrar.ts).
 */
export const PLAZO_PASO_MS = 30 * 60 * 1000

/**
 * Lo que oye quien escribe sin una queja en curso: la suya caducó, o se perdió
 * en un despliegue —las conversaciones viven en memoria—, o nunca empezó.
 * Antes, silencio.
 */
export const SIN_QUEJA_EN_CURSO =
  'No tengo ninguna queja tuya en curso. Si estabas escribiendo una, un borrador sin ' +
  'respuesta durante media hora se descarta. Escribe /queja para empezar una, o /start para ' +
  'ver qué más puedo hacer.'

/**
 * Lo que oye quien manda una orden a mitad de una queja: la orden la termina, y
 * sin este aviso el borrador desaparecía sin que nadie lo dijera.
 */
export const QUEJA_A_MEDIAS =
  'La queja que estabas escribiendo se queda a medias. Cuando quieras, /queja para empezar otra.'

const PIDE_UBICACION =
  '📍 Para situarla necesito la ubicación compartida (botón 📎 → Ubicación). ' +
  'Si prefieres no indicarla, escribe `saltar`.'

const esSaltar = (texto: string) => /^saltar[.!]?$/i.test(texto.trim())

/**
 * El siguiente update de la conversación.
 *
 * Una orden la termina y la contesta su propio manejador: quien manda `/mis` a
 * mitad de una queja quiere ver sus quejas, no titular una nueva, y medido el
 * 2026-09-27 se tomaba como el título. En el paso de la categoría, que esperaba
 * un botón, la misma orden se perdía sin respuesta.
 */
async function siguiente(conv: MyConversation): Promise<MyContext> {
  const c = await conv.wait()
  if (comandoDe(c) !== null) {
    await c.reply(QUEJA_A_MEDIAS)
    await conv.halt({ next: true })
  }
  return c
}

/**
 * El texto con que se contesta un paso. Otro mensaje recibe un recordatorio; lo
 * que no es un mensaje —un botón de otra ficha, una edición— sigue su camino,
 * como si la conversación no estuviera.
 */
async function textoDelPaso(conv: MyConversation, recordatorio: string): Promise<string> {
  for (;;) {
    const c = await siguiente(conv)
    if (c.message?.text !== undefined) return c.message.text
    if (!c.message) await conv.skip({ next: true })
    await c.reply(recordatorio)
  }
}

/**
 * La ubicación, situada en el término, o `null` si el vecino la salta.
 *
 * Antes, cualquier texto contaba como «saltar» —también una dirección escrita—
 * y una ubicación de otro municipio se guardaba y se atribuía a la
 * urbanización más cercana. Ahora esa se vuelve a pedir. Sin geo.json
 * (`sin-geo`) no se puede comprobar, y la queja sigue sin barrio: el dato que
 * falta es nuestro, no del vecino.
 */
async function ubicacionDelPaso(
  conv: MyConversation,
): Promise<{ lat: number; lng: number; neighborhood: string | null } | null> {
  for (;;) {
    const c = await siguiente(conv)
    if (!c.message) await conv.skip({ next: true })
    const loc = c.message?.location
    if (loc) {
      const s = situar(loc.latitude, loc.longitude)
      if (s.situacion !== 'fuera-del-termino') {
        const neighborhood = s.situacion === 'barrio' ? s.slug : null
        return { lat: loc.latitude, lng: loc.longitude, neighborhood }
      }
      await c.reply(
        '📍 Esa ubicación queda fuera del término de Riba-roja de Túria. ' +
          'Comparte una de dentro, o escribe `saltar` para seguir sin ella.',
        { parse_mode: 'Markdown' },
      )
      continue
    }
    if (c.message?.text !== undefined && esSaltar(c.message.text)) return null
    await c.reply(PIDE_UBICACION, { parse_mode: 'Markdown' })
  }
}

export function quejaConversationBuilder(db: Db, envio: EnvioAdmin) {
  return async function quejaConversation(conv: MyConversation, ctx: MyContext) {
    await ctx.reply(
      '📝 *Nueva queja ciudadana*\n\n' +
        'Voy a guiarte paso a paso. Antes de publicarse en el tablón público de Riba-roja de Túria la revisa una persona del equipo, y te aviso aquí cuando sea pública. Cuando alcance 10 apoyos, entrará en el lote semanal al Registro Electrónico del Ayuntamiento.\n\n' +
        'Primer paso: *categoría*.',
      { parse_mode: 'Markdown', reply_markup: categoryKeyboard() },
    )

    let catChoice: string | null = null
    while (catChoice === null) {
      const c = await siguiente(conv)
      const data = c.callbackQuery?.data
      if (data?.startsWith('cat:')) {
        await c.answerCallbackQuery()
        catChoice = data.slice('cat:'.length)
      } else if (c.message) {
        await c.reply('Elige una categoría con los botones de arriba.')
      } else {
        await conv.skip({ next: true })
      }
    }
    if (catChoice === 'cancel') {
      await ctx.reply('Cancelado. Cuando quieras, /queja para empezar de nuevo.')
      return
    }
    const category = catChoice as QuejaCategory
    const catLabel = CATEGORIES.find((c) => c.id === category)?.label ?? category

    await ctx.reply(
      `Categoría: *${catLabel}*\n\nAhora, escribe un *título breve* (máx. 140 caracteres). Ejemplo: _Bache profundo en Av. Primera_.`,
      { parse_mode: 'Markdown' },
    )
    const title = (await textoDelPaso(conv, 'Escribe el título con texto, por favor.'))
      .trim()
      .slice(0, 140)
    if (title.length < 5) {
      await ctx.reply('El título es muy corto. Cancelo — prueba /queja otra vez.')
      return
    }

    await ctx.reply(
      '✍️ *Describe lo que pasa* con el detalle que puedas (máx. 2000 caracteres). Cuanto más concreto, más fácil de resolver.',
      { parse_mode: 'Markdown' },
    )
    const detail = (await textoDelPaso(conv, 'Escribe el detalle con texto, por favor.'))
      .trim()
      .slice(0, 2000)
    if (detail.length < 20) {
      await ctx.reply('El detalle es muy corto. Cancelo — prueba /queja otra vez.')
      return
    }

    await ctx.reply(
      '📍 *Ubicación* — comparte la ubicación del incidente (botón 📎 → Ubicación), o escribe `saltar` si prefieres no indicarla.',
      { parse_mode: 'Markdown' },
    )
    const ubicacion = await ubicacionDelPaso(conv)
    const lat = ubicacion?.lat ?? null
    const lng = ubicacion?.lng ?? null
    const neighborhood = ubicacion?.neighborhood ?? null

    await ctx.reply(
      '📸 *Foto* (opcional) — adjunta una foto, o escribe `saltar`. Antes de publicarla se anonimiza automáticamente (se difuminan caras y matrículas) y se eliminan los metadatos de ubicación. Podrás retirarla en cualquier momento con `/olvidar`.',
      { parse_mode: 'Markdown' },
    )
    let photoFileId: string | null = null
    for (;;) {
      const c = await siguiente(conv)
      if (!c.message) await conv.skip({ next: true })
      const photos = c.message?.photo
      if (photos?.length) {
        photoFileId = photos[photos.length - 1].file_id
        break
      }
      // Cualquier texto sigue sin foto, como siempre: «saltar», «no tengo»…
      if (c.message?.text !== undefined) break
      await c.reply('Adjunta la foto como imagen, o escribe `saltar`.', { parse_mode: 'Markdown' })
    }

    // Route (classify + assign concejalía) using local queja-router.
    const routing = routeUsingLocalOfficials({ title, detail, category })

    const payload: NewQuejaInput = {
      autor: autorTelegram(ctx.from!.id),
      category,
      title,
      detail,
      lat,
      lng,
      neighborhood,
      foto_ref: photoFileId ? `tg:${photoFileId}` : null,
      concejalia_area: routing.concejalia.area,
      concejal_slug: routing.concejalia.responsible?.slug ?? null,
    }
    const saved = createQueja(db, payload)

    // Nace `pendiente`: no es pública hasta que un administrador la revisa. La
    // tarjeta va a cada uno; la que no llegue a nadie la reenvía la pasada horaria
    // (services/avisos-admin.ts). El canal público no la anuncia, ni ahora ni al
    // publicarla: un anuncio no se retiraba con la queja.
    await avisarAdmins(db, saved, { admins: parseAdminIds(), envio })

    const responsible = routing.concejalia.responsible
    const confirmation =
      `✅ *Queja recibida:* \`${saved.id}\`\n\n` +
      `🕒 Antes de publicarla la revisa una persona del equipo; te aviso aquí cuando sea pública.\n\n` +
      `*Categoría:* ${catLabel}\n` +
      `*Área responsable:* ${routing.concejalia.area}\n` +
      (responsible ? `*Responsable político:* ${responsible.name} (${responsible.party})\n` : '') +
      `\n*Plazo legal, desde que se registre:* ${plazoDeLaRuta(routing)} (${routing.silencio === 'positivo' ? 'silencio positivo' : 'silencio negativo'})\n` +
      `*Base legal:* ${routing.legalBasis[0]?.law} ${routing.legalBasis[0]?.article}\n\n` +
      `Al llegar a *10 apoyos*, entrará en el lote semanal al Registro Electrónico.\n` +
      `Si vence sin respuesta, puede prepararse la plantilla para acudir al *Síndic de Greuges CV*.\n\n` +
      // El atajo para apoyarla llega con el aviso de que es pública: antes, nadie
      // más que su autor puede verla.
      `• Estado: /estado\\_${saved.id.replace('Q-', '').toLowerCase()}`

    await ctx.reply(confirmation, { parse_mode: 'Markdown' })
  }
}

export function registerQueja(bot: Bot<MyContext>, db: Db, envio: EnvioAdmin) {
  bot.use(
    createConversation(quejaConversationBuilder(db, envio), {
      id: 'queja',
      maxMillisecondsToWait: PLAZO_PASO_MS,
    }),
  )
  bot.command('queja', async (ctx) => {
    await ctx.conversation.enter('queja')
  })
}
