/**
 * Anonymize-and-publish job for queja photos.
 *
 *   listQuejasWithPhoto(db)            (non-deleted rows carrying a file_id)
 *     → skip those already published    (anonymized jpg already on disk)
 *     → download raw bytes from Telegram (in memory — raw NEVER hits disk)
 *     → normalizarImagen()               (rotate by EXIF + downscale → ONE JPEG;
 *                                         unreadable → REJECTED, never sent on)
 *     → detectSensitiveRegions()         (on that JPEG; throws → HOLD)
 *     → anonymizeImage()                 (on that same JPEG: degrade + mosaic)
 *     → write <directorioFotos()>/<id>.jpg
 *
 * Every hold is written down (`fotos_retenidas`) with its FIRST time, and what
 * has been held for a day comes back in `paraAvisar` so the cron tells the
 * admins once. Until 2026-09-27 a held photo was retried every hour, forever,
 * and nobody knew.
 *
 * The public snapshot (snapshot.ts) then attaches the photo URL for any queja
 * whose anonymized file exists.
 *
 * En producción corre dentro del bot, cada hora y sobre el volumen
 * (`fotos-cron.ts`), y `pull-quejas.yml` trae de allí las fotos que el export enlaza.
 * A mano: npm run process-photos     (from the bot package)
 */

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import dotenv from 'dotenv'
import { openDb, type Db } from '../db/client.ts'
import {
  fotosRetenidasSinAvisar,
  listQuejasWithPhoto,
  olvidarFotoRetenida,
  podarFotosRetenidas,
  registrarFotoRetenida,
  type FotoRetenida,
  type QuejaRow,
} from '../db/queries.ts'
import {
  anonymizeImage,
  detectSensitiveRegions,
  normalizarImagen,
  type ImagenNormalizada,
} from './photo-anonymize.ts'
import { directorioFotos } from './snapshot.ts'

/** Lo que lleva retenido al menos esto se avisa, una vez, a los administradores. */
export const AVISAR_RETENIDA_TRAS_MS = 24 * 60 * 60 * 1000

/** Rows still needing an anonymized image (has a file_id, not yet published). */
export function selectQuejasToProcess<T extends { id: string; photo_file_id: string | null }>(
  rows: T[],
  alreadyPublished: (id: string) => boolean,
): T[] {
  return rows.filter((r) => !!r.photo_file_id && !alreadyPublished(r.id))
}

