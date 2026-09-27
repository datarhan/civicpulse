import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { migrar } from './migraciones.ts'
import { anonimizaRetiradas } from './queries.ts'

export type Db = Database.Database

/**
 * Abre la base (':memory:' en las pruebas) y la lleva a la última versión del
 * esquema (db/migraciones.ts): una base nueva nace de la v0 y se migra como la
 * de producción, así que las dos acaban iguales. En producción, la primera vez,
 * `migrar` saca antes una copia de seguridad junto a la base.
 */
export function openDb(path?: string): Db {
  const target = path ?? process.env.DB_PATH ?? './data/bot.db'
  if (target !== ':memory:') {
    mkdirSync(dirname(target), { recursive: true })
  }
  const db = new Database(target)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')
  // En memoria (las pruebas) se migra cada vez: sin eco.
  migrar(db, { ruta: target, log: target === ':memory:' ? () => {} : undefined })
  // Las retiradas de antes de que /olvidar borrara la identidad salen anónimas
  // del primer arranque: ver `anonimizaRetiradas`.
  anonimizaRetiradas(db)
  return db
}
