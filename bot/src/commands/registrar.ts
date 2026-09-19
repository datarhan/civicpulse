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
import { soloEnPrivado } from '../services/solo-en-privado.ts'
import type { MyContext, SessionData } from '../types.ts'
import { registerStart } from './start.ts'
import { registerQueja } from './queja.ts'
import { registerEstado } from './estado.ts'
import { registerApoyar } from './apoyar.ts'
import { registerMis } from './mis.ts'
import { registerOlvidar } from './olvidar.ts'
import { registerSubscribe } from './subscribe.ts'
import { registerBarrio } from './barrio.ts'
import { registerRanking } from './ranking.ts'
import { registerDigest } from './digest.ts'
import { registerBatchCommand } from './batch.ts'
import { registerEscalar } from './escalar.ts'
import { registerCurarCommand } from './curar.ts'

export function registrarComandos(bot: Bot<MyContext>, db: Db, channel: Channel) {
  // Lo primero, antes que la sesión y las conversaciones: un mensaje de grupo que no
  // es un comando público no llega a ningún manejador.
  bot.use(soloEnPrivado())
  bot.use(session({ initial: (): SessionData => ({}) }))
  bot.use(conversations())

  // Conversation handler must come before plain command handlers that
  // share trigger names.
  registerQueja(bot, db, channel)
  registerStart(bot)
  registerEstado(bot, db)
  registerApoyar(bot, db, channel)
  registerMis(bot, db)
  registerOlvidar(bot, db)
  registerSubscribe(bot, db)
  registerBarrio(bot, db)
  registerRanking(bot, db)
  registerDigest(bot, db)
  registerBatchCommand(bot, db, channel)
  registerEscalar(bot, db, channel)
  registerCurarCommand(bot, db)
}
