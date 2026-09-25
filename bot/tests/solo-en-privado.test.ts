import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Bot } from 'grammy'
import type { UserFromGetMe } from 'grammy/types'
import { openDb, type Db } from '../src/db/client'
import { createQueja, getQuejaViva, type NewQuejaInput } from '../src/db/queries'
import { registrarComandos } from '../src/commands/registrar'
import { COMANDOS_PUBLICOS, avisoPrivado } from '../src/services/solo-en-privado'
import type { Channel } from '../src/services/channel'
import type { MyContext } from '../src/types'

/**
 * Fuera de un chat privado, el bot sólo contesta lo que la web ya publica.
 *
 * Ningún comando miraba el tipo de chat, y `ctx.reply` contesta donde se escribió el
 * comando. Medido el 17-09-2026 con los manejadores de verdad: en un grupo, `/curar`
 * pintaba la ficha entera de un borrador sin revisar —título, resumen de máquina y la
 * cita del pleno—, `/batch` el lote y `/mis` las quejas de quien lo escribiera, a la
 * vista de todo el grupo.
 *
 * Se prueba el montaje de PRODUCCIÓN (`registrarComandos`, el mismo que llama
 * `index.ts`), y la lista de comandos sale del código, no de esta prueba: un comando
 * nuevo entra solo en la comprobación. Cada rechazo lleva su control al lado —el mismo
 * comando en privado, o un comando público en el grupo—, porque un bot que no contesta
 * a nada también «no filtra nada».
 */

const ADMIN = 42
const VECINA = 7
const BOT_INFO: UserFromGetMe = {
  id: 1,
  is_bot: true,
  first_name: 'Prueba',
  username: 'prueba_bot',
  can_join_groups: true,
  can_read_all_group_messages: false,
  can_manage_bots: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
  supports_join_request_queries: false,
}
const GRUPO = { id: -1001234567890, type: 'supergroup', title: 'Vecinos de Riba-roja' }
const privado = (id: number) => ({ id, type: 'private', first_name: 'Vecina' })
const TITULO_BORRADOR = 'TÍTULO DEL BORRADOR SIN REVISAR'

const CANAL_MUDO: Channel = {
  postNuevaQueja: async () => {},
  postApoyoMilestone: async () => {},
  postRegistrada: async () => {},
  postResuelta: async () => {},
  postSilencio: async () => {},
  postEscaladaSindic: async () => {},
}

let n = 0
function mensaje(texto: string, chat: object, de: number) {
  n += 1
  const orden = texto.startsWith('/') ? texto.split(/\s/)[0] : null
  return {
    update_id: n,
    message: {
      message_id: n,
      date: 1_700_000_000,
      chat,
      from: { id: de, is_bot: false, first_name: 'Vecina' },
      text: texto,
      ...(orden ? { entities: [{ type: 'bot_command', offset: 0, length: orden.length }] } : {}),
    },
  }
}

function queja(db: Db, autor: number): string {
  const input: NewQuejaInput = {
    telegram_user_id: autor,
    telegram_username: 'vecina',
    category: 'urbanismo',
    title: 'Una queja de una vecina',
    detail: 'Detalle de una queja escrita en privado, que nadie más tiene por qué leer.',
    lat: null,
    lng: null,
    neighborhood: 'casco',
    photo_file_id: null,
    concejalia_area: 'Urbanismo',
    concejal_slug: 'teresa-pozuelo-martin',
  }
  return createQueja(db, input).id
}

/**
 * Los comandos que registra el código del bot, leídos del propio código. Con
 * `soloDeAdmin`, sólo los de los ficheros que dan permisos con ADMIN_USER_IDS.
 */
function comandosRegistrados({ soloDeAdmin = false } = {}): string[] {
  const RAIZ = join(__dirname, '../src')
  const ts = (d: string): string[] =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? ts(join(d, e.name)) : e.name.endsWith('.ts') ? [join(d, e.name)] : [],
    )
  const nombres = new Set<string>()
  for (const f of ts(RAIZ)) {
    const src = readFileSync(f, 'utf8')
    if (soloDeAdmin && !src.includes('ADMIN_USER_IDS')) continue
    for (const m of src.matchAll(/\.command\(\s*(\[[^\]]*\]|'[^']*'|"[^"]*")/g)) {
      for (const nombre of m[1].matchAll(/['"]([^'"]+)['"]/g)) nombres.add(nombre[1])
    }
  }
  return [...nombres].sort()
}

