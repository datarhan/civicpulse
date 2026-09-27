import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb, type Db } from '../src/db/client'
import { reenviarTarjetasPendientes, tarjetaDeQueja } from '../src/services/avisos-admin'
import { autorTelegram, createQueja } from '../src/db/queries'
import { botFalso, texto, boton } from './helpers/bot-falso'

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

  it('Descartar no la publica, quita los botones y se lo dice a la autora', async () => {
    const id = await presentar()
    await h.bot.handleUpdate(boton(ADMIN_A, `mod:desc:${id}`))
    expect(moderacion(id)).toBe('descartada')
    for (const e of ediciones(id)) expect(h.botones(e)).toEqual([])
    const aviso = String(h.a(VECINA).at(-1)?.cuerpo.text)
    expect(aviso).toContain(id)
    expect(aviso).toMatch(/no se publica/i)
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
    expect(db.prepare('SELECT COUNT(*) AS n FROM avisos_admin').get()).toEqual({ n: 0 })
    // Ahora Telegram entrega: la pasada horaria la manda, y sólo una vez.
    const enviados: number[] = []
    const envio = {
      enviar: async (admin: number) => {
        enviados.push(admin)
        return { message_id: 500 + enviados.length }
      },
      editar: async () => {},
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
