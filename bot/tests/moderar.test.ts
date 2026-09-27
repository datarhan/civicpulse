import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb, type Db } from '../src/db/client'
import {
  avisarAdmins,
  estadoModeracion,
  reenviarTarjetasPendientes,
  tarjetaDeQueja,
  type EnvioAdmin,
} from '../src/services/avisos-admin'
import { autorTelegram, createQueja } from '../src/db/queries'
import type { Channel } from '../src/services/channel'
import { botFalso, texto, boton, CANAL_MUDO } from './helpers/bot-falso'
import { creaPublicada } from './helpers/publicada'

/**
 * La revisión antes de publicar, a mano: cada queja nueva llega a los
 * administradores con [Publicar] y [Descartar], y no es pública hasta que uno
 * decide.
 *
 * Hasta el 2026-09-27 una queja se publicaba en el acto —en la web y en el
 * canal público de Telegram— con el texto tal cual lo escribió el vecino, y
 * nadie la leía antes: ni un nombre propio, ni un teléfono, ni una acusación
 * paraban nada. La revisión automática llega después; ésta es la puerta, y
 * falla cerrada: una queja que ningún administrador ha visto no sale.
 */
const ADMIN_A = 9001
const ADMIN_B = 9002
const VECINA = 1001
const VECINO = 1002

let db: Db
let h: ReturnType<typeof botFalso>
beforeEach(() => {
  process.env.ADMIN_USER_IDS = `${ADMIN_A},${ADMIN_B}`
  db = openDb(':memory:')
  h = botFalso(db)
})
afterEach(() => {
  delete process.env.ADMIN_USER_IDS
})

const moderacion = (id: string) =>
  (db.prepare('SELECT moderacion FROM quejas WHERE id = ?').get(id) as { moderacion: string })
    .moderacion

/** La queja entera por el flujo de verdad, sin ubicación ni foto. */
async function presentar(de = VECINA): Promise<string> {
  await h.bot.handleUpdate(texto(de, '/queja'))
  await h.bot.handleUpdate(boton(de, 'cat:alumbrado'))
  await h.bot.handleUpdate(texto(de, 'Farola apagada en la plaza'))
  await h.bot.handleUpdate(
    texto(de, 'La farola de la plaza lleva apagada desde el lunes y la calle queda a oscuras.'),
  )
  await h.bot.handleUpdate(texto(de, 'saltar'))
  await h.bot.handleUpdate(texto(de, 'saltar'))
  const fila = db.prepare('SELECT id FROM quejas ORDER BY rowid DESC LIMIT 1').get() as
    { id: string } | undefined
  expect(fila, 'el flujo no guardó la queja').toBeDefined()
  return fila!.id
}

const ediciones = (id: string) =>
  h.llamadas.filter((l) => l.metodo === 'editMessageText' && String(l.cuerpo.text).includes(id))
const respuestas = () =>
  h.llamadas
    .filter((l) => l.metodo === 'answerCallbackQuery')
    .map((l) => String(l.cuerpo.text ?? ''))

