/**
 * La lista de bloqueo, leída y escrita en un solo sitio.
 *
 * El registro es la tabla `bloqueos` de la migración 4 (db/migraciones.ts):
 * append-only, una fila por decisión, y lo vigente es la última de cada
 * ciudadano. Bloquear sólo impide enviar quejas, apoyarlas y adjuntar fotos
 * (commands/bloquear.ts); no toca nada de lo ya escrito ni ningún derecho sobre
 * los datos propios.
 *
 * Mientras la migración 4 esté en ensayo, la tabla no existe en producción:
 * `bloqueosActivos` lo dice, nadie está bloqueado y quien modera oye que aún no
 * está activo. Fallar abierto aquí es lo que había antes de este cambio; fallar
 * con una excepción tumbaría `/queja` para todo el mundo.
 */
import type { Db } from './client.ts'
import type { AccionBloqueo } from './migraciones.ts'
import { idCiudadano, type Autor } from './queries.ts'

/** ¿Existe ya la tabla? Sólo falta mientras la migración 4 está en ensayo. */
export function bloqueosActivos(db: Db): boolean {
  return (
    db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'bloqueos'").get() !==
    undefined
  )
}

/**
 * Los ciudadanos bloqueados ahora mismo, como subconsulta: los que tienen por
 * última fila un `bloquear`. La purga de ciudadanos sin nada (services/retencion.ts)
 * no se los lleva: borrar la fila levantaría el bloqueo sin que nadie lo decidiera.
 */
export const SQL_CIUDADANOS_BLOQUEADOS = `
  SELECT b.ciudadano_id FROM bloqueos b
   WHERE b.ciudadano_id IS NOT NULL
     AND b.accion = 'bloquear'
     AND b.id = (SELECT MAX(id) FROM bloqueos WHERE ciudadano_id = b.ciudadano_id)`

/** ¿Está bloqueado este ciudadano? */
export function ciudadanoBloqueado(db: Db, ciudadanoId: number): boolean {
  if (!bloqueosActivos(db)) return false
  const fila = db
    .prepare('SELECT accion FROM bloqueos WHERE ciudadano_id = ? ORDER BY id DESC LIMIT 1')
    .get(ciudadanoId) as { accion: AccionBloqueo } | undefined
  return fila?.accion === 'bloquear'
}

/** ¿Está bloqueada esta cuenta? Mirar no crea a nadie. */
export function estaBloqueado(db: Db, autor: Autor): boolean {
  if (!bloqueosActivos(db)) return false
  const cid = idCiudadano(db, autor)
  return cid !== null && ciudadanoBloqueado(db, cid)
}

export type ResultadoBloqueo = 'hecho' | 'ya-estaba' | 'no-activo'

/**
 * Apunta una decisión, si cambia algo: bloquear a quien ya lo está, o desbloquear
 * a quien no lo está, no deja fila —el registro cuenta decisiones, no pulsaciones—.
 * `por` es quién decide (`admin:<id>`); `motivo`, lo que dijo, o null.
 */
export function decidirBloqueo(
  db: Db,
  ciudadanoId: number,
  accion: AccionBloqueo,
  por: string,
  motivo: string | null,
): ResultadoBloqueo {
  if (!bloqueosActivos(db)) return 'no-activo'
  return db.transaction((): ResultadoBloqueo => {
    const bloqueado = ciudadanoBloqueado(db, ciudadanoId)
    if (bloqueado === (accion === 'bloquear')) return 'ya-estaba'
    db.prepare('INSERT INTO bloqueos (ciudadano_id, accion, por, motivo) VALUES (?, ?, ?, ?)').run(
      ciudadanoId,
      accion,
      por,
      motivo && motivo.trim() ? motivo.trim() : null,
    )
    return 'hecho'
  })()
}
