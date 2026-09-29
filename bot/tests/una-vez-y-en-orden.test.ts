import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { openDb, type Db } from '../src/db/client'
import { SIN_QUEJA_EN_CURSO } from '../src/commands/queja'
import { logger } from '../src/util/log'
import { botFalso, texto, boton } from './helpers/bot-falso'

/**
 * Cada update se atiende una vez, y los de un mismo chat, de uno en uno.
 *
 * El webhook de grammy contesta 500 a un update que tarda más de diez segundos,
 * y lo deja seguir corriendo; Telegram lo vuelve a mandar —o manda el siguiente
 * del mismo chat— mientras el primero sigue a medias. Las conversaciones
 * guardan su estado en memoria, lo leen al empezar, lo cambian en el sitio y lo
 * escriben al acabar, sin candado: dos updates del mismo chat a la vez
 * reproducen el mismo paso dos veces.
 *
 * Medido el 2026-09-28 con este arnés, en /queja. El último paso, repetido
 * mientras el primero esperaba la tarjeta de un administrador, creó dos quejas,
 * con sus tarjetas; las dos entregas se quedaron colgadas sin mandar el recibo;
 * y cada update posterior de la vecina —otra repetición, /start, /mis— creó
 * otra queja más y se colgó también, hasta reiniciar el proceso: el plazo de
 * media hora no llega a saltar, porque la repetición reutiliza la hora
 * apuntada. Otro mensaje suyo en ese rato hizo lo mismo. Repetido cuando el
 * primero ya había acabado, no duplicaba, pero un título repetido se guardaba
 * como el detalle, y un último paso repetido contestaba «No tengo ninguna queja
 * tuya en curso» justo debajo del recibo.
 */
const ADMIN_A = 9001
const ADMIN_B = 9002
const VECINA = 1001
const OTRA = 1002

const TITULO = 'Farola apagada en la plaza'
const DETALLE = 'La farola de la plaza lleva apagada desde el lunes y la calle queda a oscuras.'

let db: Db
beforeEach(() => {
  process.env.ADMIN_USER_IDS = `${ADMIN_A},${ADMIN_B}`
  db = openDb(':memory:')
})
afterEach(() => {
  delete process.env.ADMIN_USER_IDS
  vi.restoreAllMocks()
  vi.useRealTimers()
})

type Cual = (metodo: string, cuerpo: Record<string, any>) => boolean

/** La primera llamada que cumple `cual`, una vez armada, no contesta hasta `soltar`. */
function retenida(cual: Cual) {
  let soltar!: () => void
  const espera = new Promise<void>((r) => (soltar = r))
  let armada = false
  let llego = false
  return {
    retener: (metodo: string, cuerpo: Record<string, any>) => {
      if (!armada || llego || !cual(metodo, cuerpo)) return undefined
      llego = true
      return espera
    },
    armar: () => (armada = true),
    llego: () => llego,
    soltar: () => soltar(),
  }
}

/** Cómo va una entrega al cabo de un rato: «colgada» si aún no ha acabado. */
const enPlazo = (p: Promise<unknown>, ms = 200) =>
  Promise.race([
    p.then(
      () => 'terminó',
      (e) => `falló: ${String(e)}`,
    ),
    new Promise((r) => setTimeout(r, ms)).then(() => 'colgada'),
  ])

const idDe = (u: unknown) => (u as { update_id: number }).update_id
const quejas = () =>
  (db.prepare('SELECT id FROM quejas ORDER BY rowid').all() as Array<{ id: string }>).map(
    (q) => q.id,
  )
const idEn = (texto: unknown) => String(texto).match(/Q-[0-9A-Z]{8}/)?.[0]

/** /queja hasta el paso de la foto, que es el último. */
async function hastaLaFoto(h: ReturnType<typeof botFalso>) {
  await h.bot.handleUpdate(texto(VECINA, '/queja'))
  await h.bot.handleUpdate(boton(VECINA, 'cat:alumbrado'))
  await h.bot.handleUpdate(texto(VECINA, TITULO))
  await h.bot.handleUpdate(texto(VECINA, DETALLE))
  await h.bot.handleUpdate(texto(VECINA, 'saltar'))
}

