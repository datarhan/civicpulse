import { describe, expect, it, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, type Db } from '../src/db/client'
import {
  getQueja,
  listUserQuejas,
  listRecentQuejas,
  listByNeighborhood,
  addApoyo,
  countApoyos,
  listEvents,
  setState,
  softDeleteQueja,
  anonimizaRetiradas,
  aggregateStats,
  type NewQuejaInput,
  autorTelegram,
  idCiudadano,
} from '../src/db/queries'
import { creaPublicada } from './helpers/publicada'

function sampleQueja(overrides: Partial<NewQuejaInput> = {}): NewQuejaInput {
  return {
    autor: autorTelegram(42),
    category: 'via_publica',
    title: 'Bache profundo',
    detail: 'Bache en Av. Primera que lleva 2 meses sin reparar',
    lat: 39.5439,
    lng: -0.5711,
    neighborhood: 'casco',
    foto_ref: null,
    concejalia_area: 'Obra Pública',
    concejal_slug: 'teresa-pozuelo-martin',
    ...overrides,
  }
}

describe('bot db — createQueja + getQueja', () => {
  let db: Db
  beforeEach(() => {
    db = openDb(':memory:')
  })

  it('assigns a Q- prefixed ID', () => {
    const q = creaPublicada(db, sampleQueja())
    expect(q.id).toMatch(/^Q-[0-9A-Z]+$/)
  })

  it('persists all input fields', () => {
    const q = creaPublicada(db, sampleQueja())
    const found = getQueja(db, q.id)
    expect(found).not.toBeNull()
    expect(found!.title).toBe('Bache profundo')
    expect(found!.category).toBe('via_publica')
    expect(found!.neighborhood).toBe('casco')
    expect(found!.concejal_slug).toBe('teresa-pozuelo-martin')
    expect(found!.state).toBe('capturada')
  })

  it('returns null for unknown id', () => {
    expect(getQueja(db, 'Q-nope')).toBeNull()
  })

  it('auto-logs a capturada event on creation', () => {
    const q = creaPublicada(db, sampleQueja())
    const events = listEvents(db, q.id)
    expect(events.length).toBe(1)
    expect(events[0].kind).toBe('capturada')
  })
})

describe('bot db — listUserQuejas + listRecentQuejas + listByNeighborhood', () => {
  let db: Db
  beforeEach(() => {
    db = openDb(':memory:')
  })

  it('filters by telegram user id, newest first', () => {
    const q1 = creaPublicada(db, sampleQueja({ autor: autorTelegram(1), title: 'A' }))
    creaPublicada(db, sampleQueja({ autor: autorTelegram(2), title: 'B' }))
    const q3 = creaPublicada(db, sampleQueja({ autor: autorTelegram(1), title: 'C' }))
    const mine = listUserQuejas(db, autorTelegram(1))
    expect(mine.map((q) => q.title)).toEqual(['C', 'A'])
    expect(mine.every((q) => q.ciudadano_id === idCiudadano(db, autorTelegram(1)))).toBe(true)
    expect(q1.id).not.toBe(q3.id)
  })

  // El orden «más nueva primero» NO puede depender del id, y durante mucho
  // tiempo dependió. `created_at` es `datetime('now')`, que en SQLite tiene
  // resolución de SEGUNDO: dos quejas del mismo segundo empatan, y el desempate
  // era `id DESC`. Ese id es `ulid().slice(-8)` — se queda con el final
  // ALEATORIO y tira los 10 caracteres de marca de tiempo que hacen ordenable a
  // un ULID. `monotonicFactory` sólo garantiza el incremento DENTRO de un
  // milisegundo; al cruzar uno, el sufijo se resiembra al azar.
  //
  // En el portátil las dos inserciones caían en el mismo milisegundo y salía
  // bien; en CI cruzaron el borde y salió ['A','C'] en vez de ['C','A'].
  //
  // Este reproductor no espera a la casualidad: fuerza los ids a un orden
  // contrario al de inserción, que es exactamente lo que hace el azar cuando
  // toca, y exige que el listado siga saliendo por orden de inserción.
  it('ordena por inserción aunque los ids salgan al revés', () => {
    const a = creaPublicada(db, sampleQueja({ autor: autorTelegram(7), title: 'primera' }))
    const b = creaPublicada(db, sampleQueja({ autor: autorTelegram(7), title: 'segunda' }))
    // El azar del sufijo, hecho explícito: la primera recibe el id más alto.
    // Las claves ajenas se apagan sólo para reescribir el id — `events` apunta
    // a `quejas(id)` y si no, salta la restricción y la prueba fallaría por un
    // motivo que no es el que vigila.
    db.pragma('foreign_keys = OFF')
    db.prepare('UPDATE quejas SET id = ? WHERE id = ?').run('Q-ZZZZZZZZ', a.id)
    db.prepare('UPDATE quejas SET id = ? WHERE id = ?').run('Q-00000000', b.id)
    db.pragma('foreign_keys = ON')

    const titulos = listUserQuejas(db, autorTelegram(7)).map((q) => q.title)
    expect(titulos, 'la más nueva es la insertada después, no la del id mayor').toEqual([
      'segunda',
      'primera',
    ])
  })

  it('listRecentQuejas respects limit', () => {
    for (let i = 0; i < 5; i++) creaPublicada(db, sampleQueja({ title: 'q' + i }))
    expect(listRecentQuejas(db, 3).length).toBe(3)
  })

  it('listByNeighborhood filters', () => {
    creaPublicada(db, sampleQueja({ neighborhood: 'casco' }))
    creaPublicada(db, sampleQueja({ neighborhood: 'sector14' }))
    creaPublicada(db, sampleQueja({ neighborhood: 'casco' }))
    expect(listByNeighborhood(db, 'casco').length).toBe(2)
    expect(listByNeighborhood(db, 'sector14').length).toBe(1)
  })
})

