import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import {
  BASE_V0,
  CANALES,
  DECISIONES_MODERACION,
  MIGRACIONES,
  MIGRACIONES_DEL_ENSAYO,
  MIGRACIONES_EN_ENSAYO,
  MODERACIONES,
  MOTIVOS_VACIADO,
  ensayarMigracion,
  migrar,
  type Migracion,
} from '../src/db/migraciones.ts'

/**
 * La primera migración de verdad de la base del bot, contra la ÚNICA copia de
 * los datos (un volumen en Fly). Hasta hoy `openDb` ejecuta schema.sql, que sólo
 * sabe `CREATE … IF NOT EXISTS`: una tabla nueva aparece sola, y un cambio de
 * columna no se aplica nunca —`npm run migrate` apunta a un fichero que no
 * existe—. La identidad pasa de `telegram_user_id` (un entero de Telegram, y 0
 * como centinela de «retirada») a `ciudadanos` (canal + referencia), para que
 * una queja pueda llegar por WhatsApp.
 *
 * Se prueba contra una base en el esquema v0 con filas representativas
 * (fixtures/esquema-v0.sql + fixtures/bd-v0.sql, sintéticas: el repositorio es
 * público), en fichero y en WAL, como en producción.
 */
const FIX = join(__dirname, 'fixtures')
const ESQUEMA_V0 = readFileSync(join(FIX, 'esquema-v0.sql'), 'utf8')
const BD_V0 = readFileSync(join(FIX, 'bd-v0.sql'), 'utf8')

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cp-migrar-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

/** Una base v0 en fichero, en WAL, con las filas de muestra, cerrada. */
function baseV0(extra = ''): string {
  const ruta = join(dir, 'bot.db')
  const db = new Database(ruta)
  db.pragma('journal_mode = WAL')
  db.exec(ESQUEMA_V0)
  db.exec(BD_V0)
  if (extra) db.exec(extra)
  db.close()
  return ruta
}

/** Abierta como la abre el bot: WAL y claves ajenas encendidas. */
function abrir(ruta: string): Database.Database {
  const db = new Database(ruta)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}

