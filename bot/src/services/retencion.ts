/**
 * El plazo de conservación, cumplido por código, una vez al día.
 *
 * El aviso legal, `/start` y la respuesta a `/olvidar` prometían que el registro
 * de una queja se destruye a los cinco años de su resolución o de su última
 * actualización, y ningún código lo hacía. Tampoco caducaban las copias de
 * seguridad que saca `migrar` antes de migrar la base, que llevan los mismos
 * datos personales, ni la copia de un ensayo de migración interrumpido.
 *
 * Las cifras vienen de src/scraper/plazos-retencion.ts, las mismas que imprimen
 * las páginas. No se pausa con el bloqueo LOREG: no afirma nada de nadie, borra.
 */
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { Db } from '../db/client.ts'
import { aVaciar } from '../db/queries.ts'
import { logger } from '../util/log.ts'
import { vaciarTarjetasEnCola, type EnvioAdmin } from './avisos-admin.ts'
import {
  CONSERVACION_COPIAS_DIAS,
  CONSERVACION_QUEJAS_ANIOS,
} from '../../../src/scraper/plazos-retencion.ts'

const DIA_MS = 24 * 3600 * 1000

/** Un ensayo de migración dura segundos: una copia suya de más de un día es de uno interrumpido. */
const ENSAYO_HUERFANO_MS = DIA_MS
/** Un ciudadano de menos de un día puede estar a medio escribir su primera queja. */
const CIUDADANO_HUERFANO_MS = DIA_MS

export interface OpcionesPurga {
  ahora?: Date
  /** Donde el bot guarda las fotos anonimizadas. */
  photosDir: string
  /** Donde `migrar` deja sus copias; null si la base es de memoria. */
  dirCopias?: string | null
  /** La carpeta de la base, donde un ensayo de migración deja su copia temporal. */
  dirBase?: string | null
}

export interface ResultadoPurga {
  /** Cuántas quejas se miraron y cuántas se destruyeron. */
  quejas: { revisadas: number; borradas: number }
  fotos: number
  ciudadanos: number
  copias: { revisadas: number; borradas: number }
  ensayos: number
  /**
   * Las copias de las tarjetas de revisión de las quejas destruidas, que quedan en
   * `tarjetas_por_vaciar` hasta perder el texto en los chats de quien modera. Se
   * encolan en la misma transacción que las destruye: antes se recogían en
   * memoria y un fallo de Telegram al vaciarlas las perdía (revisión de la
   * pasada de #137).
   */
  tarjetas: number
}

const sqlite = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 19)

function viejosEn(dir: string, casa: (f: string) => boolean, limite: number): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((f) => casa(f) && statSync(join(dir, f)).mtimeMs < limite)
}

export function purgarCaducadas(db: Db, o: OpcionesPurga): ResultadoPurga {
  const ahora = o.ahora ?? new Date()
  const limiteQuejas = new Date(ahora)
  limiteQuejas.setUTCFullYear(limiteQuejas.getUTCFullYear() - CONSERVACION_QUEJAS_ANIOS)
  const r: ResultadoPurga = {
    quejas: { revisadas: 0, borradas: 0 },
    fotos: 0,
    ciudadanos: 0,
    copias: { revisadas: 0, borradas: 0 },
    ensayos: 0,
    tarjetas: 0,
  }

  const borradas: string[] = []
  db.transaction(() => {
    r.quejas.revisadas = (db.prepare('SELECT COUNT(*) AS n FROM quejas').get() as { n: number }).n
    // El plazo corre desde lo último que le pasó: una queja resuelta hace años
    // que se escaló ayer sigue viva.
    const caducadas = db
      .prepare('SELECT id FROM quejas WHERE MAX(updated_at, COALESCE(resolved_at, updated_at)) < ?')
      .all(sqlite(limiteQuejas)) as Array<{ id: string }>
    r.tarjetas = aVaciar(
      db,
      caducadas.map((c) => c.id),
      'destruida',
    )
    const borra = db.prepare('DELETE FROM quejas WHERE id = ?') // eventos, apoyos, fotos retenidas y avisos, en cascada
    for (const { id } of caducadas) {
      if (borra.run(id).changes > 0) borradas.push(id)
    }
    r.quejas.borradas = borradas.length
    // Hoy un ciudadano sólo existe por lo que escribió o apoyó: sin nada de eso, sobra.
    r.ciudadanos = db
      .prepare(
        `DELETE FROM ciudadanos
          WHERE creado_at < ?
            AND id NOT IN (SELECT ciudadano_id FROM quejas WHERE ciudadano_id IS NOT NULL)
            AND id NOT IN (SELECT ciudadano_id FROM apoyos)`,
      )
      .run(sqlite(new Date(ahora.getTime() - CIUDADANO_HUERFANO_MS))).changes
  })()

  for (const id of borradas) {
    const foto = join(o.photosDir, `${id.toLowerCase()}.jpg`)
    if (existsSync(foto)) {
      rmSync(foto, { force: true })
      r.fotos += 1
    }
  }

  if (o.dirCopias && existsSync(o.dirCopias)) {
    const todas = readdirSync(o.dirCopias).filter((f) => /\.db(\.tmp)?$/.test(f))
    r.copias.revisadas = todas.length
    const viejas = viejosEn(
      o.dirCopias,
      (f) => todas.includes(f),
      ahora.getTime() - CONSERVACION_COPIAS_DIAS * DIA_MS,
    )
    for (const f of viejas) rmSync(join(o.dirCopias, f), { force: true })
    r.copias.borradas = viejas.length
  }

  if (o.dirBase) {
    const huerfanos = viejosEn(
      o.dirBase,
      (f) => f.startsWith('.ensayo-migracion-'),
      ahora.getTime() - ENSAYO_HUERFANO_MS,
    )
    for (const f of huerfanos) rmSync(join(o.dirBase, f), { force: true })
    r.ensayos = huerfanos.filter((f) => f.endsWith('.db')).length
  }
  return r
}

/** Una vez al arrancar y luego cada día, contra la base de `DB_PATH`. */
export function startRetencionCron(o: {
  db: Db
  photosDir: string
  dbPath: string
  /** Para quitar el texto de las tarjetas de las quejas destruidas. */
  envio?: EnvioAdmin
}): () => void {
  const enMemoria = o.dbPath === ':memory:'
  const base = enMemoria ? null : dirname(resolve(o.dbPath))
  const tick = () => {
    try {
      const r = purgarCaducadas(o.db, {
        photosDir: o.photosDir,
        dirCopias: base ? join(base, 'backups') : null,
        dirBase: base,
      })
      logger.info('retencion', {
        quejas: `${r.quejas.borradas} de ${r.quejas.revisadas}`,
        fotos: r.fotos,
        ciudadanos: r.ciudadanos,
        copias: `${r.copias.borradas} de ${r.copias.revisadas}`,
        ensayos: r.ensayos,
        tarjetas: r.tarjetas,
      })
      if (o.envio && r.tarjetas > 0) {
        void vaciarTarjetasEnCola(o.db, o.envio).catch((err: unknown) =>
          logger.error('retencion.tarjetas', { err: String(err) }),
        )
      }
    } catch (err) {
      logger.error('retencion', { err: String(err) })
    }
  }
  tick()
  const handle = setInterval(tick, DIA_MS)
  return () => clearInterval(handle)
}
