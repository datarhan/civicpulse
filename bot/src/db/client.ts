import Database from 'better-sqlite3'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCHEMA_PATH = resolve(HERE, 'schema.sql')

export type Db = Database.Database

/**
 * Open (and initialise) the SQLite file. Pass ':memory:' for tests.
 * Schema is applied idempotently — safe to call at every boot.
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
  const schema = readFileSync(SCHEMA_PATH, 'utf8')
  db.exec(schema)
  return db
}
