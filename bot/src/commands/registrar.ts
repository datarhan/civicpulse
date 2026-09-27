/**
 * Todos los comandos del bot, montados en un solo sitio y detrás de `soloEnPrivado`.
 *
 * Vivían sueltos en `makeBot`, sin nada delante. Aquí el primer middleware es el que
 * decide qué puede contestar fuera de un chat privado (services/solo-en-privado.ts), y
 * todo lo que se registre después pasa por él. Las pruebas montan el bot con esta misma
 * función, así que lo que prueban es el orden de producción, no una copia.
 */
import { session, type Bot } from 'grammy'
import { conversations } from '@grammyjs/conversations'
import type { Db } from '../db/client.ts'
import type { Channel } from '../services/channel.ts'
import { envioDesdeApi, type EnvioAdmin } from '../services/avisos-admin.ts'
import { soloEnPrivado } from '../services/solo-en-privado.ts'
import type { MyContext, SessionData } from '../types.ts'
import { registerStart } from './start.ts'
import { registerQueja, SIN_QUEJA_EN_CURSO } from './queja.ts'
import { registerEstado } from './estado.ts'
import { registerApoyar } from './apoyar.ts'
import { registerMis } from './mis.ts'
import { registerOlvidar } from './olvidar.ts'
import { registerBorrarMisDatos } from './borrar.ts'
import { registerSubscribe } from './subscribe.ts'
import { registerBarrio } from './barrio.ts'
import { registerRanking } from './ranking.ts'
import { registerDigest } from './digest.ts'
import { registerBatchCommand } from './batch.ts'
import { registerEscalar } from './escalar.ts'
import { registerCurarCommand } from './curar.ts'
import { registerModerar } from './moderar.ts'

export function registrarComandos(
  bot: Bot<MyContext>,
  db: Db,
  channel: Channel,
  // Las tarjetas de revisión van por la API del propio bot; las pruebas pasan la suya.
  envio: EnvioAdmin = envioDesdeApi(bot.api),
) {
  // Lo primero, antes que la sesión y las conversaciones: un mensaje de grupo que no
  // es un comando público no llega a ningún manejador.
  bot.use(soloEnPrivado())
  bot.use(session({ initial: (): SessionData => ({}) }))
  bot.use(conversations())

  // Conversation handler must come before plain command handlers that
  // share trigger names.
  registerQueja(bot, db, envio)
  registerStart(bot)
  registerEstado(bot, db)
  registerApoyar(bot, db, channel)
  registerMis(bot, db)
  registerOlvidar(bot, db)
  registerBorrarMisDatos(bot, db)
  registerSubscribe(bot, db)
  registerBarrio(bot, db)
  registerRanking(bot, db)
  registerDigest(bot, db)
  registerBatchCommand(bot, db, channel)
  registerEscalar(bot, db, channel)
  registerCurarCommand(bot, db)
  registerModerar(bot, db, { envio, channel })

  // Un botón de categoría que ya no sirve —de una queja caducada, perdida en un
  // despliegue o ya en otro paso— se quedaba con el reloj girando: nadie
  // contestaba su callback. Las conversaciones vivas los recogen antes.
  bot.callbackQuery(/^cat:/, (ctx) =>
    ctx.answerCallbackQuery({ text: 'Ese botón ya no sirve. Para empezar otra queja, /queja.' }),
  )

  // Lo último: un mensaje privado que nadie ha contestado. Es donde acaba quien
  // sigue una queja caducada o perdida en un despliegue, y antes oía silencio.
  // Un álbum llega como un mensaje por foto, así que se contesta al primero; y
  // un mensaje de servicio —el temporizador de borrado, un mensaje fijado— no lo
  // ha escrito nadie y no se contesta.
  const albumes = new Set<string>()
  bot.chatType('private').on('message', (ctx) => {
    const m = ctx.message
    if (!escritoPorQuienManda(m)) return
    if (m.media_group_id) {
      if (albumes.has(m.media_group_id)) return
      albumes.add(m.media_group_id)
      if (albumes.size > 200) albumes.delete(albumes.values().next().value as string)
    }
    return ctx.reply(SIN_QUEJA_EN_CURSO)
  })
}

/** Un mensaje que alguien escribió o envió, no uno de servicio. */
function escritoPorQuienManda(mensaje: object): boolean {
  const m = mensaje as Record<string, unknown>
  return [
    'text',
    'caption',
    'photo',
    'location',
    'voice',
    'video',
    'video_note',
    'document',
    'audio',
    'sticker',
    'animation',
    'contact',
    'venue',
  ].some((k) => m[k] !== undefined)
}
