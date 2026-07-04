/**
 * Anonymize-and-publish job for queja photos.
 *
 *   listQuejasWithPhoto(db)            (non-deleted rows carrying a file_id)
 *     → skip those already published    (anonymized jpg already on disk)
 *     → download raw bytes from Telegram (in memory — raw NEVER hits disk)
 *     → detectSensitiveRegions()         (throws → HOLD, never publish raw)
 *     → anonymizeImage()                 (metadata strip + degrade + mosaic)
 *     → write public/data/quejas-photos/<id>.jpg
 *
 * The public snapshot (snapshot.ts) then attaches the photo URL for any queja
 * whose anonymized file exists. Run before `npm run export`.
 *
 * Usage: npm run process-photos     (from the bot package)
 */

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import dotenv from 'dotenv'
import { openDb, type Db } from '../db/client.ts'
import { listQuejasWithPhoto, type QuejaRow } from '../db/queries.ts'
import { anonymizeImage, detectSensitiveRegions } from './photo-anonymize.ts'

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
  detect?: typeof detectSensitiveRegions
  anonymize?: typeof anonymizeImage
  log?: (msg: string) => void
}

export interface ProcessResult {
  published: string[]
  held: string[]
  skipped: number
  pruned: string[]
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
    detect = detectSensitiveRegions,
    anonymize = anonymizeImage,
    log = console.log,
  } = deps

  const destFor = (id: string) => join(photosDir, `${id.toLowerCase()}.jpg`)
  const rows = listQuejasWithPhoto(db)
  const todo = selectQuejasToProcess(rows as QuejaRow[], (id) => existsSync(destFor(id)))

  const published: string[] = []
  const held: string[] = []

  for (const row of todo) {
    try {
      const raw = await fetchBytes(token, row.photo_file_id as string)
      const boxes = await detect(raw, { env }) // throws → caught → HELD
      const out = await anonymize(raw, boxes)
      mkdirSync(photosDir, { recursive: true })
      writeFileSync(destFor(row.id), out)
      published.push(row.id)
      log(`[photos] published ${row.id} · ${boxes.length} region(s) mosaiced`)
    } catch (err) {
      held.push(row.id)
      log(`[photos] HELD ${row.id} — ${(err as Error).message}`)
    }
  }

  // Remove photos of quejas that are no longer publishable (e.g. forgotten).
  const allowed = new Set(rows.map((r) => r.id.toLowerCase()))
  const pruned = pruneOrphanPhotos(photosDir, allowed)
  for (const f of pruned) log(`[photos] pruned ${f} (queja no longer publishable)`)

  return { published, held, skipped: rows.length - todo.length, pruned }
}

async function main() {
  // bot/.env first, then the repo-root .env for the shared vision key.
  dotenv.config()
  dotenv.config({ path: '../.env' })

  const token = process.env.BOT_TOKEN
  if (!token) throw new Error('BOT_TOKEN missing — set it in bot/.env or the environment')

  const outPath = resolve(
    process.cwd(),
    process.env.QUEJAS_JSON_OUT ?? '../public/data/quejas.json',
  )
  const photosDir = join(dirname(outPath), 'quejas-photos')

  const db = openDb()
  const res = await processPhotos({ db, token, photosDir })
  console.log(
    `[photos] done · published=${res.published.length} held=${res.held.length} skipped=${res.skipped} pruned=${res.pruned.length} · dir=${photosDir}`,
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
