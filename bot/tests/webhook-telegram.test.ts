import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { Bot } from 'grammy'
import type { UserFromGetMe } from 'grammy/types'
import {
  secretoDelWebhook,
  webhookTelegram,
  type WebhookTelegram,
} from '../src/services/webhook-telegram'

/**
 * El webhook sólo atiende a Telegram.
 *
 * Hasta el 17-09-2026 el bot registraba el webhook sin `secret_token` y montaba el
 * manejador de grammy sin `secretToken`, y grammy, sin token, acepta cualquier
 * petición. El bot decide autoría y permisos con el `from.id` que trae el update, así
 * que un update inventado podía hacerse pasar por cualquiera, administrador incluido.
 * Lo delató el log de producción: una petición vacía pasó la comprobación y reventó al
 * leer el JSON.
 *
 * Se prueba con un servidor HTTP de verdad y un `Bot` de grammy de verdad, con la API
 * interceptada: lo que importa es lo que pasa entre la cabecera y el manejador, y un
 * doble de `req`/`res` no lee cuerpos ni cabeceras como Node. Cada rechazo lleva su
 * control aceptado al lado, porque «no se procesó nada» también lo cumple un servidor
 * que lo rechaza todo — y un bot que lo rechaza todo está mudo.
 */

const TOKEN = '123456:token-de-prueba-del-bot'
const URL_WEBHOOK = 'https://bot.test'
const BOT_INFO: UserFromGetMe = {
  id: 123456,
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

function update(id: number, deUsuario = 42) {
  return {
    update_id: id,
    message: {
      message_id: id,
      date: 1_700_000_000,
      chat: { id: deUsuario, type: 'private', first_name: 'Ana' },
      from: { id: deUsuario, is_bot: false, first_name: 'Ana' },
      text: '/mis',
    },
  }
}

describe('secretoDelWebhook', () => {
  it('es estable para un mismo token y cabe en lo que Telegram admite', () => {
    const s = secretoDelWebhook(TOKEN)
    expect(secretoDelWebhook(TOKEN)).toBe(s)
    // Telegram: 1–256 caracteres de [A-Za-z0-9_-].
    expect(s).toMatch(/^[A-Za-z0-9_-]{1,256}$/)
  })

  it('cambia con el token, y no lo contiene', () => {
    const s = secretoDelWebhook(TOKEN)
    expect(secretoDelWebhook('654321:otro-token')).not.toBe(s)
    expect(s).not.toContain(TOKEN.split(':')[1])
  })

  it('sin token no inventa uno: falla', () => {
    expect(() => secretoDelWebhook('')).toThrow(/BOT_TOKEN/)
    expect(() => secretoDelWebhook('   ')).toThrow(/BOT_TOKEN/)
  })
})

describe('webhookTelegram', () => {
  let server: Server
  let base: string
  let telegram: WebhookTelegram
  let vistos: number[]
  let llamadas: Array<{ metodo: string; payload: Record<string, unknown> }>

  beforeEach(async () => {
    const bot = new Bot(TOKEN, { botInfo: BOT_INFO })
    vistos = []
    llamadas = []
    // Nada sale a Telegram: cada llamada a la API se apunta y contesta «ok».
    bot.api.config.use(async (_prev, metodo, payload) => {
      llamadas.push({ metodo, payload: payload as Record<string, unknown> })
      return { ok: true, result: true } as never
    })
    bot.on('message', (ctx) => {
      vistos.push(ctx.update.update_id)
    })
    telegram = webhookTelegram(bot, { url: URL_WEBHOOK, token: TOKEN })
    server = createServer((req, res) => void telegram.atender(req, res))
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterEach(() => new Promise<void>((r) => server.close(() => r())))

  function post(ruta: string, cuerpo: unknown, secreto?: string) {
    return fetch(`${base}${ruta}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(secreto ? { 'x-telegram-bot-api-secret-token': secreto } : {}),
      },
      body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
    })
  }

  it('con el secreto, el update llega al bot (el control)', async () => {
    const r = await post('/', update(1), secretoDelWebhook(TOKEN))
    expect(r.status).toBe(200)
    expect(vistos).toEqual([1])
  })

  it('sin la cabecera, 401 y el bot no ve nada', async () => {
    const r = await post('/', update(2))
    expect(r.status).toBe(401)
    expect(vistos).toEqual([])
  })

  it('con un secreto equivocado del mismo largo, 401', async () => {
    const bueno = secretoDelWebhook(TOKEN)
    const malo = (bueno[0] === 'a' ? 'b' : 'a') + bueno.slice(1)
    const r = await post('/', update(3), malo)
    expect(r.status).toBe(401)
    expect(vistos).toEqual([])
  })

  it('con el secreto de OTRO bot, 401', async () => {
    const r = await post('/', update(4), secretoDelWebhook('654321:otro-token'))
    expect(r.status).toBe(401)
    expect(vistos).toEqual([])
  })

  it('rechaza sin leer el cuerpo: basura sin cabecera es 401, no un 500 al parsear', async () => {
    // Lo que se vio en producción: una petición sin JSON llegaba a `JSON.parse`.
    const r = await post('/', 'esto no es json')
    expect(r.status).toBe(401)
    expect(vistos).toEqual([])
  })

  it('lo que no es POST a la ruta registrada es 404, aunque traiga el secreto', async () => {
    const secreto = secretoDelWebhook(TOKEN)
    const get = await fetch(`${base}/`, { headers: { 'x-telegram-bot-api-secret-token': secreto } })
    expect(get.status).toBe(404)
    const otraRuta = await post('/otra-ruta', update(5), secreto)
    expect(otraRuta.status).toBe(404)
    expect(vistos).toEqual([])
  })

  it('registra en Telegram el MISMO secreto que exige: si no, el bot se queda mudo', async () => {
    await telegram.registrar()
    const alta = llamadas.filter((l) => l.metodo === 'setWebhook')
    expect(alta).toHaveLength(1)
    expect(alta[0].payload.url).toBe(URL_WEBHOOK)
    const secreto = alta[0].payload.secret_token
    expect(typeof secreto, 'setWebhook sin secret_token').toBe('string')
    // Telegram manda en cada update lo que se registró: con eso, tiene que pasar.
    const r = await post('/', update(6), secreto as string)
    expect(r.status).toBe(200)
    expect(vistos).toEqual([6])
  })
})

describe('el webhook se monta en un solo sitio', () => {
  it('nadie fuera de services/webhook-telegram.ts llama a webhookCallback ni a setWebhook', () => {
    const RAIZ = join(__dirname, '../src')
    const ts = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? ts(join(d, e.name)) : e.name.endsWith('.ts') ? [join(d, e.name)] : [],
      )
    const sinComentarios = (s: string) =>
      s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    const montan = (f: string) =>
      /\b(webhookCallback|setWebhook)\(/.test(sinComentarios(readFileSync(f, 'utf8')))
    const ficheros = ts(RAIZ)
    expect(ficheros.length, 'no lee el código del bot').toBeGreaterThan(20)
    const propio = join('services', 'webhook-telegram.ts')
    // El control: el módulo sí los llama, así que la expresión evalúa algo.
    expect(montan(ficheros.find((f) => f.endsWith(propio))!)).toBe(true)
    const otros = ficheros
      .filter((f) => !f.endsWith(propio))
      .filter(montan)
      .map((f) => f.slice(RAIZ.length + 1))
      .sort()
    expect(otros).toEqual([])
  })
})
