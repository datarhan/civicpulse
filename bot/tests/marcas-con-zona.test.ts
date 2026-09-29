/**
 * Las marcas de tiempo de quejas.json dicen su zona.
 *
 * SQLite rellena `created_at`, `updated_at` y `registered_at` con
 * `datetime('now')`: la hora UTC escrita «2026-07-02 23:30:00», sin decir que es
 * UTC. El export las copiaba tal cual a `requested_datetime`, `updated_datetime`
 * y `registered_at`, y `new Date()` lee esa forma en la hora LOCAL de quien la
 * lee. Medido el 28-09-2026 en Chrome 152 con el reloj en Madrid: «2026-09-20
 * 22:30:00» salía 20:30Z, dos horas antes, y la ficha fechaba el 20 de
 * septiembre una queja enviada a la 00:30 del 21. Además la instantánea declara
 * Open311 GeoReport v2, que pide la fecha y la hora con su zona.
 *
 * Lo que sale es ISO con la Z; lo que se guarda sigue siendo la forma de SQLite
 * (el último caso lo fija): `ORDER BY created_at` compara texto, y una columna
 * con filas nuevas en «…T…Z» y viejas en «… …» se ordenaría por la forma.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { openDb, type Db } from '../src/db/client'
import { autorTelegram, setState, type NewQuejaInput } from '../src/db/queries'
import { buildSnapshot, type PublicQuejaRow } from '../src/services/snapshot'
import { marcaDeLaSede } from '../src/services/recibo-sede'
import { marcaDeAhora } from './helpers/marca'
import { creaPublicada } from './helpers/publicada'

const ISO_CON_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/
const FORMA_DE_SQLITE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

function muestra(): NewQuejaInput {
  return {
    autor: autorTelegram(42),
    category: 'urbanismo',
    title: 'Farola apagada',
    detail: 'La farola de la plaza lleva apagada desde Nochevieja.',
    lat: 39.5439,
    lng: -0.5711,
    neighborhood: 'casco',
    foto_ref: null,
    concejalia_area: 'Urbanismo',
    concejal_slug: null,
  }
}

/** La fila pública de una queja, tal y como sale en quejas.json. */
function exportada(db: Db, id: string): PublicQuejaRow {
  const fila = buildSnapshot(db, 1000, { photoUrlFor: () => null }).items.find(
    (r) => r.service_request_id === id,
  )
  expect(fila, `${id} no sale en la instantánea`).toBeDefined()
  return fila!
}

describe('buildSnapshot · las marcas de tiempo salen con su zona', () => {
  let db: Db
  beforeEach(() => {
    db = openDb(':memory:')
  })

  it('requested_datetime y updated_datetime: la hora UTC de SQLite, con la T y la Z', () => {
    const q = creaPublicada(db, muestra())
    db.prepare('UPDATE quejas SET created_at = ?, updated_at = ? WHERE id = ?').run(
      '2026-07-02 23:30:00',
      '2026-07-03 08:15:00',
      q.id,
    )
    const fila = exportada(db, q.id)
    expect(fila.requested_datetime).toBe('2026-07-02T23:30:00Z')
    expect(fila.updated_datetime).toBe('2026-07-03T08:15:00Z')
    // El instante es el que apuntó SQLite, lo lea el reloj que lo lea.
    expect(Date.parse(fila.requested_datetime)).toBe(Date.UTC(2026, 6, 2, 23, 30))
  })

  it('registered_at: null mientras no hay registro, y con la Z cuando lo hay', () => {
    const q = creaPublicada(db, muestra())
    expect(exportada(db, q.id).registered_at).toBeNull()
    db.prepare('UPDATE quejas SET registered_at = ? WHERE id = ?').run('2026-09-27 22:00:01', q.id)
    expect(exportada(db, q.id).registered_at).toBe('2026-09-27T22:00:01Z')
  })

  it('lo que escribe datetime("now") sale con la Z y en su instante', () => {
    // Sin tocar las columnas: el DEFAULT de la tabla y el registro de `setState`.
    // `registered_at` ya no lo pone `datetime('now')` sino el recibo de la sede
    // (#169), en la misma forma; aquí, la de ahora.
    const antes = Date.now()
    const q = creaPublicada(db, muestra())
    setState(db, q.id, 'registrada', {
      entry_number: 'RE-1',
      csv: 'CSV-1',
      registered_at: marcaDeAhora(),
    })
    const fila = exportada(db, q.id)
    for (const campo of ['requested_datetime', 'updated_datetime', 'registered_at'] as const) {
      const marca = fila[campo]
      expect(marca, campo).toMatch(ISO_CON_Z)
      // SQLite guarda segundos enteros; leída en hora local se iría horas.
      expect(Math.abs(Date.parse(marca!) - antes), campo).toBeLessThan(5_000)
    }
  })

  it('en la base se sigue guardando la forma de SQLite', () => {
    const q = creaPublicada(db, muestra())
    // La fecha de registro, por el camino de producción: la del recibo, que
    // `marcaDeLaSede` convierte a la forma de SQLite, no a la de la Z.
    const registered_at = marcaDeLaSede('28/09/2026', '0:00:01')!
    setState(db, q.id, 'registrada', { entry_number: 'RE-1', csv: 'CSV-1', registered_at })
    const guardada = db
      .prepare('SELECT created_at, updated_at, registered_at FROM quejas WHERE id = ?')
      .get(q.id) as Record<string, string>
    for (const [campo, marca] of Object.entries(guardada)) {
      expect(marca, campo).toMatch(FORMA_DE_SQLITE)
    }
  })
})