describe('una queja nueva no es pública hasta que un administrador decide', () => {
  it('llega a cada administrador con Publicar y Descartar, y a la autora no le promete nada público', async () => {
    const id = await presentar()
    expect(moderacion(id)).toBe('pendiente')
    for (const admin of [ADMIN_A, ADMIN_B]) {
      const tarjeta = h.a(admin).at(-1)
      expect(tarjeta?.cuerpo.text, `sin tarjeta para ${admin}`).toContain(id)
      expect(h.botones(tarjeta)).toEqual([`mod:pub:${id}`, `mod:desc:${id}`])
    }
    const recibo = String(h.a(VECINA).at(-1)?.cuerpo.text)
    expect(recibo).toContain(id)
    expect(recibo).toMatch(/revis/i)
    // Apoyar una queja que nadie más puede ver aún sería un atajo roto.
    expect(recibo).not.toMatch(/\/apoyar/)
  })

  it('Publicar la publica, cambia las dos tarjetas, avisa a la autora y deja rastro', async () => {
    const id = await presentar()
    await h.bot.handleUpdate(boton(ADMIN_A, `mod:pub:${id}`))
    expect(moderacion(id)).toBe('publicada')
    const eds = ediciones(id)
    expect(eds.map((l) => l.cuerpo.chat_id).sort()).toEqual([ADMIN_A, ADMIN_B])
    for (const e of eds) expect(h.botones(e)).toEqual([`mod:ret:${id}`])
    const aviso = String(h.a(VECINA).at(-1)?.cuerpo.text)
    expect(aviso).toContain(id)
    expect(aviso).toMatch(/pública/)
    expect(aviso).toMatch(/\/apoyar/)
    expect(db.prepare('SELECT decision, por FROM moderaciones WHERE queja_id = ?').all(id)).toEqual(
      [{ decision: 'publicada', por: `admin:${ADMIN_A}` }],
    )
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM events WHERE queja_id = ? AND kind = 'moderacion_publicada'",
        )
        .get(id),
    ).toEqual({ n: 1 })
  })

  it('quien no es administrador no decide', async () => {
    const id = await presentar()
    await h.bot.handleUpdate(boton(VECINO, `mod:pub:${id}`))
    expect(moderacion(id)).toBe('pendiente')
    expect(respuestas().at(-1)).toMatch(/administrador/)
  })

  it('en un grupo, el botón no decide', async () => {
    const id = await presentar()
    await h.bot.handleUpdate(boton(ADMIN_A, `mod:pub:${id}`, { id: -500, type: 'group' }))
    expect(moderacion(id)).toBe('pendiente')
  })

  it('dos toques: el segundo dice que ya estaba decidida, y no la decide otra vez', async () => {
    const id = await presentar()
    await h.bot.handleUpdate(boton(ADMIN_A, `mod:pub:${id}`))
    await h.bot.handleUpdate(boton(ADMIN_B, `mod:desc:${id}`))
    expect(moderacion(id)).toBe('publicada')
    expect(respuestas().at(-1)).toMatch(/ya/i)
    expect(db.prepare('SELECT COUNT(*) AS n FROM moderaciones WHERE queja_id = ?').get(id)).toEqual(
      { n: 1 },
    )
  })

  it('si su autora la retiró antes, no se publica', async () => {
    const id = await presentar()
    await h.bot.handleUpdate(texto(VECINA, `/olvidar ${id}`))
    await h.bot.handleUpdate(boton(ADMIN_A, `mod:pub:${id}`))
    expect(moderacion(id)).not.toBe('publicada')
    expect(respuestas().at(-1)).toMatch(/retir/i)
  })

  it('Descartar no la publica y se lo dice a la autora; y tiene vuelta atrás', async () => {
    const id = await presentar()
    await h.bot.handleUpdate(boton(ADMIN_A, `mod:desc:${id}`))
    expect(moderacion(id)).toBe('descartada')
    // Un toque que no se podía deshacer, con la autora invitada a impugnarlo: la
    // tarjeta de una descartada ofrece Publicar.
    for (const e of ediciones(id)) expect(h.botones(e)).toEqual([`mod:pub:${id}`])
    const aviso = String(h.a(VECINA).at(-1)?.cuerpo.text)
    expect(aviso).toContain(id)
    expect(aviso).toMatch(/no se publica/i)
    await h.bot.handleUpdate(boton(ADMIN_B, `mod:pub:${id}`))
    expect(moderacion(id)).toBe('publicada')
  })

  it('Retirar una publicada la saca del público', async () => {
    const id = await presentar()
    await h.bot.handleUpdate(boton(ADMIN_A, `mod:pub:${id}`))
    await h.bot.handleUpdate(boton(ADMIN_B, `mod:ret:${id}`))
    expect(moderacion(id)).toBe('retirada')
    expect(String(h.a(VECINA).at(-1)?.cuerpo.text)).toMatch(/retirad/i)
  })
})

