import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Bot } from 'grammy'
import type { UserFromGetMe } from 'grammy/types'
import { openDb, type Db } from '../src/db/client'
import { registrarComandos } from '../src/commands/registrar'
import { HITOS_MUDOS } from '../src/services/avisos-hitos'
import type { MyContext } from '../src/types'

/**
 * La queja por Telegram, mientras siga siendo la vía (el plan la lleva a
 * WhatsApp): un flujo a medias no puede tragarse lo que venga después.
 *
 * Medido el 2026-09-27 con el plugin de verdad: la conversación de `/queja` no
 * tenía plazo, así que un vecino que la dejaba en «escribe un título» y días
 * después mandaba `/mis` veía cómo su orden se convertía en el TÍTULO de una
 * queja; dos mensajes más y se publicaba. Y cualquier texto en el paso de la
 * ubicación contaba como «saltar», también una dirección escrita, y una
 * ubicación de otro municipio se aceptaba sin más.
 */
const VECINA = 7
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
const CHAT = { id: VECINA, type: 'private', first_name: 'Vecina' }
const DE = { id: VECINA, is_bot: false, first_name: 'Vecina' }

let n = 0
const texto = (t: string) => {
  n += 1
  const orden = t.startsWith('/') ? t.split(/\s/)[0] : null
  return {
    update_id: n,
    message: {
      message_id: n,
      date: Math.floor(Date.now() / 1000),
      chat: CHAT,
      from: DE,
      text: t,
      ...(orden ? { entities: [{ type: 'bot_command', offset: 0, length: orden.length }] } : {}),
    },
  }
}
const ubicacion = (latitude: number, longitude: number) => {
  n += 1
  return {
    update_id: n,
    message: {
      message_id: n,
      date: Math.floor(Date.now() / 1000),
      chat: CHAT,
      from: DE,
      location: { latitude, longitude },
    },
  }
}
const boton = (data: string) => {
  n += 1
  return {
    update_id: n,
    callback_query: {
      id: String(n),
      from: DE,
      chat_instance: 'x',
      data,
      message: { message_id: 1, date: 0, chat: CHAT, text: 'categorías' },
    },
  }
}

