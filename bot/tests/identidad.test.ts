import { describe, it, expect, beforeEach } from 'vitest'
import { openDb, type Db } from '../src/db/client'
import {
  addApoyo,
  autorTelegram,
  countApoyos,
  createQueja,
  esAutor,
  idCiudadano,
  listUserQuejas,
  softDeleteQueja,
} from '../src/db/queries'
import { MIGRACIONES } from '../src/db/migraciones'

/**
 * La identidad por ciudadano, ya en uso: `openDb` migra la base al arrancar, y
 * el código habla de autores (`canal` + `ref`), no de ids de Telegram.
 *
 * Lo que tiene que seguir siendo verdad al cambiar de columna: sólo el autor ve
 * y retira lo suyo, retirar borra quién la escribió, un autor no apoya lo suyo,
 * y MIRAR no crea a nadie —quien pregunta por sus quejas sin haber escrito
 * ninguna no deja una fila con su id—.
 */
const VECINA = autorTelegram(1001)
const VECINO = autorTelegram(1002)
const DESCONOCIDA = autorTelegram(1999)

const ciudadanos = (db: Db) =>
  (db.prepare('SELECT COUNT(*) AS n FROM ciudadanos').get() as { n: number }).n

describe('la identidad por ciudadano', () => {
  let db: Db
  let id: string
  beforeEach(() => {
    db = openDb(':memory:')
    id = createQueja(db, {
      autor: VECINA,
      category: 'alumbrado',
      title: 'Farola apagada',
      detail: 'La farola de la plaza lleva apagada desde el lunes y la calle queda a oscuras.',
      lat: 39.54,
      lng: -0.57,
      foto_ref: 'tg:FILE-X',
    }).id
  })

  it('openDb deja la base en la última versión', () => {
    expect(db.pragma('user_version', { simple: true })).toBe(
      MIGRACIONES[MIGRACIONES.length - 1].version,
    )
  })

  it('una queja nueva guarda a su autor por ciudadano, con su canal', () => {
    const fila = db
      .prepare('SELECT ciudadano_id, canal, foto_ref FROM quejas WHERE id = ?')
      .get(id) as {
      ciudadano_id: number
      canal: string
      foto_ref: string
    }
    expect(fila.ciudadano_id).toBe(idCiudadano(db, VECINA))
    expect(fila.canal).toBe('telegram')
    expect(fila.foto_ref).toBe('tg:FILE-X')
    expect(esAutor(db, id, VECINA)).toBe(true)
    expect(esAutor(db, id, VECINO)).toBe(false)
  })

  it('cada cual ve lo suyo, y preguntar no crea a nadie', () => {
    expect(listUserQuejas(db, VECINA).map((q) => q.id)).toEqual([id])
    const antes = ciudadanos(db)
    expect(listUserQuejas(db, DESCONOCIDA)).toEqual([])
    expect(idCiudadano(db, DESCONOCIDA)).toBeNull()
    expect(esAutor(db, id, DESCONOCIDA)).toBe(false)
    expect(ciudadanos(db)).toBe(antes)
  })

  it('sólo el autor retira, y retirar borra quién la escribió, dónde y la foto', () => {
    expect(softDeleteQueja(db, id, VECINO)).toBe(false)
    expect(softDeleteQueja(db, id, DESCONOCIDA)).toBe(false)
    expect(softDeleteQueja(db, id, VECINA)).toBe(true)
    const fila = db
      .prepare('SELECT ciudadano_id, lat, lng, foto_ref, deleted_at FROM quejas WHERE id = ?')
      .get(id) as Record<string, unknown>
    expect(fila).toMatchObject({ ciudadano_id: null, lat: null, lng: null, foto_ref: null })
    expect(fila.deleted_at).not.toBeNull()
    // Ya no es suya: ni sale en /mis ni se puede retirar otra vez.
    expect(listUserQuejas(db, VECINA)).toEqual([])
    expect(softDeleteQueja(db, id, VECINA)).toBe(false)
  })

  it('apoyar crea al que apoya, una sola vez', () => {
    expect(addApoyo(db, id, VECINO)).toEqual({ added: true, count: 1 })
    expect(addApoyo(db, id, VECINO)).toEqual({ added: false, count: 1 })
    expect(countApoyos(db, id)).toBe(1)
    expect(idCiudadano(db, VECINO)).not.toBeNull()
  })

  it('el mismo número en otro canal es otra persona', () => {
    const otra = { canal: 'whatsapp' as const, ref: VECINA.ref }
    expect(esAutor(db, id, otra)).toBe(false)
    expect(listUserQuejas(db, otra)).toEqual([])
  })
})