describe('la tarjeta llega o se reintenta', () => {
  it('si no llega a ningún administrador, la pasada siguiente la reenvía', async () => {
    const f = botFalso(db, {
      falla: (metodo, cuerpo) =>
        metodo === 'sendMessage' && [ADMIN_A, ADMIN_B].includes(cuerpo.chat_id),
    })
    h = f
    const id = await presentar()
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM avisos WHERE tipo = 'tarjeta' AND message_id IS NOT NULL",
        )
        .get(),
    ).toEqual({ n: 0 })
    // Ahora Telegram entrega: la pasada horaria la manda, y sólo una vez.
    const enviados: number[] = []
    const envio: EnvioAdmin = {
      enviar: async (admin: number) => {
        enviados.push(admin)
        return { message_id: 500 + enviados.length }
      },
      editar: async () => {},
      mensaje: async () => {},
    }
    const r = await reenviarTarjetasPendientes(db, { admins: [ADMIN_A, ADMIN_B], envio })
    expect(r).toEqual({ quejas: 1, entregadas: 2, fallidas: 0 })
    expect(enviados.sort()).toEqual([ADMIN_A, ADMIN_B])
    const otra = await reenviarTarjetasPendientes(db, { admins: [ADMIN_A, ADMIN_B], envio })
    expect(otra).toEqual({ quejas: 0, entregadas: 0, fallidas: 0 })
    expect(moderacion(id)).toBe('pendiente')
  })

  it('la tarjeta escapa el texto del vecino y cabe en un mensaje', () => {
    const q = createQueja(db, {
      autor: autorTelegram(VECINA),
      category: 'otros',
      title: 'Una <b>etiqueta</b> & un ampersand',
      detail: 'x'.repeat(6000),
    })
    const { html, botones } = tarjetaDeQueja(q)
    expect(html).toContain('&lt;b&gt;etiqueta&lt;/b&gt; &amp; un ampersand')
    expect(html.length).toBeLessThanOrEqual(4000)
    expect(botones.map((b) => b.data)).toEqual([`mod:pub:${q.id}`, `mod:desc:${q.id}`])
  })
})