describe('la queja por Telegram no se traga lo que viene después', () => {
  let bot: Bot<MyContext>
  let db: Db
  let enviados: string[]
  let contestados: string[]

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-27T10:00:00Z'))
    db = openDb(':memory:')
    enviados = []
    contestados = []
    // El `fetch` del cliente, y no un transformador de `bot.api`: el plugin de
    // conversaciones construye su propia `Api` con las OPCIONES del bot pero sin
    // sus transformadores, y lo de dentro de la conversación salía a la red.
    const fetchFalso = (async (url: string | URL | Request, init?: RequestInit) => {
      const metodo = String(url).split('/').pop()
      const cuerpo = init?.body ? JSON.parse(String(init.body)) : {}
      if (metodo === 'sendMessage') enviados.push(String(cuerpo.text))
      if (metodo === 'answerCallbackQuery') contestados.push(String(cuerpo.text ?? ''))
      const result =
        metodo === 'sendMessage' ? { message_id: 1, date: 0, chat: CHAT, text: cuerpo.text } : true
      return new Response(JSON.stringify({ ok: true, result }), {
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch
    bot = new Bot<MyContext>('1:prueba', { botInfo: BOT_INFO, client: { fetch: fetchFalso } })
    registrarComandos(bot, db, HITOS_MUDOS)
  })

  afterEach(() => vi.useRealTimers())

  const quejas = () => (db.prepare('SELECT COUNT(*) AS n FROM quejas').get() as { n: number }).n
  const empezar = async () => {
    await bot.handleUpdate(texto('/queja') as never)
    await bot.handleUpdate(boton('cat:alumbrado') as never)
    expect(enviados.join('\n')).toMatch(/título breve/) // el control: estamos en el paso del título
  }

  it('una orden a mitad del flujo lo termina y la contesta su manejador', async () => {
    await empezar()
    enviados = []
    await bot.handleUpdate(texto('/mis') as never)
    expect(enviados.join('\n')).toMatch(/No tienes quejas/)
    expect(enviados.join('\n')).not.toMatch(/Describe lo que pasa/)
    expect(quejas()).toBe(0)
  })

  it('y avisa de que la queja se queda a medias, en vez de perderla en silencio', async () => {
    await empezar()
    enviados = []
    await bot.handleUpdate(texto('/mis') as never)
    expect(enviados.join('\n')).toMatch(/se queda a medias/)
  })

  it('un botón de categoría que ya no sirve se contesta, no se queda girando', async () => {
    await bot.handleUpdate(boton('cat:alumbrado') as never)
    expect(contestados.join('\n')).toMatch(/ya no sirve/)
    // el control: dentro de una queja viva, ese mismo botón elige la categoría
    contestados = []
    await empezar()
    expect(contestados.join('\n')).not.toMatch(/ya no sirve/)
  })

  it('sin queja en curso, un álbum recibe UNA respuesta y un mensaje de servicio ninguna', async () => {
    const foto = (grupo: string) => {
      n += 1
      return {
        update_id: n,
        message: {
          message_id: n,
          date: Math.floor(Date.now() / 1000),
          chat: CHAT,
          from: DE,
          media_group_id: grupo,
          photo: [{ file_id: `f${n}`, file_unique_id: `u${n}`, width: 1, height: 1 }],
        },
      }
    }
    await bot.handleUpdate(foto('album-1') as never)
    await bot.handleUpdate(foto('album-1') as never)
    await bot.handleUpdate(foto('album-1') as never)
    expect(enviados.filter((t) => /ninguna queja tuya en curso/.test(t))).toHaveLength(1)
    enviados = []
    n += 1
    await bot.handleUpdate({
      update_id: n,
      message: {
        message_id: n,
        date: Math.floor(Date.now() / 1000),
        chat: CHAT,
        from: DE,
        message_auto_delete_timer_changed: { message_auto_delete_time: 86400 },
      },
    } as never)
    expect(enviados).toEqual([])
    // el control: un texto suelto sí recibe la respuesta
    await bot.handleUpdate(texto('hola') as never)
    expect(enviados.join('\n')).toMatch(/ninguna queja tuya en curso/)
  })

  it('también en el paso de la categoría, donde se esperaba un botón', async () => {
    await bot.handleUpdate(texto('/queja') as never)
    enviados = []
    await bot.handleUpdate(texto('/mis') as never)
    expect(enviados.join('\n')).toMatch(/No tienes quejas/)
  })

  it('pasada media hora, lo siguiente no se toma como el título, y se dice', async () => {
    await empezar()
    enviados = []
    vi.setSystemTime(new Date('2026-09-27T10:31:00Z'))
    await bot.handleUpdate(texto('Hola, ¿cómo va lo de la farola?') as never)
    expect(enviados.join('\n')).not.toMatch(/Describe lo que pasa/)
    // Callar dejaría al vecino esperando una respuesta que no llega.
    expect(enviados.join('\n')).toMatch(/\/queja/)
    expect(quejas()).toBe(0)
  })

  it('una dirección escrita no cuenta como «saltar»', async () => {
    await empezar()
    await bot.handleUpdate(texto('Farola apagada en la plaza') as never)
    await bot.handleUpdate(
      texto(
        'La farola de la plaza lleva apagada desde el lunes y la calle queda a oscuras.',
      ) as never,
    )
    enviados = []
    await bot.handleUpdate(texto('Calle Mayor 5') as never)
    expect(enviados.join('\n')).toMatch(/saltar/)
    expect(enviados.join('\n')).not.toMatch(/\*Foto\*/)
    // «saltar» sí.
    enviados = []
    await bot.handleUpdate(texto('Saltar') as never)
    expect(enviados.join('\n')).toMatch(/Foto/)
  })

  it('una ubicación fuera del término se vuelve a pedir', async () => {
    await empezar()
    await bot.handleUpdate(texto('Farola apagada en la plaza') as never)
    await bot.handleUpdate(
      texto(
        'La farola de la plaza lleva apagada desde el lunes y la calle queda a oscuras.',
      ) as never,
    )
    enviados = []
    await bot.handleUpdate(ubicacion(39.4699, -0.3763) as never) // València
    expect(enviados.join('\n')).toMatch(/fuera del término/)
    expect(enviados.join('\n')).not.toMatch(/\*Foto\*/)
    // Una de dentro sí sigue.
    enviados = []
    await bot.handleUpdate(ubicacion(39.5467, -0.5697) as never) // el Ajuntament
    expect(enviados.join('\n')).toMatch(/Foto/)
  })
})
