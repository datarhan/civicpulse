/**
 * Lo que un ciudadano puede hacer con lo suyo, sin depender del canal por el que
 * llegó: retirar una queja y borrar todo lo que el bot guarda de él.
 *
 * `/olvidar` retiraba una queja; el aviso legal promete además el derecho de
 * supresión entero (RGPD art. 17), y no había forma de ejercerlo: los apoyos y
 * las suscripciones de alguien se quedaban con su id de Telegram para siempre.
 */
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import type { Db } from '../db/client.ts'
import { idCiudadano, softDeleteQueja, type Autor } from '../db/queries.ts'
import { logger } from '../util/log.ts'

/** Borra la copia anonimizada de la foto de una queja retirada, si el bot la guarda. */
function borrarFoto(photosDir: string, id: string): void {
  try {
    rmSync(join(photosDir, `${id.toLowerCase()}.jpg`), { force: true })
  } catch (err) {
    // La queja queda retirada igual, y la pasada horaria de fotos la poda.
    logger.warn('ciudadano.foto', { id, err: String(err) })
  }
}

/**
 * Retira la queja y, si la retiró, borra en el acto su foto anonimizada del disco del
 * bot. Nada la enlaza ni la sirve ya —el export y `/export/quejas-photos/` sólo miran
 * quejas vivas—, pero no hay por qué guardarla hasta la poda de la siguiente pasada.
 */
export function retirar(db: Db, id: string, autor: Autor, photosDir: string): boolean {
  const ok = softDeleteQueja(db, id, autor)
  if (ok) borrarFoto(photosDir, id)
  return ok
}

export interface ResultadoOlvido {
  /** Sus quejas vivas: cuántas se intentó retirar y cuántas se retiraron. */
  quejas: { intentadas: number; retiradas: number }
  apoyos: number
  suscripciones: number
  /** Si había una fila suya en `ciudadanos` y se borró. */
  ciudadano: boolean
}

/**
 * Todo lo que el bot guarda de una persona, de una vez y en una transacción.
 * Cada queja pasa por la misma retirada que `/olvidar` —el texto se queda, sin
 * autor, el plazo legal—; sus apoyos, sus suscripciones y su fila se borran. De
 * quien no tiene nada no se borra nada ni se crea nada.
 */
export function olvidarTodo(db: Db, autor: Autor, photosDir: string): ResultadoOlvido {
  const r: ResultadoOlvido = {
    quejas: { intentadas: 0, retiradas: 0 },
    apoyos: 0,
    suscripciones: 0,
    ciudadano: false,
  }
  const retiradas: string[] = []
  db.transaction(() => {
    const cid = idCiudadano(db, autor)
    if (cid !== null) {
      const suyas = db
        .prepare('SELECT id FROM quejas WHERE ciudadano_id = ? AND deleted_at IS NULL')
        .all(cid) as Array<{ id: string }>
      r.quejas.intentadas = suyas.length
      for (const { id } of suyas) {
        if (softDeleteQueja(db, id, autor)) retiradas.push(id)
      }
      r.quejas.retiradas = retiradas.length
      r.apoyos = db.prepare('DELETE FROM apoyos WHERE ciudadano_id = ?').run(cid).changes
      r.ciudadano = db.prepare('DELETE FROM ciudadanos WHERE id = ?').run(cid).changes > 0
    }
    // Las suscripciones se guardan aún con el id de Telegram (hasta que se retiren
    // con el resumen semanal): por eso no cuelgan de `ciudadanos`.
    if (autor.canal === 'telegram') {
      r.suscripciones = db
        .prepare('DELETE FROM subscriptions WHERE telegram_user_id = ?')
        .run(Number(autor.ref)).changes
    }
  })()
  for (const id of retiradas) borrarFoto(photosDir, id)
  return r
}