describe('bot db — apoyos (co-signs)', () => {
  let db: Db
  let quejaId: string
  beforeEach(() => {
    db = openDb(':memory:')
    quejaId = creaPublicada(db, sampleQueja()).id
  })

  it('adds a distinct apoyo and returns count', () => {
    const r1 = addApoyo(db, quejaId, autorTelegram(100))
    expect(r1.added).toBe(true)
    expect(r1.count).toBe(1)
    const r2 = addApoyo(db, quejaId, autorTelegram(101))
    expect(r2.added).toBe(true)
    expect(r2.count).toBe(2)
  })

  it('is idempotent for the same user (no double-apoyo)', () => {
    addApoyo(db, quejaId, autorTelegram(100))
    const r = addApoyo(db, quejaId, autorTelegram(100))
    expect(r.added).toBe(false)
    expect(r.count).toBe(1)
  })

  it('emits an apoyada_verificada event at 10 apoyos', () => {
    for (let i = 1; i <= 10; i++) addApoyo(db, quejaId, autorTelegram(100 + i))
    const events = listEvents(db, quejaId)
    const milestone = events.find((e) => e.kind === 'apoyada_verificada')
    expect(milestone).toBeDefined()
  })

  it('does not double-emit the milestone event', () => {
    for (let i = 1; i <= 12; i++) addApoyo(db, quejaId, autorTelegram(100 + i))
    const events = listEvents(db, quejaId)
    const milestones = events.filter((e) => e.kind === 'apoyada_verificada')
    expect(milestones.length).toBe(1)
  })

  it('countApoyos returns the current total', () => {
    expect(countApoyos(db, quejaId)).toBe(0)
    addApoyo(db, quejaId, autorTelegram(100))
    addApoyo(db, quejaId, autorTelegram(101))
    expect(countApoyos(db, quejaId)).toBe(2)
  })
})