describe('lo que la revisión arrastraba roto (revisión de #137)', () => {
  it('si contestar al botón falla, lo demás se hace igual, y un segundo toque no lo repite', async () => {
    // Falla contestar al botón de la tarjeta, no a los de la conversación que la presenta.
    let rota = false
    h = botFalso(db, { falla: (metodo) => rota && metodo === 'answerCallbackQuery' })
    const id = await presentar()
    rota = true
    await h.bot.handleUpdate(boton(ADMIN_A, `mod:pub:${id}`))
    expect(moderacion(id)).toBe('publicada')
    expect(ediciones(id)).toHaveLength(2)
    // «ya es pública» es el aviso; la bienvenida y el recibo dicen «cuando sea pública».
    const avisos = () => h.a(VECINA).filter((l) => /ya es pública/.test(String(l.cuerpo.text)))
    expect(avisos()).toHaveLength(1)
    await h.bot.handleUpdate(boton(ADMIN_B, `mod:pub:${id}`))
    expect(avisos(), 'el segundo toque avisó otra vez').toHaveLength(1)
  })

  it('/revisar manda la tarjeta de cualquier queja viva: una publicada de antes se puede retirar', async () => {
    const vieja = creaPublicada(db, {
      autor: autorTelegram(VECINA),
      category: 'ruido',
      title: 'Ruido nocturno',
      detail: 'Ruido de madrugada todos los fines de semana en la calle del mercado.',
    }).id
    await h.bot.handleUpdate(texto(ADMIN_A, `/revisar ${vieja}`))
    const tarjeta = h.a(ADMIN_A).at(-1)
    expect(String(tarjeta?.cuerpo.text)).toContain(vieja)
    expect(h.botones(tarjeta)).toEqual([`mod:ret:${vieja}`])
    await h.bot.handleUpdate(boton(ADMIN_A, `mod:ret:${vieja}`))
    expect(moderacion(vieja)).toBe('retirada')
    // Y quien no administra no la pide.
    await h.bot.handleUpdate(texto(VECINO, `/revisar ${vieja}`))
    expect(String(h.a(VECINO).at(-1)?.cuerpo.text)).toMatch(/administrador/)
  })

  it('/pendientes dice cuáles esperan y desde cuándo', async () => {
    const id = await presentar()
    await h.bot.handleUpdate(texto(ADMIN_B, '/pendientes'))
    const lista = String(h.a(ADMIN_B).at(-1)?.cuerpo.text)
    expect(lista).toContain(id)
    expect(lista).toMatch(/\d+ (min|h|d)/)
  })

  it('la tarjeta que sólo tiene quien ya no es administrador se vuelve a mandar', async () => {
    const id = await presentar()
    process.env.ADMIN_USER_IDS = '9003'
    const enviados: number[] = []
    const envio: EnvioAdmin = {
      enviar: async (admin) => {
        enviados.push(admin)
        return { message_id: 900 }
      },
      editar: async () => {},
      mensaje: async () => {},
    }
    const r = await reenviarTarjetasPendientes(db, { admins: [9003], envio })
    expect(r).toEqual({ quejas: 1, entregadas: 1, fallidas: 0 })
    expect(enviados).toEqual([9003])
    expect(moderacion(id)).toBe('pendiente')
  })

  it('dos envíos a la vez no dejan dos tarjetas: la segunda no se manda', async () => {
    const q = createQueja(db, {
      autor: autorTelegram(VECINA),
      category: 'otros',
      title: 'Una queja',
      detail: 'Una queja con detalle suficiente para mandarla.',
    })
    let n = 0
    const envio: EnvioAdmin = {
      enviar: async () => {
        await new Promise((r) => setTimeout(r, 10))
        n += 1
        return { message_id: 700 + n }
      },
      editar: async () => {},
      mensaje: async () => {},
    }
    await Promise.all([
      avisarAdmins(db, q, { admins: [ADMIN_A], envio }),
      avisarAdmins(db, q, { admins: [ADMIN_A], envio }),
    ])
    expect(n).toBe(1)
  })

  it('/olvidar quita el texto de las tarjetas de los administradores', async () => {
    const id = await presentar()
    await h.bot.handleUpdate(texto(VECINA, `/olvidar ${id}`))
    const eds = ediciones(id)
    expect(eds.map((l) => l.cuerpo.chat_id).sort()).toEqual([ADMIN_A, ADMIN_B])
    for (const e of eds) {
      expect(String(e.cuerpo.text)).not.toMatch(/farola/i)
      expect(h.botones(e)).toEqual([])
    }
  })

  it('/borrar_mis_datos también', async () => {
    const id = await presentar()
    await h.bot.handleUpdate(texto(VECINA, '/borrar_mis_datos'))
    const si = h.botones(h.a(VECINA).at(-1))[0]
    await h.bot.handleUpdate(boton(VECINA, si))
    const eds = ediciones(id)
    expect(eds.length).toBe(2)
    for (const e of eds) expect(String(e.cuerpo.text)).not.toMatch(/farola/i)
  })

  it('el canal público no anuncia nada: ni al recibirla ni al publicarla', async () => {
    const anunciadas: string[] = []
    const espia: Channel = {
      ...CANAL_MUDO,
      postNuevaQueja: async (q) => {
        anunciadas.push(q.id)
      },
    }
    h = botFalso(db, { canal: espia })
    const id = await presentar()
    await h.bot.handleUpdate(boton(ADMIN_A, `mod:pub:${id}`))
    expect(moderacion(id)).toBe('publicada')
    expect(anunciadas).toEqual([])
  })

  it('la tarjeta dice si trae foto y a qué área y cargo la atribuye el enrutador', () => {
    const q = createQueja(db, {
      autor: autorTelegram(VECINA),
      category: 'alumbrado',
      title: 'Farola apagada',
      detail: 'La farola de la plaza lleva apagada desde el lunes.',
      foto_ref: 'tg:FOTO',
      concejalia_area: 'Obras',
      concejal_slug: 'concejal-x',
    })
    const { html } = tarjetaDeQueja(q)
    expect(html).toMatch(/foto/i)
    expect(html).toContain('Obras')
    expect(html).toContain('concejal-x')
  })

  it('la cola, para /health: lo que espera, lo que ningún administrador actual tiene, y la más antigua', async () => {
    await presentar()
    expect(estadoModeracion(db, [ADMIN_A, ADMIN_B])).toEqual({
      pendientes: 1,
      sinTarjeta: 0,
      masAntiguaHoras: 0,
    })
    expect(estadoModeracion(db, [9003])).toMatchObject({ pendientes: 1, sinTarjeta: 1 })
    expect(estadoModeracion(db, [])).toMatchObject({ pendientes: 1, sinTarjeta: 1 })
  })

  it('/estado de su autora en un grupo no enseña una queja sin publicar', async () => {
    const id = await presentar()
    const grupo = { id: -700, type: 'group' as const, title: 'Vecinos' }
    await h.bot.handleUpdate(texto(VECINA, `/estado ${id}`, grupo as never))
    const r = h.llamadas.filter((l) => l.metodo === 'sendMessage' && l.cuerpo.chat_id === -700)
    expect(r.map((l) => String(l.cuerpo.text)).join('\n')).not.toMatch(/Farola apagada/)
  })
})