const cuenta = (db: Database.Database, tabla: string) =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${tabla}`).get() as { n: number }).n

/** El esquema, sin espacios de más: para comparar dos bases. */
const esquema = (db: Database.Database) =>
  (
    db
      .prepare(
        "SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
      )
      .all() as Array<{ type: string; name: string; sql: string | null }>
  ).map((r) => ({ ...r, sql: (r.sql ?? '').replace(/\s+/g, ' ').trim() }))

describe('schema.sql es la base v0, congelada', () => {
  it('schema.sql es exactamente el fixture v0: los cambios van en migraciones.ts', () => {
    expect(BASE_V0).toBe(ESQUEMA_V0)
  })
})

describe('migrar — de v0 a la última', () => {
  it('lleva la base de muestra entera a la última versión, sin perder filas', () => {
    const ruta = baseV0()
    const db = abrir(ruta)
    const r = migrar(db, { ruta, log: () => {} })
    const ultima = MIGRACIONES[MIGRACIONES.length - 1].version
    expect(r).toMatchObject({ desde: 0, hasta: ultima })
    expect(r.aplicadas).toHaveLength(MIGRACIONES.length)
    expect(db.pragma('user_version', { simple: true })).toBe(ultima)

    // Autores y quien sólo apoya tienen ciudadano; quien sólo se suscribe, no:
    // no hace falta guardar a nadie para nada.
    const refs = (
      db
        .prepare("SELECT ref FROM ciudadanos WHERE canal = 'telegram' ORDER BY ref")
        .all() as Array<{
        ref: string
      }>
    ).map((c) => c.ref)
    expect(refs).toEqual([
      '1001',
      '1002',
      '1003',
      ...Array.from({ length: 10 }, (_, i) => String(2001 + i)),
    ])
    expect(refs).not.toContain('3001')
    expect(refs).not.toContain('0')

    // Las quejas, con su autor por ciudadano; la retirada, sin nadie.
    const autor = (id: string) =>
      (
        db
          .prepare(
            'SELECT c.ref FROM quejas q LEFT JOIN ciudadanos c ON c.id = q.ciudadano_id WHERE q.id = ?',
          )
          .get(id) as { ref: string | null }
      ).ref
    expect(autor('Q-AAAA0001')).toBe('1001')
    expect(autor('Q-AAAA0002')).toBe('1001')
    expect(autor('Q-BBBB0001')).toBe('1002')
    expect(autor('Q-DDDD0001')).toBe('1003')
    expect(autor('Q-CCCC0001')).toBeNull()

    // La foto, con su canal; la cadena vacía no era una foto.
    const foto = (id: string) =>
      (
        db.prepare('SELECT foto_ref FROM quejas WHERE id = ?').get(id) as {
          foto_ref: string | null
        }
      ).foto_ref
    expect(foto('Q-AAAA0001')).toBe('tg:FILE-A')
    expect(foto('Q-DDDD0001')).toBeNull()
    expect(foto('Q-AAAA0002')).toBeNull()

    // Todas llegaron por Telegram.
    expect(db.prepare('SELECT DISTINCT canal FROM quejas').all()).toEqual([{ canal: 'telegram' }])

    // Ni rastro de las columnas de Telegram en quejas.
    const columnas = (db.prepare('PRAGMA table_info(quejas)').all() as Array<{ name: string }>).map(
      (c) => c.name,
    )
    expect(columnas).not.toContain('telegram_user_id')
    expect(columnas).not.toContain('telegram_username')
    expect(columnas).not.toContain('photo_file_id')
    expect(columnas).toEqual(expect.arrayContaining(['ciudadano_id', 'canal', 'foto_ref']))

    // Cuentas por tabla: nada se pierde.
    expect(cuenta(db, 'quejas')).toBe(5)
    expect(cuenta(db, 'apoyos')).toBe(11)
    expect(cuenta(db, 'events')).toBe(8)
    expect(cuenta(db, 'subscriptions')).toBe(1)
    expect(cuenta(db, 'curation_decisions')).toBe(1)
    expect(cuenta(db, 'repo_eventos_vistos')).toBe(1)
    expect(cuenta(db, 'fotos_retenidas')).toBe(1)

    // Los apoyos, por ciudadano, y el umbral de los diez sigue en su sitio.
    const apoyosDe = (id: string) =>
      (db.prepare('SELECT COUNT(*) AS n FROM apoyos WHERE queja_id = ?').get(id) as { n: number }).n
    expect(apoyosDe('Q-AAAA0002')).toBe(10)
    expect(apoyosDe('Q-AAAA0001')).toBe(1)
    const quienApoya = db
      .prepare(
        "SELECT c.ref FROM apoyos a JOIN ciudadanos c ON c.id = a.ciudadano_id WHERE a.queja_id = 'Q-AAAA0001'",
      )
      .get() as { ref: string }
    expect(quienApoya.ref).toBe('1002')

    // Integridad: claves ajenas y la base entera.
    expect(db.pragma('foreign_key_check')).toEqual([])
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok')
    // `events` y `fotos_retenidas` siguen apuntando a `quejas`: no se ha reconstruido.
    const apuntaA = (t: string) =>
      (db.pragma(`foreign_key_list(${t})`) as Array<{ table: string }>).map((f) => f.table)
    expect(apuntaA('events')).toEqual(['quejas'])
    expect(apuntaA('fotos_retenidas')).toEqual(['quejas'])
    expect(apuntaA('apoyos').sort()).toEqual(['ciudadanos', 'quejas'])
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    // Y deja constancia.
    expect(db.prepare('SELECT version, nombre FROM migraciones_aplicadas').all()).toEqual(
      MIGRACIONES.map((m) => ({ version: m.version, nombre: m.nombre })),
    )
    db.close()
  })

  it('una segunda pasada no hace nada ni saca otra copia', () => {
    const ruta = baseV0()
    const db = abrir(ruta)
    migrar(db, { ruta, log: () => {} })
    const copias = readdirSync(join(dir, 'backups'))
    const r = migrar(db, { ruta, log: () => {} })
    expect(r.aplicadas).toEqual([])
    expect(r.copia).toBeNull()
    expect(readdirSync(join(dir, 'backups'))).toEqual(copias)
    db.close()
  })

  it('antes de migrar saca una copia, y la copia se abre y es v0', () => {
    const ruta = baseV0()
    const db = abrir(ruta)
    const r = migrar(db, { ruta, log: () => {} })
    db.close()
    expect(r.copia, 'no hay copia de seguridad').toBeTruthy()
    expect(readdirSync(join(dir, 'backups')).filter((f) => f.endsWith('.tmp'))).toEqual([])
    const antes = new Database(r.copia!, { readonly: true })
    expect(antes.pragma('user_version', { simple: true })).toBe(0)
    expect(cuenta(antes, 'quejas')).toBe(5)
    const columnas = (
      antes.prepare('PRAGMA table_info(quejas)').all() as Array<{ name: string }>
    ).map((c) => c.name)
    expect(columnas).toContain('telegram_user_id')
    antes.close()
  })

  it('una base nueva y una migrada acaban con el mismo esquema', () => {
    const ruta = baseV0()
    const migrada = abrir(ruta)
    migrar(migrada, { ruta, log: () => {} })
    const nueva = new Database(':memory:')
    migrar(nueva, { ruta: ':memory:', log: () => {} })
    expect(esquema(nueva).length).toBeGreaterThan(10) // el control: hay algo que comparar
    expect(esquema(nueva)).toEqual(esquema(migrada))
    migrada.close()
    nueva.close()
  })

  it('si una migración falla, no deja nada a medias: ni la versión ni las claves ajenas apagadas', () => {
    const ruta = baseV0()
    const db = abrir(ruta)
    const rota: Migracion[] = [
      {
        version: 1,
        nombre: 'rota',
        aplicar: (d) => {
          d.exec('CREATE TABLE a_medias (x INTEGER)')
          throw new Error('fallo a propósito')
        },
      },
    ]
    expect(() => migrar(db, { ruta, migraciones: rota, log: () => {} })).toThrow(/a propósito/)
    expect(db.pragma('user_version', { simple: true })).toBe(0)
    expect(
      db.prepare("SELECT name FROM sqlite_schema WHERE name = 'a_medias'").get(),
    ).toBeUndefined()
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    db.close()
  })

  it('un apoyo que no se puede atribuir para la migración entera, en vez de perderse', () => {
    // Un apoyo con el centinela 0 no lo escribe el código, pero si la base lo
    // tuviera, la migración lo perdería en silencio y la cifra publicada bajaría.
    const ruta = baseV0("INSERT INTO apoyos (queja_id, telegram_user_id) VALUES ('Q-BBBB0001', 0);")
    const db = abrir(ruta)
    expect(() => migrar(db, { ruta, log: () => {} })).toThrow(/apoyos/)
    expect(db.pragma('user_version', { simple: true })).toBe(0)
    expect(cuenta(db, 'apoyos')).toBe(12)
    db.close()
  })

  it('una base de un código más nuevo no se toca', () => {
    const db = new Database(':memory:')
    db.pragma('user_version = 99')
    const avisos: string[] = []
    const r = migrar(db, { ruta: ':memory:', log: (l) => avisos.push(l) })
    expect(r).toMatchObject({ desde: 99, hasta: 99, aplicadas: [] })
    expect(avisos.join('\n')).toMatch(/más nuevo/)
    expect(db.prepare("SELECT name FROM sqlite_schema WHERE name = 'quejas'").get()).toBeUndefined()
    db.close()
  })

  it('los canales del CHECK son los que exporta migraciones.ts', () => {
    const db = new Database(':memory:')
    migrar(db, { ruta: ':memory:', log: () => {} })
    const sql = (
      db.prepare("SELECT sql FROM sqlite_schema WHERE name = 'ciudadanos'").get() as { sql: string }
    ).sql
    // Sólo la cláusula del CHECK: el resto de la sentencia tiene otras comillas
    // (`datetime('now')`).
    const clausula = /CHECK \(canal IN \(([^)]*)\)\)/.exec(sql)?.[1] ?? ''
    const enCheck = [...clausula.matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort()
    expect(enCheck.length).toBeGreaterThan(0) // el control: el patrón mira algo
    expect(enCheck).toEqual([...CANALES].sort())
    db.close()
  })

  it('cada CREATE TABLE del código existe en una base migrada (ninguna tabla fantasma)', () => {
    const db = new Database(':memory:')
    // Con todas: las activas y las que están en ensayo, que el código ya escribe.
    migrar(db, { ruta: ':memory:', migraciones: MIGRACIONES_DEL_ENSAYO, log: () => {} })
    const tablas = new Set(
      (
        db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all() as Array<{
          name: string
        }>
      ).map((r) => r.name),
    )
    const src = join(__dirname, '..', 'src')
    const fuentes = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? fuentes(join(d, e.name))
          : /\.(ts|sql)$/.test(e.name)
            ? [readFileSync(join(d, e.name), 'utf8')]
            : [],
      )
    const nombres = new Set(
      fuentes(src).flatMap((t) =>
        [...t.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/g)].map((m) => m[1]),
      ),
    )
    expect(nombres.size).toBeGreaterThan(5) // el control
    // `apoyos_v0` es el nombre de paso de la reconstrucción: no sobrevive.
    const fantasma = [...nombres].filter((n) => !tablas.has(n) && n !== 'apoyos_v0')
    expect(fantasma).toEqual([])
    expect(tablas.has('apoyos_v0')).toBe(false)
    db.close()
  })

  it('en memoria no hay copia que sacar', () => {
    const db = new Database(':memory:')
    const r = migrar(db, { ruta: ':memory:', dirCopias: join(dir, 'backups'), log: () => {} })
    expect(r.copia).toBeNull()
    expect(existsSync(join(dir, 'backups'))).toBe(false)
    db.close()
  })
})

describe('el ensayo: la migración sobre una copia, sin tocar la base', () => {
  it('cuenta antes y después, comprueba, borra la copia y deja la base como estaba', () => {
    const ruta = baseV0()
    const e = ensayarMigracion(ruta, { log: () => {} })
    expect(e.ok).toBe(true)
    expect(e.antes).toMatchObject({ quejas: 5, apoyos: 11, events: 8, subscriptions: 1 })
    expect(e.despues).toMatchObject({ quejas: 5, apoyos: 11, events: 8, ciudadanos: 13 })
    expect(e.hasta).toBe(MIGRACIONES[MIGRACIONES.length - 1].version)
    // La base, intacta: sigue en v0 y con sus columnas de Telegram.
    const db = new Database(ruta, { readonly: true })
    expect(db.pragma('user_version', { simple: true })).toBe(0)
    const columnas = (db.prepare('PRAGMA table_info(quejas)').all() as Array<{ name: string }>).map(
      (c) => c.name,
    )
    expect(columnas).toContain('telegram_user_id')
    db.close()
    // Y ni la copia ni sus restos —ni una carpeta de copias— se quedan en el volumen.
    expect(readdirSync(dir).filter((f) => !/^bot\.db(-wal|-shm)?$/.test(f))).toEqual([])
  })

  it('un ensayo que falla lo dice, y también borra la copia', () => {
    const ruta = baseV0("INSERT INTO apoyos (queja_id, telegram_user_id) VALUES ('Q-BBBB0001', 0);")
    const e = ensayarMigracion(ruta, { log: () => {} })
    expect(e.ok).toBe(false)
    expect(e.error).toMatch(/apoyos/)
    expect(readdirSync(dir).filter((f) => !/^bot\.db(-wal|-shm)?$/.test(f))).toEqual([])
  })
})

/**
 * Una migración que producción aún no tiene se ensaya contra su base antes de
 * activarse (bot/DEPLOY.md), y el ensayo corre el código de la imagen
 * desplegada. Así que llega primero inerte, en `MIGRACIONES_EN_ENSAYO`: el bot
 * no la aplica al arrancar y `migrate.ts --dry-run` sí la ensaya. El cambio
 * que la usa la pasa después a `MIGRACIONES`. Estas pruebas valen igual con la
 * lista en ensayo vacía.
 */
describe('las migraciones en ensayo', () => {
  const ultima = (lista: readonly Migracion[]) => lista[lista.length - 1].version

  it('el ensayo son las activas y, detrás, las que están en ensayo', () => {
    expect(MIGRACIONES_DEL_ENSAYO).toEqual([...MIGRACIONES, ...MIGRACIONES_EN_ENSAYO])
    const versiones = MIGRACIONES_DEL_ENSAYO.map((m) => m.version)
    expect(versiones).toEqual(versiones.map((_, i) => i + 1))
  })

  it('el bot no aplica al arrancar las que están en ensayo', () => {
    const db = new Database(':memory:')
    migrar(db, { ruta: ':memory:', log: () => {} })
    expect(db.pragma('user_version', { simple: true })).toBe(ultima(MIGRACIONES))
    db.close()
  })

  it('el ensayo sí las corre, desde la versión de producción, sin perder filas', () => {
    const ruta = baseV0()
    const db = abrir(ruta)
    migrar(db, { ruta, log: () => {} })
    db.close()
    const e = ensayarMigracion(ruta, { migraciones: MIGRACIONES_DEL_ENSAYO, log: () => {} })
    expect(e.ok, e.error).toBe(true)
    expect(e.desde).toBe(ultima(MIGRACIONES))
    expect(e.hasta).toBe(ultima(MIGRACIONES_DEL_ENSAYO))
    // Exactamente las que están en ensayo: con la lista vacía, ninguna.
    expect(e.aplicadas).toEqual(MIGRACIONES_EN_ENSAYO.map((m) => `${m.version}-${m.nombre}`))
    for (const t of ['quejas', 'apoyos', 'events']) expect(e.despues?.[t]).toBe(e.antes[t])
  })

  it('`migrate.ts --dry-run` ensaya también las que están en ensayo', () => {
    const ruta = baseV0()
    const db = abrir(ruta)
    migrar(db, { ruta, log: () => {} })
    db.close()
    const bot = join(__dirname, '..')
    const salida = execFileSync(
      join(bot, 'node_modules', '.bin', 'tsx'),
      [join(bot, 'src', 'db', 'migrate.ts'), '--dry-run', '--db', ruta],
      { encoding: 'utf8' },
    )
    expect(salida).toContain(
      `ENSAYO correcto: de la versión ${ultima(MIGRACIONES)} a la ${ultima(MIGRACIONES_DEL_ENSAYO)}`,
    )
  })
})

/**
 * La migración 2: la revisión antes de publicar. Llegó en ensayo (#138) y
 * #137 la activó; se prueba con la lista del ensayo, que la incluye igual.
 *
 * Una queja nueva nace `pendiente` y no sale hasta que se decide. Las que ya
 * estaban publicadas lo siguen estando —no se despublica nada al desplegar—, y
 * queda dicho que entraron sin revisión: una fila `heredada` en `moderaciones`,
 * el registro de decisiones, y no un evento, que /estado pinta a cualquiera.
 * Producción está en la v1, así que se prueba desde ahí.
 */
describe('la migración 2: la revisión antes de publicar', () => {
  const comprobar = (db: Database.Database) => {
    expect(db.pragma('user_version', { simple: true })).toBe(2)
    const filas = db
      .prepare('SELECT moderacion, publicada_at, created_at FROM quejas')
      .all() as Array<{ moderacion: string; publicada_at: string; created_at: string }>
    expect(filas).toHaveLength(5)
    for (const f of filas) {
      expect(f.moderacion).toBe('publicada')
      expect(f.publicada_at).toBe(f.created_at)
    }
    expect(
      db
        .prepare('SELECT decision, por, COUNT(*) AS n FROM moderaciones GROUP BY decision, por')
        .all(),
    ).toEqual([{ decision: 'heredada', por: 'migracion', n: 5 }])
    expect(cuenta(db, 'avisos')).toBe(0)
    expect(cuenta(db, 'tarjetas_por_vaciar')).toBe(0)
    expect(cuenta(db, 'events')).toBe(8) // ni un evento de más
    expect(db.pragma('foreign_key_check')).toEqual([])
  }

  it('desde la v0, todo lo que había sigue publicado, y consta cómo', () => {
    const ruta = baseV0()
    const db = abrir(ruta)
    migrar(db, { ruta, migraciones: MIGRACIONES_DEL_ENSAYO.slice(0, 2), log: () => {} })
    comprobar(db)
    db.close()
  })

  it('desde la v1, que es donde está producción', () => {
    const ruta = baseV0()
    const db = abrir(ruta)
    migrar(db, { ruta, migraciones: MIGRACIONES_DEL_ENSAYO.slice(0, 1), log: () => {} })
    expect(db.pragma('user_version', { simple: true })).toBe(1)
    migrar(db, { ruta, migraciones: MIGRACIONES_DEL_ENSAYO.slice(0, 2), log: () => {} })
    comprobar(db)
    db.close()
  })

  it('una queja nueva nace pendiente: publicar es una decisión, no el valor por defecto', () => {
    const db = new Database(':memory:')
    migrar(db, { ruta: ':memory:', migraciones: MIGRACIONES_DEL_ENSAYO.slice(0, 2), log: () => {} })
    db.prepare(
      "INSERT INTO quejas (id, category, title, detail) VALUES ('Q-00000001', 'otros', 't', 'd')",
    ).run()
    expect(db.prepare("SELECT moderacion FROM quejas WHERE id = 'Q-00000001'").get()).toEqual({
      moderacion: 'pendiente',
    })
    db.close()
  })

  it('los estados de los CHECK son los que exporta migraciones.ts', () => {
    const db = new Database(':memory:')
    migrar(db, { ruta: ':memory:', migraciones: MIGRACIONES_DEL_ENSAYO.slice(0, 2), log: () => {} })
    const clausula = (tabla: string, columna: string) => {
      const sql = (
        db.prepare('SELECT sql FROM sqlite_schema WHERE name = ?').get(tabla) as { sql: string }
      ).sql
      const m = new RegExp(`CHECK \\(${columna} IN \\(([^)]*)\\)\\)`).exec(sql)?.[1] ?? ''
      return [...m.matchAll(/'([a-z]+)'/g)].map((x) => x[1]).sort()
    }
    // El de quejas vive en un ALTER TABLE ADD COLUMN: SQLite lo guarda en la sentencia de la tabla.
    expect(clausula('quejas', 'moderacion').length).toBeGreaterThan(0)
    expect(clausula('quejas', 'moderacion')).toEqual([...MODERACIONES].sort())
    expect(clausula('moderaciones', 'decision')).toEqual([...DECISIONES_MODERACION].sort())
    expect(clausula('tarjetas_por_vaciar', 'motivo')).toEqual([...MOTIVOS_VACIADO].sort())
    db.close()
  })
})

/**
 * Una migración ensayada contra producción no se cambia: se escribe otra. Cada
 * una deja aquí la huella del SQL que ejecuta, tomada al desplegarla en ensayo.
 * Si su texto cambia después, esta prueba se pone en rojo: lo que arrancaría el
 * bot ya no es lo que se ensayó (bot/DEPLOY.md). La revisión de #138 lo pidió
 * porque la 2 cambió dos veces durante la revisión de #137, y nada ataba la que
 * se activa a la que se ensaya. Una migración nueva añade su huella al entrar en
 * `MIGRACIONES_EN_ENSAYO`.
 */
const HUELLAS: Record<string, string> = {
  '1': '1abc5ac7b770a7d9', // identidad-por-ciudadano, ensayada y activa desde #135
  '2': '3d318e573180cd9f', // revision-antes-de-publicar, en ensayo desde #138
}

/** El SQL que ejecuta una migración, sobre una base en la versión anterior, resumido. */
function huellaDe(m: Migracion): string {
  const db = new Database(':memory:')
  if (m.version === 1) db.exec(BASE_V0)
  else {
    migrar(db, {
      ruta: ':memory:',
      migraciones: MIGRACIONES_DEL_ENSAYO.slice(0, m.version - 1),
      log: () => {},
    })
  }
  const sql: string[] = []
  const exec = db.exec.bind(db)
  const prepare = db.prepare.bind(db)
  db.exec = ((s: string) => {
    sql.push(s)
    return exec(s)
  }) as typeof db.exec
  db.prepare = ((s: string) => {
    sql.push(s)
    return prepare(s)
  }) as typeof db.prepare
  db.pragma('foreign_keys = OFF')
  db.transaction(() => m.aplicar(db))()
  db.close()
  expect(sql.length, `la migración ${m.version} no ejecutó nada`).toBeGreaterThan(0)
  return createHash('sha256').update(sql.join('\n')).digest('hex').slice(0, 16)
}

describe('una migración ensayada no cambia', () => {
  it('el SQL de cada migración es el de su huella', () => {
    const vistas = Object.fromEntries(
      MIGRACIONES_DEL_ENSAYO.map((m) => [String(m.version), huellaDe(m)]),
    )
    expect(vistas).toEqual(HUELLAS)
  })
})
