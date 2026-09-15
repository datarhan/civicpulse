/**
 * GET /export/quejas-photos/<id>.jpg — la foto anonimizada de una queja, para que la
 * actualización de la web la traiga del volumen del bot (`scripts/fotos-quejas.mjs`).
 *
 * Es el único camino de salida de esas fotos, así que se define por lo que niega:
 *
 *   · sin `EXPORT_TOKEN` configurado no sirve nada, en vez de servir abierto;
 *   · el token sólo vale en la cabecera `Authorization`: en la URL acabaría en los
 *     logs de quien la pide y de cualquier intermediario;
 *   · una queja retirada con /olvidar da 404 aunque su fichero siguiera en el disco
 *     (`getQuejaViva`);
 *   · el nombre tiene que ser el de una queja, así que nada fuera de la carpeta.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Db } from '../db/client.ts'
import { getQuejaViva } from '../db/queries.ts'

const PREFIJO = '/export/quejas-photos/'
const RUTA = /^\/export\/quejas-photos\/(q-[a-z0-9]{6,10})\.jpg$/

export interface DepsFotoExportada {
  db: Db
  photosDir: string
  exportToken: string
}

/** Devuelve true cuando la petición era suya y ya está contestada. */
export function sirveFotoExportada(
  req: IncomingMessage,
  res: ServerResponse,
  deps: DepsFotoExportada,
): boolean {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  if (!url.pathname.startsWith(PREFIJO)) return false

  const contesta = (status: number, texto: string) => {
    res.statusCode = status
    res.end(texto)
    return true
  }
  const cabecera = req.headers.authorization ?? ''
  if (!deps.exportToken || cabecera !== `Bearer ${deps.exportToken}`) {
    return contesta(401, 'unauthorized')
  }
  if (req.method !== 'GET') return contesta(405, 'method not allowed')

  const m = RUTA.exec(url.pathname)
  if (!m) return contesta(404, 'not found')
  const id = m[1]
  if (!getQuejaViva(deps.db, id.toUpperCase())) return contesta(404, 'not found')
  const fichero = join(deps.photosDir, `${id}.jpg`)
  if (!existsSync(fichero)) return contesta(404, 'not found')

  res.statusCode = 200
  res.setHeader('Content-Type', 'image/jpeg')
  res.setHeader('Cache-Control', 'no-store')
  res.end(readFileSync(fichero))
  return true
}
