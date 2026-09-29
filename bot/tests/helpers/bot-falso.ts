/**
 * Un bot con los comandos de producción (`registrarComandos`) y un `fetch` que
 * no sale a la red y guarda cada llamada a la API de Telegram.
 *
 * El `fetch` del cliente, y no un transformador de `bot.api`: el plugin de
 * conversaciones construye su propia `Api` con las OPCIONES del bot pero sin sus
 * transformadores, y lo de dentro de una conversación salía a la red
 * (conversacion-telegram.test.ts lo cuenta).
 */
import { Bot } from 'grammy'
import type { UserFromGetMe } from 'grammy/types'
import type { Db } from '../../src/db/client'
import { registrarComandos } from '../../src/commands/registrar'
import { HITOS_MUDOS, type AvisosHitos } from '../../src/services/avisos-hitos'
import type { MyContext } from '../../src/types'

export const BOT_INFO: UserFromGetMe = {
  id: 1,
  is_bot: true,
  first_name: 'Prueba',
  username: 'prueba_bot',
  can_join_groups: false,
  can_read_all_group_messages: false,
  can_manage_bots: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
  supports_join_request_queries: false,
}

export interface Llamada {
  metodo: string
  cuerpo: Record<string, any>
  /** El mensaje que Telegram creó (`sendMessage`) o cambió (`editMessageText`), si lo hizo. */
  message_id?: number
}

export function botFalso(
  db: Db,
  o: {
    /** Los avisos de hitos a quien modera; por defecto, mudos. */
    hitos?: AvisosHitos
    /**
     * Las llamadas que Telegram rechaza: `true`, como un bot bloqueado por quien
     * las recibe (403); un número, con ese código (un 502 es un fallo de paso).
     */
    falla?: (metodo: string, cuerpo: Record<string, any>) => boolean | number
    /**
     * Las llamadas que Telegram tarda en contestar: la promesa que devuelve, hasta
     * que la prueba la suelta; nada, para contestar en el acto. Así se ve lo que
     * llega mientras un update sigue a medias.
     */
    retener?: (metodo: string, cuerpo: Record<string, any>) => Promise<void> | undefined
  } = {},
) {
  const llamadas: Llamada[] = []
  let siguiente = 100
  const fetchFalso = (async (url: string | URL | Request, init?: RequestInit) => {
    const metodo = String(url).split('/').pop() ?? ''
    const cuerpo = init?.body ? JSON.parse(String(init.body)) : {}
    const llamada: Llamada = { metodo, cuerpo }
    llamadas.push(llamada)
    await o.retener?.(metodo, cuerpo)
    const fallo = o.falla?.(metodo, cuerpo)
    if (fallo) {
      const codigo = fallo === true ? 403 : fallo
      return new Response(
        JSON.stringify({
          ok: false,
          error_code: codigo,
          description:
            codigo === 403 ? 'Forbidden: bot was blocked by the user' : `Error ${codigo}`,
        }),
        { status: codigo, headers: { 'content-type': 'application/json' } },
      )
    }
    const result =
      metodo === 'sendMessage' || metodo === 'editMessageText'
        ? {
            message_id: metodo === 'sendMessage' ? siguiente++ : cuerpo.message_id,
            date: 0,
            chat: { id: cuerpo.chat_id, type: 'private' },
            text: cuerpo.text,
          }
        : true
    if (typeof result === 'object') llamada.message_id = result.message_id
    return new Response(JSON.stringify({ ok: true, result }), {
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  const bot = new Bot<MyContext>('1:prueba', { botInfo: BOT_INFO, client: { fetch: fetchFalso } })
  registrarComandos(bot, db, o.hitos ?? HITOS_MUDOS)
  return {
    bot,
    llamadas,
    /** Lo enviado a un chat, en orden. */
    a: (chatId: number) =>
      llamadas.filter((l) => l.metodo === 'sendMessage' && l.cuerpo.chat_id === chatId),
    /** Los `callback_data` de los botones de una llamada. */
    botones: (l: Llamada | undefined): string[] =>
      (l?.cuerpo.reply_markup?.inline_keyboard ?? [])
        .flat()
        .map((b: { callback_data: string }) => b.callback_data),
  }
}

let n = 0
const privado = (id: number) => ({ id, type: 'private' as const, first_name: `Persona ${id}` })
const de = (id: number) => ({ id, is_bot: false, first_name: `Persona ${id}` })

/** Un mensaje de texto (con la entidad de orden si empieza por «/»). */
export function texto(desde: number, t: string, chat = privado(desde)) {
  n += 1
  const orden = t.startsWith('/') ? t.split(/\s/)[0] : null
  return {
    update_id: n,
    message: {
      message_id: n,
      date: Math.floor(Date.now() / 1000),
      chat,
      from: de(desde),
      text: t,
      ...(orden ? { entities: [{ type: 'bot_command', offset: 0, length: orden.length }] } : {}),
    },
  } as never
}

/** Un botón pulsado. */
export function boton(
  desde: number,
  data: string,
  chat: { id: number; type: string } = privado(desde),
) {
  n += 1
  return {
    update_id: n,
    callback_query: {
      id: String(n),
      from: de(desde),
      chat_instance: 'x',
      data,
      message: { message_id: 1, date: 0, chat, text: 'tarjeta' },
    },
  } as never
}
