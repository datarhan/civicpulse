/**
 * Una queja ya publicada, para las pruebas de los lectores públicos que no
 * tratan de la revisión.
 *
 * Desde la migración 2 una queja nace `pendiente` y no la ve el público hasta
 * que un administrador la publica. Las pruebas escritas antes daban por pública
 * toda queja recién creada; con esto la crean como las que ya estaban
 * publicadas al migrar —sin evento ni decisión—, que es lo que probaban. La
 * revisión se prueba en moderar.test.ts y moderacion-publica.test.ts.
 */
import type { Db } from '../../src/db/client'
import { createQueja, getQueja, type NewQuejaInput, type QuejaRow } from '../../src/db/queries'

export function publicar(db: Db, id: string): string {
  db.prepare(
    "UPDATE quejas SET moderacion = 'publicada', publicada_at = created_at WHERE id = ?",
  ).run(id)
  return id
}

export function creaPublicada(db: Db, input: NewQuejaInput): QuejaRow {
  const q = createQueja(db, input)
  publicar(db, q.id)
  return getQueja(db, q.id)!
}
