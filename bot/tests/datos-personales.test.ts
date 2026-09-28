import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb, type Db } from '../src/db/client'
import { autorTelegram, createQueja, getQueja } from '../src/db/queries'
import { MARCA_RETIRADO } from '../src/services/pii'
import { botFalso, texto, boton } from './helpers/bot-falso'

/**
 * Un teléfono, un correo o un DNI escritos en una queja no se guardan: el bot los
 * retira del título y del detalle antes de guardarla (services/pii.ts), así que
 * no llegan a la base, ni a la tarjeta de quien modera, ni a lo que se publique.
 * Hasta el 2026-09-28 se guardaban tal cual y sólo una persona, al revisarla,
 * podía descartar la queja entera.
 */
const ADMIN = 9001
const VECINA = 1001
const TELEFONO = '600 000 001'
const CORREO = 'vecina.prueba@example.com'

let db: Db
beforeEach(() => {
  process.env.ADMIN_USER_IDS = String(ADMIN)
  db = openDb(':memory:')
})
afterEach(() => {
  delete process.env.ADMIN_USER_IDS
})

/** Las columnas de la base en las que aparece `ref`, tabla por tabla. */
function dondeAparece(ref: string): string[] {
  const tablas = db
    .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as Array<{ name: string }>
  const vistos = new Set<string>()
  for (const { name } of tablas) {
    for (const fila of db.prepare(`SELECT * FROM "${name}"`).all() as Record<string, unknown>[]) {
      for (const [col, v] of Object.entries(fila)) {
        if (v !== null && String(v).includes(ref)) vistos.add(`${name}.${col}`)
      }
    }
  }
  return [...vistos].sort()
}

describe('los datos personales del texto no se guardan', () => {
  it('createQueja guarda el texto sin ellos, y apunta cuántos retiró, no cuáles', () => {
    const q = createQueja(db, {
      autor: autorTelegram(VECINA),
      category: 'alumbrado',
      title: `Farola apagada, llamad al ${TELEFONO}`,
      detail: `La farola de la plaza lleva apagada desde el lunes. Escribidme a ${CORREO}.`,
    })
    const guardada = getQueja(db, q.id)!
    expect(guardada.title).toContain(MARCA_RETIRADO)
    expect(guardada.detail).toContain(MARCA_RETIRADO)
    expect(dondeAparece('600 000 001')).toEqual([])
    expect(dondeAparece('example.com')).toEqual([])
    const evento = db
      .prepare("SELECT payload FROM events WHERE queja_id = ? AND kind = 'datos_retirados'")
      .get(q.id) as { payload: string } | undefined
    expect(JSON.parse(evento!.payload)).toEqual({ telefono: 1, correo: 1 })
  })

  it('sin nada que retirar no deja evento', () => {
    const q = createQueja(db, {
      autor: autorTelegram(VECINA),
      category: 'alumbrado',
      title: 'Farola apagada',
      detail: 'La farola de la plaza lleva apagada desde el lunes y la calle queda a oscuras.',
    })
    expect(
      db
        .prepare("SELECT COUNT(*) AS n FROM events WHERE queja_id = ? AND kind = 'datos_retirados'")
        .get(q.id),
    ).toEqual({ n: 0 })
  })

  it('por /queja: ni la base, ni la tarjeta, y el recibo dice qué quitó', async () => {
    const h = botFalso(db)
    await h.bot.handleUpdate(texto(VECINA, '/queja'))
    await h.bot.handleUpdate(boton(VECINA, 'cat:alumbrado'))
    await h.bot.handleUpdate(texto(VECINA, 'Farola apagada en la plaza'))
    await h.bot.handleUpdate(
      texto(
        VECINA,
        `La farola de la plaza lleva apagada desde el lunes. Llamadme al ${TELEFONO} o escribid a ${CORREO}.`,
      ),
    )
    await h.bot.handleUpdate(texto(VECINA, 'saltar'))
    await h.bot.handleUpdate(texto(VECINA, 'saltar'))
    // Control: la queja se guardó.
    expect(db.prepare('SELECT COUNT(*) AS n FROM quejas').get()).toEqual({ n: 1 })
    expect(dondeAparece('600 000 001')).toEqual([])
    expect(dondeAparece('example.com')).toEqual([])
    const tarjeta = String(h.a(ADMIN).at(-1)?.cuerpo.text)
    expect(tarjeta).toContain(MARCA_RETIRADO)
    expect(tarjeta).not.toContain('600 000 001')
    expect(tarjeta).not.toContain('example.com')
    expect(tarjeta).toMatch(/2 datos personales retirados/)
    const recibo = String(h.a(VECINA).at(-1)?.cuerpo.text)
    expect(recibo).toMatch(/un teléfono y un correo/)
  })
})