/** Download a Telegram file to a Buffer via the bot HTTP API (raw stays in memory). */
export async function fetchPhotoBytes(
  token: string,
  fileId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Buffer> {
  const metaRes = await fetchImpl(
    `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
  )
  if (!metaRes.ok) throw new Error(`telegram getFile HTTP ${metaRes.status}`)
  const meta = (await metaRes.json()) as { result?: { file_path?: string } }
  const filePath = meta?.result?.file_path
  if (!filePath) throw new Error('telegram getFile: no file_path')
  const fileRes = await fetchImpl(`https://api.telegram.org/file/bot${token}/${filePath}`)
  if (!fileRes.ok) throw new Error(`telegram file download HTTP ${fileRes.status}`)
  return Buffer.from(await fileRes.arrayBuffer())
}

export interface ProcessDeps {
  db: Db
  token: string
  photosDir: string
  env?: Record<string, string | undefined>
  /** Injected for tests; defaults to the real Telegram download. */
  fetchBytes?: (token: string, fileId: string) => Promise<Buffer>
  /** Injected for tests; defaults to the real normalization. */
  normalizar?: (buf: Buffer) => Promise<ImagenNormalizada>
  detect?: typeof detectSensitiveRegions
  anonymize?: typeof anonymizeImage
  /** Injected for tests; defaults to the clock. */
  ahora?: () => Date
  log?: (msg: string) => void
}

export interface ProcessResult {
  published: string[]
  /** The model could not run or could not be read: retried next pass. */
  held: string[]
  /** The bytes are not an image we can read: never sent to the model. */
  rechazadas: string[]
  skipped: number
  pruned: string[]
  /** Held for a day or more and not yet reported to the admins. */
  paraAvisar: FotoRetenida[]
}

/**
 * Delete published photo files that no longer back a publishable queja — the
 * enforcement point for the right-to-be-forgotten on citizen photos. A queja
 * soft-deleted via `/olvidar` drops out of the allowlist, so its anonymized
 * image is removed from the public tree on the next run.
 */
export function pruneOrphanPhotos(photosDir: string, allowedIdsLower: Set<string>): string[] {
  if (!existsSync(photosDir)) return []
  const pruned: string[] = []
  for (const f of readdirSync(photosDir)) {
    if (!f.toLowerCase().endsWith('.jpg')) continue
    const id = f.slice(0, -'.jpg'.length).toLowerCase()
    if (!allowedIdsLower.has(id)) {
      rmSync(join(photosDir, f), { force: true })
      pruned.push(f)
    }
  }
  return pruned
}

export async function processPhotos(deps: ProcessDeps): Promise<ProcessResult> {
  const {
    db,
    token,
    photosDir,
    env = process.env,
    fetchBytes = (t, f) => fetchPhotoBytes(t, f),
    normalizar = (b) => normalizarImagen(b),
    detect = detectSensitiveRegions,
    anonymize = anonymizeImage,
    ahora = () => new Date(),
    log = console.log,
  } = deps

  // El token del bot va en las URL de Telegram, y un fallo de red la trae entera
  // en su mensaje. El motivo se guarda en la base y viaja en el aviso: sin token.
  const sinToken = (texto: string) => (token ? texto.split(token).join('[token]') : texto)
  const motivoDe = (err: unknown) => sinToken(err instanceof Error ? err.message : String(err))

  const destFor = (id: string) => join(photosDir, `${id.toLowerCase()}.jpg`)
  const rows = listQuejasWithPhoto(db)
  const todo = selectQuejasToProcess(rows as QuejaRow[], (id) => existsSync(destFor(id)))

  const published: string[] = []
  const held: string[] = []
  const rechazadas: string[] = []

  for (const row of todo) {
    try {
      const raw = await fetchBytes(token, row.photo_file_id as string)
      let img: ImagenNormalizada
      try {
        img = await normalizar(raw)
      } catch (err) {
        // No es una imagen que se pueda leer: no sale hacia el modelo.
        rechazadas.push(row.id)
        registrarFotoRetenida(db, row.id, `rechazada: ${motivoDe(err)}`, ahora())
        log(`[photos] REJECTED ${row.id} — ${motivoDe(err)}`)
        continue
      }
      // El modelo y el mosaico trabajan sobre la MISMA imagen normalizada.
      const boxes = await detect(img.data, { env }) // throws → caught → HELD
      const out = await anonymize(img.data, boxes)
      mkdirSync(photosDir, { recursive: true })
      writeFileSync(destFor(row.id), out)
      published.push(row.id)
      olvidarFotoRetenida(db, row.id)
      log(`[photos] published ${row.id} · ${boxes.length} region(s) mosaiced`)
    } catch (err) {
      held.push(row.id)
      registrarFotoRetenida(db, row.id, motivoDe(err), ahora())
      log(`[photos] HELD ${row.id} — ${motivoDe(err)}`)
    }
  }

  // Remove photos of quejas that are no longer publishable (e.g. forgotten).
  const allowed = new Set(rows.map((r) => r.id.toLowerCase()))
  const pruned = pruneOrphanPhotos(photosDir, allowed)
  for (const f of pruned) log(`[photos] pruned ${f} (queja no longer publishable)`)

  // Sólo siguen retenidas las que siguen pendientes; lo demás no debe avisar.
  const pendientes = todo.map((r) => r.id).filter((id) => !published.includes(id))
  podarFotosRetenidas(db, pendientes)
  const paraAvisar = fotosRetenidasSinAvisar(
    db,
    new Date(ahora().getTime() - AVISAR_RETENIDA_TRAS_MS),
  )

  return {
    published,
    held,
    rechazadas,
    skipped: rows.length - todo.length,
    pruned,
    paraAvisar,
  }
}

async function main() {
  // bot/.env first, then the repo-root .env for the shared vision key.
  dotenv.config()
  dotenv.config({ path: '../.env' })

  const token = process.env.BOT_TOKEN
  if (!token) throw new Error('BOT_TOKEN missing — set it in bot/.env or the environment')

  // La misma carpeta que enlaza el export: el volumen en Fly, junto a quejas.json en local.
  const photosDir = directorioFotos()

  const db = openDb()
  const res = await processPhotos({ db, token, photosDir })
  console.log(
    `[photos] done · published=${res.published.length} held=${res.held.length} rejected=${res.rechazadas.length} skipped=${res.skipped} pruned=${res.pruned.length} · dir=${photosDir}`,
  )
  if (res.held.length > 0) {
    console.log('[photos] held photos will be retried on the next run (vision unavailable/failed).')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error('[photos] fatal:', e)
    process.exit(1)
  })
}