describe('solo en privado', () => {
  const ENV = [
    'ADMIN_USER_IDS',
    'CURATION_QUEUE_PATH',
    'QUEJAS_PHOTOS_DIR',
    'GITHUB_DISPATCH_TOKEN',
  ] as const
  let antes: Record<string, string | undefined>
  let bot: Bot<MyContext>
  let db: Db
  let enviados: Array<{ chat_id: unknown; text: string }>

  beforeEach(() => {
    antes = Object.fromEntries(ENV.map((k) => [k, process.env[k]]))
    const dir = mkdtempSync(join(tmpdir(), 'cp-privado-'))
    const cola = join(dir, 'cola.json')
    writeFileSync(
      cola,
      JSON.stringify({
        generatedAt: '2026-09-17T00:00:00Z',
        items: [
          {
            ref: 'ref-1',
            finding: {
              id: 'f-1',
              title: TITULO_BORRADOR,
              summary: 'Resumen de máquina sobre lo que se dijo en el pleno.',
              plenoDate: '2026-03-27',
              quotes: [{ speakerGroup: 'PP', text: 'CITA DEL PLENO SIN REVISAR' }],
            },
            checks: [{ level: 'warn', message: 'aviso de la máquina' }],
          },
        ],
      }),
    )
    process.env.ADMIN_USER_IDS = String(ADMIN)
    process.env.CURATION_QUEUE_PATH = cola
    process.env.QUEJAS_PHOTOS_DIR = dir
    // /olvidar pide republicar a GitHub: sin token no sale nada a la red.
    delete process.env.GITHUB_DISPATCH_TOKEN

    db = openDb(':memory:')
    bot = new Bot<MyContext>('1:prueba', { botInfo: BOT_INFO })
    enviados = []
    bot.api.config.use(async (_prev, metodo, payload) => {
      if (metodo === 'sendMessage') {
        const p = payload as { chat_id: unknown; text: string }
        enviados.push({ chat_id: p.chat_id, text: p.text })
      }
      return {
        ok: true,
        result: { message_id: 1, date: 0, chat: { id: 0, type: 'private' } },
      } as never
    })
    registrarComandos(bot, db, CANAL_MUDO)
  })

  afterEach(() => {
    for (const k of ENV) {
      if (antes[k] === undefined) delete process.env[k]
      else process.env[k] = antes[k]
    }
  })

  const aviso = avisoPrivado(BOT_INFO.username)

  it('lee del código los comandos que hay (si no, lo de abajo no prueba nada)', () => {
    const todos = comandosRegistrados()
    expect(todos.length).toBeGreaterThanOrEqual(15)
    expect(todos).toEqual(expect.arrayContaining(['curar', 'batch', 'mis', 'olvidar', 'queja']))
  })

  it('cada comando no público, pedido en un grupo por el administrador, sólo recibe el aviso', async () => {
    const privados = comandosRegistrados().filter((c) => !COMANDOS_PUBLICOS.has(c))
    expect(privados.length).toBeGreaterThanOrEqual(10)
    const fugas: string[] = []
    for (const c of privados) {
      enviados.length = 0
      await bot.handleUpdate(mensaje(`/${c}`, GRUPO, ADMIN) as never)
      const soloAviso =
        enviados.length === 1 && enviados[0].chat_id === GRUPO.id && enviados[0].text === aviso
      if (!soloAviso) fugas.push(`/${c} → ${JSON.stringify(enviados).slice(0, 160)}`)
    }
    expect(fugas).toEqual([])
  })

  it('en privado, el administrador sí ve el borrador (el control)', async () => {
    await bot.handleUpdate(mensaje('/curar', privado(ADMIN), ADMIN) as never)
    expect(enviados).toHaveLength(1)
    expect(enviados[0].chat_id).toBe(ADMIN)
    expect(enviados[0].text).toContain(TITULO_BORRADOR)
  })

  it('/olvidar en un grupo no retira nada; en privado, sí (el control)', async () => {
    const id = queja(db, ADMIN)
    await bot.handleUpdate(mensaje(`/olvidar ${id}`, GRUPO, ADMIN) as never)
    expect(enviados.map((e) => e.text)).toEqual([aviso])
    expect(getQuejaViva(db, id)).not.toBeNull()

    enviados.length = 0
    await bot.handleUpdate(mensaje(`/olvidar ${id}`, privado(ADMIN), ADMIN) as never)
    expect(enviados).toHaveLength(1)
    expect(enviados[0].text).not.toBe(aviso)
    expect(getQuejaViva(db, id)).toBeNull()
  })

  it('/mis en un grupo no enseña las quejas de nadie; en privado, sí (el control)', async () => {
    queja(db, VECINA)
    await bot.handleUpdate(mensaje('/mis', GRUPO, VECINA) as never)
    expect(enviados.map((e) => e.text)).toEqual([aviso])

    enviados.length = 0
    await bot.handleUpdate(mensaje('/mis', privado(VECINA), VECINA) as never)
    expect(enviados).toHaveLength(1)
    expect(enviados[0].text).toContain('Una queja de una vecina')
  })

  it('los comandos públicos siguen contestando en un grupo, y los atajos del canal también', async () => {
    expect(COMANDOS_PUBLICOS.size).toBeGreaterThan(0)
    const id = queja(db, VECINA)
    const corto = id.replace('Q-', '').toLowerCase()
    const pruebas = [...COMANDOS_PUBLICOS].map((c) => `/${c}`)
    pruebas.push(`/apoyar_${corto}`, `/estado_${corto}`)
    const mudos: string[] = []
    for (const p of pruebas) {
      enviados.length = 0
      await bot.handleUpdate(mensaje(p, GRUPO, ADMIN) as never)
      const contesto = enviados.length > 0 && enviados.every((e) => e.text !== aviso)
      if (!contesto) mudos.push(`${p} → ${JSON.stringify(enviados).slice(0, 120)}`)
    }
    expect(mudos).toEqual([])
  })

  it('COMANDOS_PUBLICOS sólo nombra comandos que existen', () => {
    const todos = new Set(comandosRegistrados())
    expect([...COMANDOS_PUBLICOS].filter((c) => !todos.has(c))).toEqual([])
  })

  it('ningún comando de administración es público', () => {
    const deAdmin = comandosRegistrados({ soloDeAdmin: true })
    // El control: la lectura encuentra los de administración que ya sabemos que hay.
    expect(deAdmin).toEqual(expect.arrayContaining(['curar', 'batch', 'escalar']))
    expect(deAdmin.filter((c) => COMANDOS_PUBLICOS.has(c))).toEqual([])
  })

  /**
   * Esto SÍ repite la lista, y a propósito. La prueba de arriba toma por privado todo lo
   * que no esté en COMANDOS_PUBLICOS, así que meter ahí un comando por error lo sacaría
   * también de la comprobación, sin que nada se pusiera en rojo. Ampliar la lista es una
   * decisión de privacidad: con esto se hace en dos sitios y se ve en la PR.
   */
  it('la lista de públicos es la acordada', () => {
    expect([...COMANDOS_PUBLICOS].sort()).toEqual([
      'apoyar',
      'barrio',
      'digest',
      'estado',
      'help',
      'ranking',
      'start',
    ])
  })

  it('en un grupo, lo que no es un comando para este bot no recibe respuesta', async () => {
    await bot.handleUpdate(mensaje('hola a todos', GRUPO, VECINA) as never)
    await bot.handleUpdate(mensaje('/mis@otro_bot', GRUPO, VECINA) as never)
    expect(enviados).toEqual([])
    // El control: dirigido a ESTE bot sí se contesta, con el aviso.
    await bot.handleUpdate(mensaje(`/mis@${BOT_INFO.username}`, GRUPO, VECINA) as never)
    expect(enviados.map((e) => e.text)).toEqual([aviso])
  })

  it('en un canal no se contesta nada, y un comando allí no revienta', async () => {
    n += 1
    const post = {
      update_id: n,
      channel_post: {
        message_id: n,
        date: 1_700_000_000,
        chat: { id: -100999, type: 'channel', title: 'Canal' },
        text: '/mis',
        entities: [{ type: 'bot_command', offset: 0, length: 4 }],
      },
    }
    await expect(bot.handleUpdate(post as never)).resolves.toBeUndefined()
    expect(enviados).toEqual([])
  })

  it('index.ts monta los comandos con registrarComandos y no registra manejadores por su cuenta', () => {
    const sinComentarios = (s: string) =>
      s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    const indice = sinComentarios(readFileSync(join(__dirname, '../src/index.ts'), 'utf8'))
    expect(indice).toContain('registrarComandos(')
    expect(indice.match(/\bbot\.(command|hears|on|use)\(/g)).toBeNull()
  })
})