function lasTarjetasYElRecibo(h: ReturnType<typeof botFalso>) {
  const ids = quejas()
  expect.soft(ids, 'quejas creadas').toHaveLength(1)
  for (const admin of [ADMIN_A, ADMIN_B]) {
    expect
      .soft(
        h.a(admin).map((l) => idEn(l.cuerpo.text)),
        `tarjetas a ${admin}`,
      )
      .toEqual(ids)
  }
  const recibos = h
    .a(VECINA)
    .filter((l) => String(l.cuerpo.text).includes('Queja recibida'))
    .map((l) => idEn(l.cuerpo.text))
  expect.soft(recibos, 'recibos a la vecina').toEqual(ids)
}

describe('Telegram vuelve a mandar el último paso de /queja mientras el primero sigue a medias', () => {
  it.each<[string, Cual]>([
    ['la tarjeta de un administrador', (m, c) => m === 'sendMessage' && c.chat_id === ADMIN_A],
    [
      'el recibo a la vecina',
      (m, c) =>
        m === 'sendMessage' && c.chat_id === VECINA && String(c.text).includes('Queja recibida'),
    ],
  ])('mientras espera %s: una queja, una tarjeta por administrador, un recibo', async (_, cual) => {
    const r = retenida(cual)
    const h = botFalso(db, { retener: r.retener })
    const avisos = vi.spyOn(logger, 'warn')
    await hastaLaFoto(h)
    r.armar()
    const ultimo = texto(VECINA, 'saltar')
    const primera = h.bot.handleUpdate(ultimo)
    await vi.waitFor(() => expect(r.llego()).toBe(true))

    const repetida = h.bot.handleUpdate(ultimo)
    // La repetición se contesta en el acto: si esperara al primero, también
    // pasaría de los diez segundos y Telegram la mandaría otra vez.
    expect.soft(await enPlazo(repetida), 'la repetición').toBe('terminó')
    r.soltar()
    expect.soft(await enPlazo(primera), 'la primera entrega').toBe('terminó')
    lasTarjetasYElRecibo(h)
    // Y deja rastro: cuántas veces repite Telegram se lee en el log.
    expect
      .soft(avisos)
      .toHaveBeenCalledWith(
        'telegram.repetido',
        expect.objectContaining({ update_id: idDe(ultimo) }),
      )

    // La vecina sigue usando el bot: /mis contesta y no crea ninguna queja.
    const antes = h.a(VECINA).length
    expect(await enPlazo(h.bot.handleUpdate(texto(VECINA, '/mis'))), '/mis').toBe('terminó')
    expect(quejas()).toHaveLength(1)
    expect(h.a(VECINA).length).toBe(antes + 1)
  })
})

describe('otro mensaje de la vecina mientras el último paso sigue a medias', () => {
  it('espera su turno: una queja, y su respuesta sale después del recibo', async () => {
    const r = retenida((m, c) => m === 'sendMessage' && c.chat_id === ADMIN_A)
    const h = botFalso(db, { retener: r.retener })
    await hastaLaFoto(h)
    r.armar()
    const primera = h.bot.handleUpdate(texto(VECINA, 'saltar'))
    await vi.waitFor(() => expect(r.llego()).toBe(true))

    const antes = h.a(VECINA).length
    const otro = h.bot.handleUpdate(texto(VECINA, '¿Se ha enviado?'))
    expect.soft(await enPlazo(otro, 50), 'el otro mensaje, con el primero a medias').toBe('colgada')
    r.soltar()
    expect.soft(await enPlazo(primera), 'la primera entrega').toBe('terminó')
    expect.soft(await enPlazo(otro), 'el otro mensaje').toBe('terminó')
    lasTarjetasYElRecibo(h)
    const despues = h
      .a(VECINA)
      .slice(antes)
      .map((l) => String(l.cuerpo.text))
    expect(despues).toHaveLength(2)
    expect(despues[0]).toContain('Queja recibida')
    expect(despues[1]).toBe(SIN_QUEJA_EN_CURSO)
  })

  it('el control: otra vecina no espera a que acabe', async () => {
    const r = retenida((m, c) => m === 'sendMessage' && c.chat_id === ADMIN_A)
    const h = botFalso(db, { retener: r.retener })
    await hastaLaFoto(h)
    r.armar()
    const primera = h.bot.handleUpdate(texto(VECINA, 'saltar'))
    await vi.waitFor(() => expect(r.llego()).toBe(true))
    expect(await enPlazo(h.bot.handleUpdate(texto(OTRA, '/start')))).toBe('terminó')
    expect(h.a(OTRA)).toHaveLength(1)
    r.soltar()
    expect(await enPlazo(primera)).toBe('terminó')
  })
})

