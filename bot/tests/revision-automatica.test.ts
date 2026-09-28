import { describe, it, expect, beforeEach } from 'vitest'
import { openDb, type Db } from '../src/db/client'
import {
  autorTelegram,
  createQueja,
  decidirModeracion,
  getQueja,
  listEvents,
  softDeleteQueja,
} from '../src/db/queries'
import { avisarAdmins, type EnvioAdmin } from '../src/services/avisos-admin'
import { MARCA_RETIRADO } from '../src/services/pii'
import { buildSnapshot } from '../src/services/snapshot'
import { buildHealth } from '../src/services/health'
import { CLAVE_MEDICION, VERSION_PROMPT } from '../src/services/moderacion-criterios'
import { estadoRevision, pasadaDeRevision, type DepsRevision } from '../src/services/moderacion'

/**
 * La revisión automática, de punta a punta sin red: una queja nueva, lo que
 * contesta Gemini (escrito a mano, sintético: el repositorio es público), lo que
 * queda en la base, lo que ven quien modera y su autora, y lo que se publica.
 */
const VECINA = 1001
const ADMIN = 9001
const NOMBRE = 'Paco García'
const AHORA = new Date('2026-10-05T10:00:00Z')

let db: Db
beforeEach(() => {
  db = openDb(':memory:')
})

function nuevaQueja(
  detalle = `La farola de la calle Mayor lleva una semana apagada; ${NOMBRE}, el del quiosco, lo vio.`,
) {
  return createQueja(db, {
    autor: autorTelegram(VECINA),
    category: 'alumbrado',
    title: 'Farola apagada en la calle Mayor',
    detail: detalle,
    neighborhood: 'el-molinet',
  })
}

type Respuesta = { retirar: unknown; motivos: unknown } | { status: number } | 'bloqueada'

/** Un Gemini falso: contesta, por orden, lo que se le da, y apunta cada llamada. */
function gemini(...respuestas: Respuesta[]) {
  const llamadas: Array<{ url: string; init: RequestInit }> = []
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    llamadas.push({ url: String(url), init: init ?? {} })
    const r = respuestas.shift()
    if (!r) throw new Error('el Gemini falso no tiene más respuestas')
    if (r === 'bloqueada') {
      return new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }), {
        status: 200,
      })
    }
    if ('status' in r) return new Response('{"error":{"message":"texto de la queja"}}', r)
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(r) }] }, finishReason: 'STOP' }],
      }),
      { status: 200 },
    )
  }) as typeof fetch
  return { fetchImpl, llamadas }
}

/** Un Telegram falso para quien modera: apunta lo que se manda y lo que se edita. */
function telegram() {
  const t = {
    enviados: [] as Array<{ admin: number; html: string }>,
    editados: [] as Array<{ admin: number; html: string }>,
    mensajes: [] as Array<{ chat: number; texto: string }>,
    enviar: async (admin: number, html: string) => {
      t.enviados.push({ admin, html })
      return { message_id: 500 + t.enviados.length }
    },
    editar: async (admin: number, _m: number, html: string) => {
      t.editados.push({ admin, html })
    },
    mensaje: async (chat: number, texto: string) => {
      t.mensajes.push({ chat, texto })
      return { message_id: 900 + t.mensajes.length }
    },
  }
  return t satisfies EnvioAdmin
}

const medida = [
  { key: CLAVE_MEDICION, precision: 1, sample: 90, measuredAt: '2026-10-01T00:00:00Z' },
]

function deps(
  g: ReturnType<typeof gemini>,
  tg: ReturnType<typeof telegram>,
  o: Partial<DepsRevision> = {},
) {
  const republicadas: string[] = []
  const d: DepsRevision = {
    db,
    env: { GEMINI_API_KEY: 'clave-de-prueba', GEMINI_NIVEL: 'pago' },
    envio: tg,
    admins: () => [ADMIN],
    fetchImpl: g.fetchImpl,
    cargos: () => ['Cargo Uno (alcalde)'],
    medidas: () => medida,
    congelado: () => false,
    republicar: async () => {
      republicadas.push('pedida')
      return 'pedida'
    },
    ahora: () => AHORA,
    ...o,
  }
  return { d, republicadas }
}

