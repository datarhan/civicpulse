#!/usr/bin/env node
/**
 * Poda de las fotos de quejas que ya no se publican.
 *
 *   node scripts/fotos-quejas.mjs
 *
 * La lanza `pull-quejas.yml` justo después de traer `public/data/quejas.json` del
 * bot de producción. Borra de `public/data/quejas-photos/` la foto de toda queja
 * que ya no está en esa instantánea —una retirada con /olvidar, sobre todo—, y el
 * commit del workflow lleva la queja y su foto juntas.
 *
 * Vive aquí, y no en `npm run process-photos`, porque aquella poda comparaba con
 * la base de datos que tuviera a mano, y en el portátil esa base era una copia de
 * agosto: una queja retirada en el bot de Fly no desaparecía nunca de ella.
 *
 * Compara por ID DE QUEJA, no por el campo `photo` de cada fila. El bot sólo pone
 * ese campo si ve el fichero dentro de su propia imagen, que se construye en cada
 * despliegue del bot, así que una foto publicada después de ese despliegue saldría
 * sin `photo` y se podaría la foto de una queja viva.
 */
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const INSTANTANEA = 'public/data/quejas.json'
const FOTOS = 'public/data/quejas-photos'

/**
 * Qué fotos sobran, sin tocar el disco.
 *
 * @param {{ items?: Array<{ service_request_id: string }>, stats?: { total?: number } }} instantanea
 * @param {string[]} ficheros  nombres de fichero de la carpeta de fotos
 * @returns {{ podar: string[], motivo: string | null }}
 */
export function fotosAPodar(instantanea, ficheros) {
  const items = instantanea?.items
  if (!Array.isArray(items)) {
    // Un export roto no es «ya no hay quejas»: podar aquí borraría todas las fotos.
    throw new Error('quejas.json sin «items»: no se poda nada')
  }
  if (instantanea?.stats?.total !== items.length) {
    // El export lista hasta un límite. Con el listado cortado —o sin total con el
    // que comprobarlo— no se sabe si una queja que no aparece se retiró o no cupo.
    return { podar: [], motivo: 'listado parcial' }
  }
  const vivas = new Set(items.map((q) => String(q.service_request_id).toLowerCase()))
  const podar = ficheros
    .filter((f) => f.toLowerCase().endsWith('.jpg'))
    .filter((f) => !vivas.has(f.slice(0, -'.jpg'.length).toLowerCase()))
  return { podar, motivo: null }
}

function main() {
  const instantanea = JSON.parse(readFileSync(INSTANTANEA, 'utf8'))
  const ficheros = existsSync(FOTOS) ? readdirSync(FOTOS) : []
  const { podar, motivo } = fotosAPodar(instantanea, ficheros)
  if (motivo) {
    console.log(
      `[fotos-quejas] no se poda: ${motivo} · ${ficheros.length} fichero(s) en la carpeta`,
    )
    return
  }
  for (const f of podar) {
    rmSync(join(FOTOS, f))
    console.log(`[fotos-quejas] podada ${f}: su queja ya no se publica`)
  }
  console.log(`[fotos-quejas] ${podar.length} podada(s) de ${ficheros.length} fichero(s)`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
