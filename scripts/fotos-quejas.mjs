#!/usr/bin/env node
/**
 * Las fotos de las quejas, al día con la instantánea que manda el bot de producción.
 *
 *   node scripts/fotos-quejas.mjs        (con EXPORT_URL y EXPORT_TOKEN en el entorno)
 *
 * La lanza `pull-quejas.yml` justo después de traer `public/data/quejas.json`, y hace
 * dos cosas en `public/data/quejas-photos/`:
 *
 *   1. PODA la foto de toda queja que ya no está en la instantánea —una retirada con
 *      /olvidar, sobre todo—, y el commit del workflow lleva la queja y su foto juntas.
 *   2. TRAE del bot las fotos que la instantánea enlaza y aún no están. El bot las
 *      anonimiza cada hora en su volumen (`bot/src/services/fotos-cron.ts`) y las
 *      sirve en `/export/quejas-photos/<id>.jpg` con el mismo token que `quejas.json`.
 *      Una foto que no se puede traer deja de enlazarse, para que la web no pinte una
 *      imagen rota; la siguiente actualización lo vuelve a intentar.
 *
 * La poda vive aquí, y no en `npm run process-photos`, porque aquella comparaba con la
 * base de datos que tuviera a mano, y en el portátil esa base era una copia de agosto.
 *
 * Poda por ID DE QUEJA, no por el campo `photo`: una foto puede estar publicada y
 * faltar todavía en el volumen del bot (las anteriores a que la pasada corriera allí),
 * y entonces la instantánea sale sin `photo` para una queja que sigue viva.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const INSTANTANEA = 'public/data/quejas.json'
const FOTOS = 'public/data/quejas-photos'
/** La única forma de enlace que se sigue: el id acaba siendo un nombre de fichero. */
const ENLACE = /^\/data\/quejas-photos\/(q-[a-z0-9]{6,10})\.jpg$/

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

/**
 * Qué fotos enlaza la instantánea y no están en la carpeta, sin tocar el disco ni la red.
 *
 * @param {{ items?: Array<{ service_request_id: string, photo?: string }> }} instantanea
 * @param {string[]} ficheros  nombres de fichero de la carpeta de fotos
 * @returns {string[]} ids de queja en minúsculas
 */
export function fotosATraer(instantanea, ficheros) {
  const items = instantanea?.items
  if (!Array.isArray(items)) throw new Error('quejas.json sin «items»: no se trae nada')
  const presentes = new Set(ficheros.map((f) => f.toLowerCase()))
  const traer = []
  for (const q of items) {
    const m = ENLACE.exec(String(q?.photo ?? ''))
    // Sólo la foto de la propia queja: un enlace a la de otra no se sigue.
    if (!m || m[1] !== String(q.service_request_id).toLowerCase()) continue
    if (!presentes.has(`${m[1]}.jpg`)) traer.push(m[1])
  }
  return traer
}

/**
 * La URL de una foto en el bot, a partir de la del export de `quejas.json`.
 *
 * @param {string} exportUrl
 * @param {string} id
 */
export function urlDeFoto(exportUrl, id) {
  const base = new URL(exportUrl)
  if (!base.pathname.endsWith('/quejas.json')) {
    throw new Error(`EXPORT_URL no termina en /quejas.json: ${base.origin}${base.pathname}`)
  }
  return new URL(`quejas-photos/${id}.jpg`, base).toString()
}