const revisiones = (id: string) =>
  db
    .prepare('SELECT * FROM revisiones_automaticas WHERE queja_id = ? ORDER BY id')
    .all(id) as Array<Record<string, unknown>>

/** Cada tabla y columna donde aparece un texto. */
function dondeAparece(texto: string): string[] {
  const tablas = db
    .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as Array<{ name: string }>
  const vistos = new Set<string>()
  for (const { name } of tablas) {
    for (const fila of db.prepare(`SELECT * FROM "${name}"`).all() as Record<string, unknown>[]) {
      for (const [col, v] of Object.entries(fila)) {
        if (v !== null && String(v).includes(texto)) vistos.add(`${name}.${col}`)
      }
    }
  }
  return [...vistos].sort()
}

describe('una queja limpia, con la publicación automática medida', () => {
  it('se publica sola: su autora lo sabe, las tarjetas lo dicen y se pide republicar', async () => {
    const q = nuevaQueja(
      'La farola de la calle Mayor lleva una semana apagada y la calle queda a oscuras.',
    )
    const tg = telegram()
    await avisarAdmins(db, q, { admins: [ADMIN], envio: tg })
    const { d, republicadas } = deps(gemini({ retirar: [], motivos: [] }), tg)

    const r = await pasadaDeRevision(d)

    expect(r).toMatchObject({ intentadas: 1, limpias: 1, publicadas: 1 })
    expect(getQueja(db, q.id)).toMatchObject({ moderacion: 'publicada' })
    expect(revisiones(q.id)).toMatchObject([
      {
        resultado: 'limpia',
        motivos: '[]',
        retirados: 0,
        error: null,
        version_prompt: VERSION_PROMPT,
      },
    ])
    expect(
      db.prepare('SELECT decision, por FROM moderaciones WHERE queja_id = ?').all(q.id),
    ).toEqual([{ decision: 'publicada', por: 'revision-automatica' }])
    expect(
      buildSnapshot(db, 1000, { photoUrlFor: () => null }).items.map((i) => i.service_request_id),
    ).toEqual([q.id])
    expect(tg.mensajes).toEqual([{ chat: VECINA, texto: expect.stringContaining('ya es pública') }])
    expect(tg.editados.at(-1)?.html).toMatch(/Publicada/)
    expect(tg.editados.at(-1)?.html).toMatch(/Revisión automática: nada que retener/)
    expect(republicadas).toEqual(['pedida'])
  })

  it('una segunda pasada no vuelve a llamar al modelo, aunque la queja siga esperando', async () => {
    nuevaQueja()
    const g = gemini({ retirar: [NOMBRE], motivos: [] })
    const { d } = deps(g, telegram(), { medidas: () => [] })
    await pasadaDeRevision(d)
    const r = await pasadaDeRevision(d)
    expect(g.llamadas).toHaveLength(1)
    expect(r).toMatchObject({ intentadas: 0 })
  })
})

describe('lo que quita el modelo no se guarda en el bot', () => {
  it('el nombre sale del texto guardado, y no queda en ninguna tabla', async () => {
    const q = nuevaQueja()
    expect(dondeAparece(NOMBRE)).toEqual(['quejas.detail']) // el control
    const tg = telegram()
    const { d } = deps(gemini({ retirar: [NOMBRE], motivos: [] }), tg)
    await pasadaDeRevision(d)
    expect(dondeAparece(NOMBRE)).toEqual([])
    expect(getQueja(db, q.id)?.detail).toContain(`${MARCA_RETIRADO}, el del quiosco`)
    expect(revisiones(q.id)).toMatchObject([{ resultado: 'limpia', retirados: 1 }])
    // Queda cuántos, no cuáles, y su autora lo ve en /estado.
    expect(listEvents(db, q.id).find((e) => e.kind === 'datos_retirados_revision')?.payload).toBe(
      JSON.stringify({ retirados: 1 }),
    )
    // Y su aviso lo dice.
    expect(tg.mensajes[0]?.texto).toMatch(/quitó 1 fragmento/)
  })
})

