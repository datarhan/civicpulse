import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Bot } from 'grammy'
import type { UserFromGetMe } from 'grammy/types'
import { openDb, type Db } from '../src/db/client'
import {
  addApoyo,
  addSubscription,
  autorTelegram,
  createQueja,
  idCiudadano,
} from '../src/db/queries'
import { olvidarTodo } from '../src/services/ciudadano'
import { registrarComandos } from '../src/commands/registrar'
import { HITOS_MUDOS } from '../src/services/avisos-hitos'
import type { MyContext } from '../src/types'

/**
 * «Borrar mis datos»: todo lo que el bot guarda de una persona, de una vez.
 *
 * `/olvidar` retira una queja; el aviso legal promete además el derecho de
 * supresión entero (RGPD art. 17), y no había forma de ejercerlo: los apoyos y
 * las suscripciones de alguien se quedaban con su id de Telegram para siempre.
 * Cada queja pasa por la misma retirada que `/olvidar` (el texto queda, sin
 * autor, el plazo legal); sus apoyos, sus suscripciones y su fila de ciudadano
 * se borran; y la respuesta cuenta lo intentado y lo hecho por separado.
 */
const VECINA = autorTelegram(1001)
const VECINO = autorTelegram(1002)

let db: Db
let fotos: string
beforeEach(() => {
  db = openDb(':memory:')
  fotos = mkdtempSync(join(tmpdir(), 'cp-fotos-'))
})
afterEach(() => rmSync(fotos, { recursive: true, force: true }))

const nueva = (autor = VECINA) =>
  createQueja(db, {
    autor,
    category: 'limpieza',
    title: 'Contenedores desbordados',
    detail: 'Los contenedores de la esquina llevan una semana sin vaciarse.',
    lat: 39.54,
    lng: -0.57,
  }).id

describe('olvidarTodo', () => {
  it('retira sus quejas, borra sus apoyos, sus suscripciones y a la persona', () => {
    const suyas = [nueva(), nueva()]
    const ajena = nueva(VECINO)
    addApoyo(db, ajena, VECINA)
    addSubscription(db, 1001, 'barrio', 'el-molinet')
    for (const id of suyas) writeFileSync(join(fotos, `${id.toLowerCase()}.jpg`), 'x')

    const r = olvidarTodo(db, VECINA, fotos)
    expect(r).toEqual({
      quejas: { intentadas: 2, retiradas: 2 },
      apoyos: 1,
      suscripciones: 1,
      ciudadano: true,
    })
    expect(idCiudadano(db, VECINA)).toBeNull()
    for (const id of suyas) {
      const fila = db
        .prepare('SELECT ciudadano_id, deleted_at FROM quejas WHERE id = ?')
        .get(id) as {
        ciudadano_id: number | null
        deleted_at: string | null
      }
      expect(fila.ciudadano_id).toBeNull()
      expect(fila.deleted_at).not.toBeNull()
      expect(existsSync(join(fotos, `${id.toLowerCase()}.jpg`))).toBe(false)
    }
    expect(db.prepare('SELECT COUNT(*) AS n FROM apoyos WHERE queja_id = ?').get(ajena)).toEqual({
      n: 0,
    })
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM subscriptions WHERE telegram_user_id = 1001').get(),
    ).toEqual({
      n: 0,
    })
    // Lo de los demás, intacto.
    expect(idCiudadano(db, VECINO)).not.toBeNull()
    expect(db.prepare('SELECT deleted_at FROM quejas WHERE id = ?').get(ajena)).toEqual({
      deleted_at: null,
    })
  })

  it('de quien no tiene nada, no borra nada ni crea a nadie', () => {
    nueva(VECINO)
    const r = olvidarTodo(db, autorTelegram(1999), fotos)
    expect(r).toEqual({
      quejas: { intentadas: 0, retiradas: 0 },
      apoyos: 0,
      suscripciones: 0,
      ciudadano: false,
    })
    expect(idCiudadano(db, autorTelegram(1999))).toBeNull()
  })
})

describe('/borrar_mis_datos', () => {
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
  const CHAT = { id: 1001, type: 'private' as const, first_name: 'Vecina' }
  const DE = { id: 1001, is_bot: false, first_name: 'Vecina' }
  let bot: Bot<MyContext>
  let enviados: Array<{ texto: string; botones: string[] }>

  beforeEach(() => {
    enviados = []
    const fetchFalso = (async (url: string | URL | Request, init?: RequestInit) => {
      const cuerpo = init?.body ? JSON.parse(String(init.body)) : {}
      if (String(url).endsWith('/sendMessage')) {
        const teclado = cuerpo.reply_markup?.inline_keyboard ?? []
        enviados.push({
          texto: String(cuerpo.text),
          botones: teclado.flat().map((b: { callback_data: string }) => b.callback_data),
        })
      }
      return new Response(
        JSON.stringify({ ok: true, result: { message_id: 1, date: 0, chat: CHAT } }),
        {
          headers: { 'content-type': 'application/json' },
        },
      )
    }) as typeof fetch
    bot = new Bot<MyContext>('1:prueba', { botInfo: BOT_INFO, client: { fetch: fetchFalso } })
    registrarComandos(bot, db, HITOS_MUDOS)
  })

  it('pide confirmación antes de borrar, y con ella borra y lo cuenta', async () => {
    const id = nueva()
    await bot.handleUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        date: 0,
        chat: CHAT,
        from: DE,
        text: '/borrar_mis_datos',
        entities: [{ type: 'bot_command', offset: 0, length: '/borrar_mis_datos'.length }],
      },
    } as never)
    // Aún no ha borrado nada: sólo pregunta, con un botón.
    expect(idCiudadano(db, VECINA)).not.toBeNull()
    const pregunta = enviados.at(-1)!
    expect(pregunta.botones.length).toBeGreaterThan(0)

    await bot.handleUpdate({
      update_id: 2,
      callback_query: {
        id: '9',
        from: DE,
        chat_instance: 'x',
        data: pregunta.botones[0],
        message: { message_id: 1, date: 0, chat: CHAT, text: 'confirma' },
      },
    } as never)
    expect(idCiudadano(db, VECINA)).toBeNull()
    expect(db.prepare('SELECT deleted_at FROM quejas WHERE id = ?').get(id)).not.toEqual({
      deleted_at: null,
    })
    expect(enviados.at(-1)!.texto).toMatch(/1 de 1/)
  })
})
