/**
 * Las migraciones de la base del bot, por `PRAGMA user_version`.
 *
 * Hasta el 2026-09-27 `openDb` ejecutaba `schema.sql` en cada arranque, y ese
 * fichero sólo sabe `CREATE … IF NOT EXISTS`: una tabla nueva aparecía sola, y un
 * cambio de columna no se aplicaba NUNCA —`npm run migrate` apuntaba a un fichero
 * que no existía—. La base vive en un volumen de Fly y es la única copia de los
 * datos, así que el primer cambio de columna de verdad (la identidad por
 * ciudadano, para que una queja pueda llegar por WhatsApp) necesitaba esto antes.
 *
 * CÓMO CORRE `migrar`:
 *
 *   1. Una base con una versión MAYOR que la última que este código conoce es
 *      la de un código más nuevo: se avisa y no se toca nada.
 *   2. `schema.sql` es la base v0 CONGELADA (`BASE_V0`), y sólo se ejecuta con
 *      `user_version = 0`: en una base nueva la crea, y en la de producción
 *      antes de la primera migración no hace nada. Después de la migración 1 ya
 *      no se puede ejecutar: crea un índice sobre una columna que ya no existe.
 *   3. Si hay migraciones pendientes y la base es un fichero con datos, antes de
 *      tocar nada se saca una copia con `VACUUM INTO` (que funciona en WAL e
 *      incluye lo que el WAL tenga), en `<carpeta de la base>/backups/`. Si la
 *      copia falla, no se migra. Las copias llevan datos personales.
 *   4. `foreign_keys` se apaga FUERA de toda transacción (dentro no hace nada),
 *      y cada migración va en SU transacción junto con `foreign_key_check`
 *      —que tiene que salir vacío—, `user_version` y su fila en
 *      `migraciones_aplicadas`. Un fallo deshace la migración entera, versión
 *      incluida, y la siguiente vez se repite desde cero.
 *   5. Al final, `foreign_keys` vuelve a encenderse pase lo que pase, y un
 *      `quick_check` tiene que decir `ok`.
 *
 * `ensayarMigracion` hace lo mismo sobre una copia temporal junto a la base, lo
 * cuenta y la borra: así se prueba contra el volumen de verdad sin que los datos
 * salgan de él (`npm run migrate -- --dry-run`, db/migrate.ts).
 *
 * Nunca se renombra `quejas`: `apoyos`, `events` y `fotos_retenidas` apuntan a
 * ella, y desde SQLite 3.26 un `ALTER TABLE … RENAME` reescribe esas referencias.
 * Las columnas de `quejas` se cambian con ADD/RENAME/DROP COLUMN (DROP COLUMN
 * existe desde SQLite 3.35; el que trae better-sqlite3 12.11 es el 3.53). Sólo se
 * reconstruye una tabla HOJA, y renombrándola primero, para que el único
 * `CREATE TABLE` del código sea el del nombre final.
 *
 * Una migración ya aplicada no se cambia nunca: una base nueva la ejecutaría
 * distinta de como la ejecutó producción. Lo que haga falta después, en otra.
 */
import { readFileSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

type Db = Database.Database

const HERE = dirname(fileURLToPath(import.meta.url))

/** La base v0, congelada: `schema.sql` tal como estaba antes de la primera migración. */
export const BASE_V0 = readFileSync(resolve(HERE, 'schema.sql'), 'utf8')

/**
 * Por dónde puede llegar un ciudadano. El CHECK de la migración 1 los escribe
 * literales —una migración no cambia—; una prueba compara los dos, así que un
 * canal nuevo aquí exige su migración.
 */
export const CANALES = ['telegram', 'whatsapp'] as const
export type Canal = (typeof CANALES)[number]

/**
 * Dónde está una queja en la revisión antes de publicar. Sólo `publicada` sale
 * al público (`SQL_PUBLICA`, db/queries.ts). Están TODOS los que hará falta
 * —también `retenida`, que es la de la revisión automática—: el CHECK de la
 * migración 2 los escribe literales, y SQLite no deja cambiar un CHECK sin
 * reconstruir `quejas`, que es la tabla que no se reconstruye nunca.
 */
export const MODERACIONES = [
  'pendiente',
  'retenida',
  'publicada',
  'descartada',
  'retirada',
] as const
export type Moderacion = (typeof MODERACIONES)[number]

/** Lo que se anota en `moderaciones`: las decisiones, más `heredada` (lo que ya estaba publicado). */
export const DECISIONES_MODERACION = ['heredada', ...MODERACIONES] as const
export type DecisionModeracion = (typeof DECISIONES_MODERACION)[number]

export interface Migracion {
  version: number
  nombre: string
  aplicar: (db: Db) => void
}

const cuentaDe = (db: Db, sql: string) => (db.prepare(sql).get() as { n: number }).n

/**
 * Migración 1 — la identidad por ciudadano.
 *
 * `quejas.telegram_user_id` era un entero de Telegram, y 0 el centinela de
 * «retirada con /olvidar» (regla 3 de DATA_INTEGRITY: un centinela nunca es un
 * valor). Pasa a `ciudadano_id` → `ciudadanos(canal, ref)`, NULL en las
 * retiradas. Tienen fila quienes escribieron o apoyaron una queja; quien sólo se
 * suscribió, no —no hace falta guardar a nadie para nada—, y las suscripciones
 * siguen con su id de Telegram hasta que se retiren. `telegram_username` se
 * recogía y nadie lo leía: se va. `photo_file_id` pasa a `foto_ref` con el canal
 * delante (`tg:`), porque una foto de WhatsApp se descarga por otro camino.
 *
 * Se comprueba a sí misma: si un apoyo o el autor de una queja no encuentran a
 * quién atribuirse, falla entera en vez de perderlos —la cifra de apoyos es
 * pública—.
 */
function identidadPorCiudadano(db: Db): void {
  const antes = {
    apoyos: cuentaDe(db, 'SELECT COUNT(*) AS n FROM apoyos'),
    conAutor: cuentaDe(db, 'SELECT COUNT(*) AS n FROM quejas WHERE telegram_user_id != 0'),
  }
  db.exec(`
    CREATE TABLE ciudadanos (
      id         INTEGER PRIMARY KEY,
      canal      TEXT NOT NULL CHECK (canal IN ('telegram', 'whatsapp')),
      ref        TEXT NOT NULL,
      creado_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (canal, ref)
    );

    INSERT INTO ciudadanos (canal, ref)
      SELECT 'telegram', CAST(u AS TEXT) FROM (
        SELECT telegram_user_id AS u FROM quejas WHERE telegram_user_id != 0
        UNION
        SELECT telegram_user_id AS u FROM apoyos WHERE telegram_user_id != 0
      )
      ORDER BY u;

    ALTER TABLE quejas ADD COLUMN ciudadano_id INTEGER REFERENCES ciudadanos(id) ON DELETE SET NULL;
    UPDATE quejas
       SET ciudadano_id = (SELECT c.id FROM ciudadanos c
                            WHERE c.canal = 'telegram' AND c.ref = CAST(quejas.telegram_user_id AS TEXT))
     WHERE telegram_user_id != 0;

    ALTER TABLE quejas ADD COLUMN canal TEXT NOT NULL DEFAULT 'telegram'
      CHECK (canal IN ('telegram', 'whatsapp'));

    ALTER TABLE quejas RENAME COLUMN photo_file_id TO foto_ref;
    UPDATE quejas SET foto_ref = NULL WHERE foto_ref = '';
    UPDATE quejas SET foto_ref = 'tg:' || foto_ref WHERE foto_ref IS NOT NULL;

    DROP INDEX IF EXISTS idx_quejas_user;
    ALTER TABLE quejas DROP COLUMN telegram_user_id;
    ALTER TABLE quejas DROP COLUMN telegram_username;
    CREATE INDEX idx_quejas_ciudadano ON quejas(ciudadano_id);

    ALTER TABLE apoyos RENAME TO apoyos_v0;
    CREATE TABLE apoyos (
      queja_id      TEXT NOT NULL,
      ciudadano_id  INTEGER NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (queja_id, ciudadano_id),
      FOREIGN KEY (queja_id) REFERENCES quejas(id) ON DELETE CASCADE,
      FOREIGN KEY (ciudadano_id) REFERENCES ciudadanos(id) ON DELETE CASCADE
    );
    INSERT INTO apoyos (queja_id, ciudadano_id, created_at)
      SELECT a.queja_id, c.id, a.created_at
        FROM apoyos_v0 a
        JOIN ciudadanos c ON c.canal = 'telegram' AND c.ref = CAST(a.telegram_user_id AS TEXT);
    DROP TABLE apoyos_v0;
    CREATE INDEX idx_apoyos_queja ON apoyos(queja_id);
  `)
  const despues = {
    apoyos: cuentaDe(db, 'SELECT COUNT(*) AS n FROM apoyos'),
    conAutor: cuentaDe(db, 'SELECT COUNT(*) AS n FROM quejas WHERE ciudadano_id IS NOT NULL'),
  }
  if (despues.apoyos !== antes.apoyos) {
    throw new Error(
      `[migrar] identidad-por-ciudadano: ${antes.apoyos} apoyos antes y ${despues.apoyos} después; ` +
        'alguno no tiene a quién atribuirse',
    )
  }
  if (despues.conAutor !== antes.conAutor) {
    throw new Error(
      `[migrar] identidad-por-ciudadano: ${antes.conAutor} quejas con autor antes y ${despues.conAutor} después`,
    )
  }
}

/**
 * Migración 2 — la revisión antes de publicar.
 *
 * Hasta el 2026-09-27 una queja se publicaba en el acto, en la web y en el canal
 * público de Telegram, sin que nadie la leyera. Ahora nace `pendiente` —es el
 * valor por defecto: publicar es una decisión, no lo que pasa si nadie hace
 * nada— y sólo sale cuando está `publicada`. Lo que ya estaba publicado lo
 * sigue estando, con `publicada_at` = su fecha de alta, y consta como
 * `heredada` en `moderaciones`, el registro append-only de decisiones (no como
 * evento: `/estado` pinta los eventos a cualquiera). `avisos` guarda lo que el
 * bot ha mandado de cada queja y a quién: la tarjeta de cada administrador, para
 * cambiarlas todas al decidir, y el aviso de cada decisión a su autor, para no
 * repetirlo. Una fila sin `message_id` es un envío en curso: se reclama ANTES de
 * mandar, para que dos pasadas a la vez no manden dos.
 *
 * Sólo añade, y aun así NO SE PUEDE VOLVER a la imagen anterior: el código v1
 * no sabe de `moderacion` y publicaría todo lo pendiente, descartado o retirado
 * en cuanto exportara. Si algo falla después de esta migración, se arregla hacia
 * adelante (bot/DEPLOY.md).
 */
function revisionAntesDePublicar(db: Db): void {
  db.exec(`
    ALTER TABLE quejas ADD COLUMN moderacion TEXT NOT NULL DEFAULT 'pendiente'
      CHECK (moderacion IN ('pendiente', 'retenida', 'publicada', 'descartada', 'retirada'));
    ALTER TABLE quejas ADD COLUMN publicada_at TEXT;
    UPDATE quejas SET moderacion = 'publicada', publicada_at = created_at;
    CREATE INDEX idx_quejas_moderacion ON quejas(moderacion);

    CREATE TABLE moderaciones (
      id         INTEGER PRIMARY KEY,
      queja_id   TEXT NOT NULL,
      decision   TEXT NOT NULL
        CHECK (decision IN ('heredada', 'pendiente', 'retenida', 'publicada', 'descartada', 'retirada')),
      por        TEXT NOT NULL,
      motivo     TEXT,
      creada_at  TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (queja_id) REFERENCES quejas(id) ON DELETE CASCADE
    );
    CREATE INDEX idx_moderaciones_queja ON moderaciones(queja_id);
    INSERT INTO moderaciones (queja_id, decision, por)
      SELECT id, 'heredada', 'migracion' FROM quejas ORDER BY rowid;

    CREATE TABLE avisos (
      queja_id      TEXT NOT NULL,
      tipo          TEXT NOT NULL,
      destinatario  TEXT NOT NULL,
      message_id    INTEGER,
      resultado     TEXT CHECK (resultado IN ('entregado', 'rechazado')),
      creado_at     TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (queja_id, tipo, destinatario),
      FOREIGN KEY (queja_id) REFERENCES quejas(id) ON DELETE CASCADE
    );
  `)
  const quejas = cuentaDe(db, 'SELECT COUNT(*) AS n FROM quejas')
  const publicadas = cuentaDe(db, "SELECT COUNT(*) AS n FROM quejas WHERE moderacion = 'publicada'")
  const heredadas = cuentaDe(
    db,
    "SELECT COUNT(*) AS n FROM moderaciones WHERE decision = 'heredada'",
  )
  if (publicadas !== quejas || heredadas !== quejas) {
    throw new Error(
      `[migrar] revision-antes-de-publicar: ${quejas} quejas, ${publicadas} publicadas y ${heredadas} heredadas`,
    )
  }
}

export const MIGRACIONES: readonly Migracion[] = [
  { version: 1, nombre: 'identidad-por-ciudadano', aplicar: identidadPorCiudadano },
  { version: 2, nombre: 'revision-antes-de-publicar', aplicar: revisionAntesDePublicar },
]

export interface ResultadoMigracion {
  desde: number
  hasta: number
  aplicadas: string[]
  /** La copia sacada antes de migrar, o null si no hacía falta. */
  copia: string | null
}

export interface OpcionesMigrar {
  /** La ruta de la base, o ':memory:'. */
  ruta: string
  /** Dónde van las copias; por defecto `<carpeta de la base>/backups`. */
  dirCopias?: string
  /** false sólo para el ensayo, que ya trabaja sobre una copia. */
  copia?: boolean
  /** Inyectadas en las pruebas; por defecto las de verdad. */
  migraciones?: readonly Migracion[]
  log?: (linea: string) => void
}

export function migrar(db: Db, o: OpcionesMigrar): ResultadoMigracion {
  const migraciones = o.migraciones ?? MIGRACIONES
  const log = o.log ?? ((l: string) => console.log(l))
  db.pragma('busy_timeout = 5000')

  const desde = db.pragma('user_version', { simple: true }) as number
  const ultima = migraciones.length ? migraciones[migraciones.length - 1].version : 0
  if (desde > ultima) {
    log(
      `[migrar] ⚠ la base está en la versión ${desde} y este código sólo conoce hasta la ${ultima}: ` +
        'es la base de un código más nuevo. No se toca.',
    )
    return { desde, hasta: desde, aplicadas: [], copia: null }
  }
  const pendientes = migraciones.filter((m) => m.version > desde)
  if (pendientes.length === 0) return { desde, hasta: desde, aplicadas: [], copia: null }

  const vacia = cuentaDe(db, "SELECT COUNT(*) AS n FROM sqlite_schema WHERE type = 'table'") === 0
  const copia =
    o.ruta === ':memory:' || vacia || o.copia === false ? null : copiaDeSeguridad(db, o, desde)
  if (copia) log(`[migrar] copia de seguridad en ${copia}`)

  if (desde === 0) db.exec(BASE_V0)

  const aplicadas: string[] = []
  db.pragma('foreign_keys = OFF')
  try {
    for (const m of pendientes) {
      db.transaction(() => {
        m.aplicar(db)
        const rotas = db.pragma('foreign_key_check') as unknown[]
        if (rotas.length > 0) {
          throw new Error(
            `[migrar] la migración ${m.version} (${m.nombre}) deja ${rotas.length} clave(s) ajena(s) rota(s)`,
          )
        }
        db.pragma(`user_version = ${m.version}`)
        db.exec(`CREATE TABLE IF NOT EXISTS migraciones_aplicadas (
          version     INTEGER PRIMARY KEY,
          nombre      TEXT NOT NULL,
          aplicada_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`)
        db.prepare('INSERT INTO migraciones_aplicadas (version, nombre) VALUES (?, ?)').run(
          m.version,
          m.nombre,
        )
      })()
      aplicadas.push(`${m.version}-${m.nombre}`)
      log(`[migrar] aplicada ${m.version} (${m.nombre})`)
    }
  } finally {
    db.pragma('foreign_keys = ON')
  }
  const salud = db.pragma('quick_check', { simple: true })
  if (salud !== 'ok') throw new Error(`[migrar] quick_check tras migrar: ${String(salud)}`)

  const hasta = db.pragma('user_version', { simple: true }) as number
  return { desde, hasta, aplicadas, copia }
}

const sello = () => new Date().toISOString().replace(/[:.]/g, '-')

/** VACUUM INTO no admite parámetros: la ruta va entre comillas simples, escapadas. */
const vacuumInto = (db: Db, destino: string) =>
  db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`)

function copiaDeSeguridad(db: Db, o: OpcionesMigrar, desde: number): string {
  const dir = o.dirCopias ?? join(dirname(resolve(o.ruta)), 'backups')
  mkdirSync(dir, { recursive: true })
  const final = join(dir, `bot-v${desde}-${sello()}.db`)
  const temporal = `${final}.tmp`
  vacuumInto(db, temporal)
  renameSync(temporal, final)
  return final
}

/** Cuántas filas tiene cada tabla. */
function cuentas(db: Db): Record<string, number> {
  const tablas = db
    .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as Array<{ name: string }>
  return Object.fromEntries(
    tablas.map((t) => [t.name, cuentaDe(db, `SELECT COUNT(*) AS n FROM "${t.name}"`)]),
  )
}

export interface Ensayo {
  ok: boolean
  /** Filas por tabla antes de migrar la copia. */
  antes: Record<string, number>
  /** Filas por tabla después, o null si la migración falló. */
  despues: Record<string, number> | null
  desde: number | null
  hasta: number | null
  aplicadas: string[]
  error?: string
}

/**
 * La migración, ensayada sobre una copia temporal junto a la base. La base no
 * se toca, y la copia —que lleva los mismos datos personales— se borra pase lo
 * que pase.
 */
export function ensayarMigracion(
  ruta: string,
  o: { log?: (linea: string) => void; migraciones?: readonly Migracion[] } = {},
): Ensayo {
  const temporal = join(dirname(resolve(ruta)), `.ensayo-migracion-${sello()}.db`)
  const borrar = () => {
    for (const f of [temporal, `${temporal}-wal`, `${temporal}-shm`]) rmSync(f, { force: true })
  }
  const e: Ensayo = { ok: false, antes: {}, despues: null, desde: null, hasta: null, aplicadas: [] }
  let copia: Db | null = null
  try {
    const origen = new Database(ruta, { readonly: true, fileMustExist: true })
    try {
      vacuumInto(origen, temporal)
    } finally {
      origen.close()
    }
    copia = new Database(temporal)
    copia.pragma('foreign_keys = ON')
    e.antes = cuentas(copia)
    const r = migrar(copia, {
      ruta: temporal,
      copia: false,
      log: o.log,
      migraciones: o.migraciones,
    })
    Object.assign(e, { desde: r.desde, hasta: r.hasta, aplicadas: r.aplicadas })
    e.despues = cuentas(copia)
    e.ok = true
  } catch (err) {
    e.error = (err as Error).message
  } finally {
    copia?.close()
    borrar()
  }
  return e
}