describe('sin una medición que lo permita', () => {
  it('la revisión queda anotada, y la queja espera a una persona, que lo lee en su tarjeta', async () => {
    const q = nuevaQueja()
    const tg = telegram()
    await avisarAdmins(db, q, { admins: [ADMIN], envio: tg })
    const { d, republicadas } = deps(gemini({ retirar: [NOMBRE], motivos: [] }), tg, {
      medidas: () => [],
    })
    const r = await pasadaDeRevision(d)
    expect(r).toMatchObject({ limpias: 1, publicadas: 0, aUnaPersona: 1 })
    expect(getQueja(db, q.id)).toMatchObject({ moderacion: 'pendiente' })
    // El texto ya va sin el nombre: lo que una persona publique, lo publica así.
    expect(getQueja(db, q.id)?.detail).not.toContain(NOMBRE)
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM moderaciones WHERE queja_id = ?').get(q.id),
    ).toEqual({ n: 0 })
    expect(tg.editados.at(-1)?.html).toMatch(/publicación automática no está permitida/)
    expect(tg.editados.at(-1)?.html).not.toContain(NOMBRE)
    expect(tg.mensajes).toEqual([])
    expect(republicadas).toEqual([])
  })
})

describe('una queja que tiene que ver una persona', () => {
  it('queda retenida con sus motivos; su autora no recibe nada', async () => {
    const q = nuevaQueja()
    const tg = telegram()
    await avisarAdmins(db, q, { admins: [ADMIN], envio: tg })
    const { d } = deps(gemini({ retirar: [], motivos: ['acusacion'] }), tg)
    const r = await pasadaDeRevision(d)
    expect(r).toMatchObject({ marcadas: 1, retenidas: 1 })
    expect(getQueja(db, q.id)).toMatchObject({ moderacion: 'retenida' })
    expect(
      db.prepare('SELECT decision, por, motivo FROM moderaciones WHERE queja_id = ?').all(q.id),
    ).toEqual([{ decision: 'retenida', por: 'revision-automatica', motivo: 'acusacion' }])
    expect(tg.editados.at(-1)?.html).toMatch(/Retenida/)
    expect(tg.editados.at(-1)?.html).toMatch(/acusa a una persona o a una institución/)
    expect(tg.mensajes).toEqual([])
    expect(buildSnapshot(db, 1000, { photoUrlFor: () => null }).items).toEqual([])
  })

  it('en periodo electoral, también la limpia', async () => {
    const q = nuevaQueja()
    const { d } = deps(gemini({ retirar: [], motivos: [] }), telegram(), {
      congelado: () => true,
    })
    await pasadaDeRevision(d)
    expect(getQueja(db, q.id)).toMatchObject({ moderacion: 'retenida' })
    expect(db.prepare('SELECT motivo FROM moderaciones WHERE queja_id = ?').get(q.id)).toEqual({
      motivo: 'periodo-electoral',
    })
  })

  it('la que el servicio se niega a leer queda retenida, sin reintentos', async () => {
    const q = nuevaQueja()
    const g = gemini('bloqueada')
    const { d } = deps(g, telegram())
    await pasadaDeRevision(d)
    expect(getQueja(db, q.id)).toMatchObject({ moderacion: 'retenida' })
    expect(revisiones(q.id)).toMatchObject([{ resultado: 'marcada', motivos: '["bloqueada"]' }])
    await pasadaDeRevision({ ...d, ahora: () => new Date(AHORA.getTime() + 86_400_000) })
    expect(g.llamadas).toHaveLength(1)
  })
})

