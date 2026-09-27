import { describe, it, expect, beforeEach } from 'vitest'
import { Bot } from 'grammy'
import type { UserFromGetMe } from 'grammy/types'
import { openDb, type Db } from '../src/db/client'
import { createQueja } from '../src/db/queries'
import { registrarComandos } from '../src/commands/registrar'
import type { Channel } from '../src/services/channel'
import type { MyContext } from '../src/types'

/**
 * El bot imprime `/estado_${id sin «Q-», en minúsculas}`, y el sufijo es base32
 * de Crockford: una de cada 32 quejas empieza por Q. El lector de `/estado`
 * quitaba esa Q creyéndola el prefijo, y el atajo llevaba a otra queja o a «no
 * encuentro». Se prueba con el bot de verdad (services/queja-id.ts tiene el
 * lector único).
 */
describe('el atajo /estado_q… lleva a su queja', () => {
  const BOT_INFO: UserFromGetMe = {
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
  const CANAL_MUDO: Channel = {
    postNuevaQueja: async () => {},
    postApoyoMilestone: async () => {},
    postRegistrada: async () => {},
    postResuelta: async () => {},
    postSilencio: async () => {},
    postEscaladaSindic: async () => {},
  }
  let db: Db
  let bot: Bot<MyContext>
  let enviados: string[]

  beforeEach(() => {
    db = openDb(':memory:')
    enviados = []
    const fetchFalso = (async (url: string | URL | Request, init?: RequestInit) => {
      const cuerpo = init?.body ? JSON.parse(String(init.body)) : {}
      if (String(url).endsWith('/sendMessage')) enviados.push(String(cuerpo.text))
      return new Response(
        JSON.stringify({
          ok: true,
          result: { message_id: 1, date: 0, chat: { id: 7, type: 'private' } },
        }),
        { headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch
    bot = new Bot<MyContext>('1:prueba', { botInfo: BOT_INFO, client: { fetch: fetchFalso } })
    registrarComandos(bot, db, CANAL_MUDO)
  })

  it('una queja cuyo sufijo empieza por Q', async () => {
    const q = createQueja(db, {
      telegram_user_id: 1001,
      category: 'alumbrado',
      title: 'Farola apagada en la plaza',
      detail: 'La farola de la plaza lleva apagada desde el lunes y la calle queda a oscuras.',
    })
    // El id lo pone el generador; se fija uno que empieza por Q, como uno de cada 32.
    db.pragma('foreign_keys = OFF')
    db.prepare('UPDATE quejas SET id = ? WHERE id = ?').run('Q-QRST0123', q.id)
    db.prepare('UPDATE events SET queja_id = ? WHERE queja_id = ?').run('Q-QRST0123', q.id)
    db.pragma('foreign_keys = ON')
    const atajo = '/estado_qrst0123' // lo que imprime el bot: `/estado_${id sin «Q-», en minúsculas}`
    await bot.handleUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        date: 0,
        chat: { id: 7, type: 'private', first_name: 'Vecina' },
        from: { id: 7, is_bot: false, first_name: 'Vecina' },
        text: atajo,
        entities: [{ type: 'bot_command', offset: 0, length: atajo.length }],
      },
    } as never)
    expect(enviados.join('\n')).toMatch(/Farola apagada en la plaza/)
  })
})