describe('bot db — setState transitions', () => {
  let db: Db
  let quejaId: string
  beforeEach(() => {
    db = openDb(':memory:')
    quejaId = creaPublicada(db, sampleQueja()).id
  })

  it('updates the state column', () => {
    setState(db, quejaId, 'en_tramite')
    const q = getQueja(db, quejaId)
    expect(q?.state).toBe('en_tramite')
  })

  it('persists registro_entry_number + CSV when transitioning to registrada', () => {
    setState(db, quejaId, 'registrada', {
      entry_number: '2026-RE-0847',
      csv: 'ABC123XYZ',
    })
    const q = getQueja(db, quejaId)
    expect(q?.state).toBe('registrada')
    expect(q?.registro_entry_number).toBe('2026-RE-0847')
    expect(q?.registro_csv).toBe('ABC123XYZ')
    expect(q?.registered_at).toBeTruthy()
  })

  it('logs an event for every transition', () => {
    setState(db, quejaId, 'en_tramite')
    setState(db, quejaId, 'resuelta')
    const events = listEvents(db, quejaId)
    const kinds = events.map((e) => e.kind)
    expect(kinds).toEqual(['capturada', 'en_tramite', 'resuelta'])
  })
})

describe('bot db — softDeleteQueja (RGPD art. 17 right-to-be-forgotten)', () => {
  let db: Db
  let quejaId: string

  beforeEach(() => {
    db = openDb(':memory:')
    // Con usuario, coordenadas y foto: lo que /olvidar tiene que borrar del registro.
    quejaId = creaPublicada(db, sampleQueja({ foto_ref: 'tg:AgACAgQAAxkBAAIBfoto' })).id
  })

  it('soft-deletes the queja (row survives, deleted_at set)', () => {
    const ok = softDeleteQueja(db, quejaId, autorTelegram(42))
    expect(ok).toBe(true)
    const row = getQueja(db, quejaId)
    expect(row).not.toBeNull()
    expect(row!.deleted_at).toBeTruthy()
  })

  it('el registro que queda no guarda quién la escribió, ni dónde, ni su foto', () => {
    softDeleteQueja(db, quejaId, autorTelegram(42))
    const row = getQueja(db, quejaId)!
    // Lo que el aviso legal y la respuesta del bot prometen borrar…
    expect(row.ciudadano_id).toBeNull()
    expect(row.lat).toBeNull()
    expect(row.lng).toBeNull()
    expect(row.foto_ref).toBeNull()
    // …y lo que queda como rastro de auditoría.
    expect(row.title).toBe('Bache profundo')
    expect(row.detail).toBe('Bache en Av. Primera que lleva 2 meses sin reparar')
    expect(row.category).toBe('via_publica')
    expect(row.state).toBe('capturada')
  })

  it('emits an anonymised audit event', () => {
    softDeleteQueja(db, quejaId, autorTelegram(42))
    const kinds = listEvents(db, quejaId).map((e) => e.kind)
    expect(kinds).toContain('anonymised')
  })

  it('una segunda petición del mismo autor ya no la encuentra: el registro no sabe quién la escribió', () => {
    expect(softDeleteQueja(db, quejaId, autorTelegram(42))).toBe(true)
    // Antes contestaba «true» otra vez, y eso exigía seguir sabiendo que era suya.
    expect(softDeleteQueja(db, quejaId, autorTelegram(42))).toBe(false)
    const events = listEvents(db, quejaId).filter((e) => e.kind === 'anonymised')
    expect(events.length).toBe(1)
  })

  it('refuses deletion from the wrong user (no enumeration leak)', () => {
    const ok = softDeleteQueja(db, quejaId, autorTelegram(999)) // wrong user id
    expect(ok).toBe(false)
    const row = getQueja(db, quejaId)
    expect(row!.deleted_at).toBeNull()
  })

  it('returns false for a non-existent queja id', () => {
    expect(softDeleteQueja(db, 'Q-NOPE0000', autorTelegram(42))).toBe(false)
  })

  it('hides deleted rows from listRecentQuejas (public feed)', () => {
    const kept = creaPublicada(db, sampleQueja({ title: 'Kept' })).id
    softDeleteQueja(db, quejaId, autorTelegram(42))
    const ids = listRecentQuejas(db, 10).map((r) => r.id)
    expect(ids).toContain(kept)
    expect(ids).not.toContain(quejaId)
  })

  it('hides deleted rows from listByNeighborhood', () => {
    softDeleteQueja(db, quejaId, autorTelegram(42))
    expect(listByNeighborhood(db, 'casco').map((r) => r.id)).not.toContain(quejaId)
  })

  it('/mis deja de listarla: ya no es de nadie', () => {
    const otra = creaPublicada(db, sampleQueja({ title: 'Sigue viva' })).id
    softDeleteQueja(db, quejaId, autorTelegram(42))
    const ids = listUserQuejas(db, autorTelegram(42)).map((r) => r.id)
    expect(ids).not.toContain(quejaId)
    expect(ids, 'la viva del mismo autor sí sale (el control)').toContain(otra)
  })

  it('excludes deleted rows from aggregateStats.total', () => {
    creaPublicada(db, sampleQueja({ title: 'Also kept' }))
    softDeleteQueja(db, quejaId, autorTelegram(42))
    expect(aggregateStats(db).total).toBe(1)
  })

  it('anonimizaRetiradas borra la identidad de las que se retiraron antes de este cambio', () => {
    const viva = creaPublicada(db, sampleQueja({ title: 'Viva' })).id
    // Retirada «a la antigua»: sólo `deleted_at`, con la fila entera dentro.
    db.prepare(`UPDATE quejas SET deleted_at = datetime('now') WHERE id = ?`).run(quejaId)
    expect(anonimizaRetiradas(db)).toBe(1)
    const ida = getQueja(db, quejaId)!
    expect([ida.ciudadano_id, ida.lat, ida.lng, ida.foto_ref]).toEqual([null, null, null, null])
    expect(anonimizaRetiradas(db), 'la segunda vez no toca nada').toBe(0)
    const sigue = getQueja(db, viva)!
    expect(sigue.ciudadano_id, 'una viva conserva su autor (el control)').toBe(
      idCiudadano(db, autorTelegram(42)),
    )
    expect(sigue.ciudadano_id).not.toBeNull()
  })

  it('y se aplica al abrir la base: una retirada antigua sale anónima del siguiente arranque', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cp-bot-db-'))
    try {
      const ruta = join(dir, 'bot.db')
      const antes = openDb(ruta)
      const id = creaPublicada(antes, sampleQueja({ foto_ref: 'tg:AgACfoto' })).id
      antes.prepare(`UPDATE quejas SET deleted_at = datetime('now') WHERE id = ?`).run(id)
      antes.close()
      const despues = openDb(ruta)
      const fila = getQueja(despues, id)!
      despues.close()
      expect([fila.ciudadano_id, fila.foto_ref]).toEqual([null, null])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('bot db — aggregateStats', () => {
  let db: Db
  beforeEach(() => {
    db = openDb(':memory:')
  })

  it('returns zeros on empty db', () => {
    const s = aggregateStats(db)
    expect(s.total).toBe(0)
    expect(s.byState).toEqual({})
    expect(s.byConcejal).toEqual({})
  })

  it('groups by state + neighborhood + category + concejal', () => {
    const a = creaPublicada(db, sampleQueja({ neighborhood: 'casco', category: 'via_publica' }))
    const b = creaPublicada(
      db,
      sampleQueja({
        neighborhood: 'casco',
        category: 'limpieza',
        concejal_slug: 'rafael-gomez-sanchez',
      }),
    )
    const c = creaPublicada(db, sampleQueja({ neighborhood: 'sector14', category: 'via_publica' }))
    setState(db, b.id, 'resuelta')
    const s = aggregateStats(db)
    expect(s.total).toBe(3)
    expect(s.byState.capturada).toBe(2)
    expect(s.byState.resuelta).toBe(1)
    expect(s.byNeighborhood.casco).toBe(2)
    expect(s.byCategory.via_publica).toBe(2)
    expect(s.byConcejal['teresa-pozuelo-martin'].total).toBe(2)
    expect(s.byConcejal['teresa-pozuelo-martin'].pendientes).toBe(2)
    expect(s.byConcejal['rafael-gomez-sanchez'].total).toBe(1)
    expect(s.byConcejal['rafael-gomez-sanchez'].resueltas).toBe(1)
    expect(a.id).toBeTruthy()
    expect(c.id).toBeTruthy()
  })
})
