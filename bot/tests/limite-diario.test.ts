import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb, type Db } from '../src/db/client'
import {
  autorTelegram,
  createQueja,
  cupoDeQuejas,
  decidirModeracion,
  LIMITE_QUEJAS_DIA,
  softDeleteQueja,
  VENTANA_LIMITE_HORAS,
} from '../src/db/queries'
import { mensajeLimite } from '../src/commands/bloquear'
import { botFalso, texto, boton } from './helpers/bot-falso'

/**
 * Cuántas quejas nuevas puede enviar una cuenta: 5 en 24 horas móviles. La sexta
 * oye el límite y cuándo podrá enviar otra. Quien modera no tiene límite.
 *
 * Una queja retirada con /olvidar no cuenta: al retirarla, el bot borra quién la
 * escribió, y contarla exigiría guardar justo lo que /olvidar promete borrar.
 */
const ADMIN = 9001
const VECINA = 1001
const VECINO = 1002

const sqlite = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 19)

let db: Db
beforeEach(() => {
  process.env.ADMIN_USER_IDS = String(ADMIN)
  db = openDb(':memory:')
})
afterEach(() => {
  delete process.env.ADMIN_USER_IDS
})

/** Una queja de `quien` creada hace `horas` horas. */
function hace(quien: number, horas: number, ahora = new Date()): string {
  const q = createQueja(db, {
    autor: autorTelegram(quien),
    category: 'alumbrado',
    title: 'Farola apagada',
    detail: 'La farola de la plaza lleva apagada desde el lunes y la calle queda a oscuras.',
  })
  db.prepare('UPDATE quejas SET created_at = ? WHERE id = ?').run(
    sqlite(new Date(ahora.getTime() - horas * 3600 * 1000)),
    q.id,
  )
  return q.id
}

describe('el límite', () => {
  it('es de 5 quejas en 24 horas', () => {
    expect(LIMITE_QUEJAS_DIA).toBe(5)
    expect(VENTANA_LIMITE_HORAS).toBe(24)
  })

  it('cuenta las de las últimas 24 horas de esa cuenta, en cualquier estado de revisión', () => {
    const ahora = new Date()
    const ids = [1, 2, 3, 4].map((h) => hace(VECINA, h, ahora))
    hace(VECINA, 25, ahora) // fuera de la ventana
    hace(VECINO, 1, ahora) // de otra cuenta
    decidirModeracion(db, ids[0], 'descartar', 'admin:1')
    decidirModeracion(db, ids[1], 'publicar', 'admin:1')
    expect(cupoDeQuejas(db, autorTelegram(VECINA), ahora)).toEqual({
      enVentana: 4,
      libreDesde: null,
    })
    hace(VECINA, 10, ahora)
    const c = cupoDeQuejas(db, autorTelegram(VECINA), ahora)
    expect(c.enVentana).toBe(5)
    // La más antigua de la ventana (hace 10 h) sale de ella dentro de 14 h.
    expect(c.libreDesde?.getTime()).toBe(
      new Date(sqlite(new Date(ahora.getTime() + 14 * 3600 * 1000)) + 'Z').getTime(),
    )
  })

  it('una retirada con /olvidar no cuenta: ya no consta de quién era', () => {
    const ahora = new Date()
    const ids = [1, 2, 3, 4, 5].map((h) => hace(VECINA, h, ahora))
    expect(cupoDeQuejas(db, autorTelegram(VECINA), ahora).enVentana).toBe(5)
    expect(softDeleteQueja(db, ids[0], autorTelegram(VECINA))).toBe(true)
    expect(cupoDeQuejas(db, autorTelegram(VECINA), ahora)).toEqual({
      enVentana: 4,
      libreDesde: null,
    })
  })

  it('quien no ha escrito nunca tiene el cupo entero, y mirarlo no le crea una fila', () => {
    expect(cupoDeQuejas(db, autorTelegram(VECINA))).toEqual({ enVentana: 0, libreDesde: null })
    expect(db.prepare('SELECT COUNT(*) AS n FROM ciudadanos').get()).toEqual({ n: 0 })
  })
})

describe('el mensaje', () => {
  it('dice el límite y desde cuándo, en hora peninsular y redondeando al minuto siguiente', () => {
    // 13:04:30 UTC del 12 de noviembre son las 14:04:30 en Madrid: a las 14:04 aún no podría.
    const m = mensajeLimite(new Date('2026-11-12T13:04:30Z'))
    expect(m).toBe(
      'Has enviado 5 quejas en las últimas 24 horas, que es el máximo por cuenta. ' +
        'Podrás enviar la siguiente a partir del 12 de noviembre a las 14:05 (hora peninsular). ' +
        'Gracias por tu paciencia.',
    )
  })

  it('en verano, con el horario de verano', () => {
    expect(mensajeLimite(new Date('2026-07-01T08:00:00Z'))).toContain('1 de julio a las 10:00')
  })
})

describe('por /queja', () => {
  it('la sexta no empieza y oye el límite; la quinta sí', async () => {
    for (const h of [1, 2, 3, 4]) hace(VECINA, h)
    const h = botFalso(db)
    await h.bot.handleUpdate(texto(VECINA, '/queja'))
    expect(h.botones(h.a(VECINA).at(-1))).toContain('cat:alumbrado')
    await h.bot.handleUpdate(boton(VECINA, 'cat:alumbrado'))
    await h.bot.handleUpdate(texto(VECINA, 'Farola apagada en la plaza'))
    await h.bot.handleUpdate(
      texto(VECINA, 'La farola de la plaza lleva apagada desde el lunes y no se ve nada.'),
    )
    await h.bot.handleUpdate(texto(VECINA, 'saltar'))
    await h.bot.handleUpdate(texto(VECINA, 'saltar'))
    expect(db.prepare('SELECT COUNT(*) AS n FROM quejas').get()).toEqual({ n: 5 })
    await h.bot.handleUpdate(texto(VECINA, '/queja'))
    const ultimo = String(h.a(VECINA).at(-1)?.cuerpo.text)
    expect(ultimo).toMatch(/^Has enviado 5 quejas en las últimas 24 horas/)
    expect(ultimo).toMatch(/a partir del \d+ de \w+ a las \d\d:\d\d \(hora peninsular\)/)
    expect(h.botones(h.a(VECINA).at(-1))).toEqual([])
    expect(db.prepare('SELECT COUNT(*) AS n FROM quejas').get()).toEqual({ n: 5 })
  })

  it('quien modera no tiene límite', async () => {
    for (const h of [1, 2, 3, 4, 5, 6]) hace(ADMIN, h)
    const h = botFalso(db)
    await h.bot.handleUpdate(texto(ADMIN, '/queja'))
    expect(h.botones(h.a(ADMIN).at(-1))).toContain('cat:alumbrado')
  })

  it('pasadas 24 horas de la más antigua, vuelve a poder', async () => {
    for (const h of [25, 2, 3, 4, 5]) hace(VECINA, h)
    const h = botFalso(db)
    await h.bot.handleUpdate(texto(VECINA, '/queja'))
    expect(h.botones(h.a(VECINA).at(-1))).toContain('cat:alumbrado')
  })
})