describe('Telegram vuelve a mandar un paso que ya se contestó', () => {
  it('un título repetido no se guarda como el detalle', async () => {
    const h = botFalso(db)
    await h.bot.handleUpdate(texto(VECINA, '/queja'))
    await h.bot.handleUpdate(boton(VECINA, 'cat:alumbrado'))
    const titulo = texto(VECINA, TITULO)
    await h.bot.handleUpdate(titulo)
    await h.bot.handleUpdate(titulo)
    await h.bot.handleUpdate(texto(VECINA, DETALLE))
    await h.bot.handleUpdate(texto(VECINA, 'saltar'))
    await h.bot.handleUpdate(texto(VECINA, 'saltar'))
    expect(db.prepare('SELECT title, detail FROM quejas').all()).toEqual([
      { title: TITULO, detail: DETALLE },
    ])
  })

  it('el último paso repetido no contesta nada más', async () => {
    const h = botFalso(db)
    await hastaLaFoto(h)
    const ultimo = texto(VECINA, 'saltar')
    await h.bot.handleUpdate(ultimo)
    const antes = h.a(VECINA).map((l) => String(l.cuerpo.text))
    expect(antes.at(-1)).toContain('Queja recibida')
    await h.bot.handleUpdate(ultimo)
    expect(h.a(VECINA).map((l) => String(l.cuerpo.text))).toEqual(antes)
    expect(quejas()).toHaveLength(1)
  })

  it('recuerda cada update un día —lo más que Telegram lo guarda sin entregar—, y después lo olvida', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const MINUTO = 60 * 1000
    const h = botFalso(db)
    const u = texto(VECINA, '/start')
    await h.bot.handleUpdate(u)
    vi.setSystemTime(Date.now() + 24 * 60 * MINUTO - MINUTO)
    await h.bot.handleUpdate(u)
    expect(h.a(VECINA), 'repetido antes del día').toHaveLength(1)
    vi.setSystemTime(Date.now() + 2 * MINUTO)
    await h.bot.handleUpdate(u)
    expect(h.a(VECINA), 'repetido pasado el día').toHaveLength(2)
  })
})

describe('un update que falla', () => {
  it('no hace fallar la entrega: queda en el log, y el siguiente del chat se atiende', async () => {
    let primera = true
    const h = botFalso(db, {
      falla: (m, c) => {
        if (m !== 'sendMessage' || c.chat_id !== VECINA || !primera) return false
        primera = false
        return true
      },
    })
    const errores = vi.spyOn(logger, 'error').mockImplementation(() => {})
    const u = texto(VECINA, '/start')
    // Un rechazo aquí, pasado el plazo del webhook, tumba el proceso: grammy
    // encadena un `finally` a la entrega que nadie recoge.
    await expect(h.bot.handleUpdate(u)).resolves.toBeUndefined()
    expect(errores).toHaveBeenCalledWith(
      'telegram.update',
      expect.objectContaining({ update_id: idDe(u) }),
    )
    await h.bot.handleUpdate(texto(VECINA, '/start'))
    expect(h.a(VECINA)).toHaveLength(2)
  })
})