/** Todo JPEG empieza por estos tres bytes. Un 200 puede traer una página de error. */
const esJpeg = (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff

/**
 * Trae del bot cada foto de la lista y escribe sólo las que son de verdad un JPEG.
 *
 * @param {string[]} ids
 * @param {{ exportUrl: string, token: string, fetchImpl?: typeof fetch, escribe: (id: string, bytes: Uint8Array) => void }} o
 * @returns {Promise<{ traidas: string[], fallidas: Array<{ id: string, motivo: string }> }>}
 */
export async function traeFotos(ids, o) {
  const fetchImpl = o.fetchImpl ?? fetch
  const traidas = []
  const fallidas = []
  for (const id of ids) {
    try {
      const r = await fetchImpl(urlDeFoto(o.exportUrl, id), {
        headers: {
          ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}),
          'User-Agent': 'CivicPulse pull-quejas (https://civicpulse.es)',
        },
        signal: AbortSignal.timeout(30_000),
      })
      if (!r.ok) {
        fallidas.push({ id, motivo: `HTTP ${r.status}` })
        continue
      }
      const tipo = r.headers.get('content-type') ?? ''
      if (!tipo.startsWith('image/jpeg')) {
        fallidas.push({ id, motivo: `no es una imagen (${tipo || 'sin tipo'})` })
        continue
      }
      const bytes = new Uint8Array(await r.arrayBuffer())
      if (!esJpeg(bytes)) {
        fallidas.push({ id, motivo: 'el contenido no es un JPEG' })
        continue
      }
      o.escribe(id, bytes)
      traidas.push(id)
    } catch (e) {
      fallidas.push({ id, motivo: e instanceof Error ? e.message : String(e) })
    }
  }
  return { traidas, fallidas }
}

/**
 * La instantánea sin el enlace de las fotos que no se pudieron traer. No modifica la
 * que recibe.
 *
 * @param {{ items: Array<Record<string, unknown>> }} instantanea
 * @param {string[]} ids  ids de queja en minúsculas
 */
export function sinFotosFallidas(instantanea, ids) {
  const fuera = new Set(ids)
  return {
    ...instantanea,
    items: instantanea.items.map((q) => {
      const m = ENLACE.exec(String(q?.photo ?? ''))
      if (!m || !fuera.has(m[1])) return q
      const sinFoto = { ...q }
      delete sinFoto.photo
      return sinFoto
    }),
  }
}

/** Mismo formato que el paso que trae la instantánea: dos espacios y salto final. */
const escribeInstantanea = (d) => writeFileSync(INSTANTANEA, JSON.stringify(d, null, 2) + '\n')

async function main() {
  const instantanea = JSON.parse(readFileSync(INSTANTANEA, 'utf8'))

  const ficheros = existsSync(FOTOS) ? readdirSync(FOTOS) : []
  const { podar, motivo } = fotosAPodar(instantanea, ficheros)
  if (motivo) {
    console.log(
      `[fotos-quejas] no se poda: ${motivo} · ${ficheros.length} fichero(s) en la carpeta`,
    )
  } else {
    for (const f of podar) {
      rmSync(join(FOTOS, f))
      console.log(`[fotos-quejas] podada ${f}: su queja ya no se publica`)
    }
    console.log(`[fotos-quejas] ${podar.length} podada(s) de ${ficheros.length} fichero(s)`)
  }

  const faltan = fotosATraer(instantanea, existsSync(FOTOS) ? readdirSync(FOTOS) : [])
  if (faltan.length === 0) {
    console.log('[fotos-quejas] ninguna foto enlazada que traer')
    return
  }
  const exportUrl = process.env.EXPORT_URL?.trim()
  if (!exportUrl) {
    console.log(
      `::warning::[fotos-quejas] sin EXPORT_URL no se trae nada: ${faltan.length} foto(s) dejan de enlazarse`,
    )
    escribeInstantanea(sinFotosFallidas(instantanea, faltan))
    return
  }
  const { traidas, fallidas } = await traeFotos(faltan, {
    exportUrl,
    token: process.env.EXPORT_TOKEN ?? '',
    escribe: (id, bytes) => {
      // La carpeta se crea con el primer fichero: vacía, `git add` sobre ella falla.
      mkdirSync(FOTOS, { recursive: true })
      writeFileSync(join(FOTOS, `${id}.jpg`), bytes)
    },
  })
  for (const id of traidas) console.log(`[fotos-quejas] traída ${id}.jpg`)
  for (const f of fallidas) {
    console.log(`::warning::[fotos-quejas] ${f.id}.jpg sin traer (${f.motivo}): deja de enlazarse`)
  }
  if (fallidas.length > 0) {
    escribeInstantanea(
      sinFotosFallidas(
        instantanea,
        fallidas.map((f) => f.id),
      ),
    )
  }
  console.log(`[fotos-quejas] ${traidas.length} traída(s), ${fallidas.length} sin traer`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`[fotos-quejas] ${e instanceof Error ? e.message : String(e)}`)
    process.exit(1)
  })
}