describe('cuando la revisión falla', () => {
  it('un error queda anotado sin tocar la queja, y se reintenta a su hora, no antes', async () => {
    const q = nuevaQueja()
    const g = gemini({ status: 503 }, { retirar: [], motivos: [] })
    const { d } = deps(g, telegram())
    const r = await pasadaDeRevision(d)
    expect(r).toMatchObject({ intentadas: 1, errores: 1 })
    expect(getQueja(db, q.id)).toMatchObject({ moderacion: 'pendiente' })
    // El código, nunca el cuerpo de la respuesta.
    expect(revisiones(q.id)).toMatchObject([
      { resultado: 'error', error: 'HTTP 503', motivos: null },
    ])
    expect(dondeAparece('texto de la queja')).toEqual([])

    const antes = await pasadaDeRevision({
      ...d,
      ahora: () => new Date(AHORA.getTime() + 4 * 60_000),
    })
    expect(antes).toMatchObject({ intentadas: 0, esperando: 1 })
    const luego = await pasadaDeRevision({
      ...d,
      ahora: () => new Date(AHORA.getTime() + 6 * 60_000),
    })
    expect(luego).toMatchObject({ intentadas: 1, publicadas: 1 })
  })

  it('una respuesta que no se sostiene se reintenta igual que un error', async () => {
    const q = nuevaQueja()
    const { d } = deps(gemini({ retirar: ['Pepe Martínez'], motivos: [] }), telegram())
    const r = await pasadaDeRevision(d)
    expect(r).toMatchObject({ invalidas: 1 })
    expect(revisiones(q.id)).toMatchObject([{ resultado: 'invalida', error: 'fragmento-ausente' }])
    expect(getQueja(db, q.id)?.detail).toContain(NOMBRE)
  })

  it('tras tres fallos, avisa a quien modera una sola vez, y /health lo dice', async () => {
    const q = nuevaQueja()
    const tg = telegram()
    const g = gemini({ status: 500 }, { status: 500 }, { status: 500 }, { status: 500 })
    const { d } = deps(g, tg)
    let t = AHORA.getTime()
    for (const salto of [0, 6, 16, 61]) {
      t += salto * 60_000
      await pasadaDeRevision({ ...d, ahora: () => new Date(t) })
    }
    expect(g.llamadas).toHaveLength(4)
    const avisos = tg.mensajes.filter((m) => m.chat === ADMIN)
    expect(avisos).toHaveLength(1)
    expect(avisos[0].texto).toContain(q.id)
    expect(avisos[0].texto).toContain('HTTP 500')
    const estado = estadoRevision(db, d.env, new Date(t))
    expect(estado).toMatchObject({ disponible: true, porRevisar: 1, atascadas: 1 })
    const salud = buildHealth(
      { BOT_TOKEN: 'x', CHANNEL_ID: 'x', ADMIN_USER_IDS: String(ADMIN) },
      {
        mode: 'webhook',
        uptimeSec: 1,
        pid: 1,
        webhookAuthenticated: true,
        moderacion: { pendientes: 1, sinTarjeta: 0, masAntiguaHoras: 1, revision: estado },
      },
    )
    expect(salud.degraded.join('\n')).toMatch(/revisión automática no avanza en 1 queja/)
  })
})

describe('lo que pasó mientras el modelo leía', () => {
  it('si quien modera decidió antes, su decisión se queda; el nombre, no', async () => {
    const q = nuevaQueja()
    const g = gemini({ retirar: [NOMBRE], motivos: [] })
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      decidirModeracion(db, q.id, 'descartar', `admin:${ADMIN}`)
      return g.fetchImpl(url, init)
    }) as typeof fetch
    const { d, republicadas } = deps(g, telegram(), { fetchImpl })
    const r = await pasadaDeRevision(d)
    expect(r).toMatchObject({ limpias: 1, sinAplicar: 1, publicadas: 0 })
    expect(getQueja(db, q.id)).toMatchObject({ moderacion: 'descartada' })
    // Quitar un nombre sólo resta: vale también sobre lo ya decidido.
    expect(dondeAparece(NOMBRE)).toEqual([])
    expect(revisiones(q.id)).toHaveLength(1)
    expect(republicadas).toEqual([]) // descartada: no hay nada publicado que cambie
  })

  it('si quien modera la publicó antes, se le quita el nombre y se pide republicar', async () => {
    const q = nuevaQueja()
    const g = gemini({ retirar: [NOMBRE], motivos: ['acusacion'] })
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      decidirModeracion(db, q.id, 'publicar', `admin:${ADMIN}`)
      return g.fetchImpl(url, init)
    }) as typeof fetch
    const { d, republicadas } = deps(g, telegram(), { fetchImpl })
    await pasadaDeRevision(d)
    // Publicada la dejó una persona, y así se queda: la revisión no la retiene.
    expect(getQueja(db, q.id)).toMatchObject({ moderacion: 'publicada' })
    expect(dondeAparece(NOMBRE)).toEqual([])
    expect(republicadas).toEqual(['pedida'])
  })

  it('si su autora la retiró, no se publica', async () => {
    const q = nuevaQueja()
    const g = gemini({ retirar: [], motivos: [] })
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      softDeleteQueja(db, q.id, autorTelegram(VECINA))
      return g.fetchImpl(url, init)
    }) as typeof fetch
    const { d, republicadas } = deps(g, telegram(), { fetchImpl })
    await pasadaDeRevision(d)
    expect(getQueja(db, q.id)).toMatchObject({ moderacion: 'pendiente' })
    expect(republicadas).toEqual([])
  })
})

describe('sin GEMINI_NIVEL=pago', () => {
  it('no se llama al modelo, y la pasada lo dice', async () => {
    nuevaQueja()
    const g = gemini()
    const { d } = deps(g, telegram(), { env: { GEMINI_API_KEY: 'clave-de-prueba' } })
    const r = await pasadaDeRevision(d)
    expect(r).toMatchObject({ apagada: 'GEMINI_NIVEL', porRevisar: 1, intentadas: 0 })
    expect(g.llamadas).toEqual([])
    expect(estadoRevision(db, d.env, AHORA)).toMatchObject({
      disponible: false,
      falta: 'GEMINI_NIVEL',
      porRevisar: 1,
      atascadas: 0,
    })
  })
})

describe('lo que viaja a Gemini', () => {
  it('la clave en la cabecera y no en la URL; la queja entre marcas; los cargos en el prompt', async () => {
    const q = nuevaQueja()
    const g = gemini({ retirar: [], motivos: [] })
    await pasadaDeRevision(deps(g, telegram()).d)
    const [{ url, init }] = g.llamadas
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    )
    expect(url).not.toContain('clave-de-prueba')
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('clave-de-prueba')
    const cuerpo = JSON.parse(String(init.body))
    expect(cuerpo.systemInstruction.parts[0].text).toContain('Cargo Uno (alcalde)')
    const enviado = cuerpo.contents[0].parts[0].text as string
    expect(enviado).toMatch(/^<<<QUEJA\n[\s\S]*\nQUEJA>>>$/)
    expect(enviado).toContain(getQueja(db, q.id)!.title)
    expect(cuerpo.generationConfig).toMatchObject({
      temperature: 0,
      responseMimeType: 'application/json',
    })
  })

  it('ni la identidad de su autora, ni el barrio', async () => {
    nuevaQueja()
    const g = gemini({ retirar: [], motivos: [] })
    await pasadaDeRevision(deps(g, telegram()).d)
    const cuerpo = String(g.llamadas[0].init.body)
    expect(cuerpo).not.toContain(String(VECINA))
    expect(cuerpo).not.toContain('el-molinet')
  })
})
