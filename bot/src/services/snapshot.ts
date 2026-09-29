/**
 * Build the public snapshot that lands in public/data/quejas.json.
 * Shared between `tsx src/services/export.ts` (write to disk) and the
 * HTTP endpoint at GET /export/quejas.json (serve for the GH Actions cron).
 */

import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { Db } from '../db/client.ts'
import { aggregateStats, countApoyos, listRecentQuejas, type QuejaRow } from '../db/queries.ts'
import { instanteUtc } from '../../../src/scraper/queja-router.ts'

export interface PublicQuejaRow {
  service_request_id: string
  status: string
  service_code: string
  service_name: string
  description: string
  /** ISO 8601 en UTC, con la Z: «2026-07-02T23:30:00Z». Igual `updated_datetime` y `registered_at`. */
  requested_datetime: string
  updated_datetime: string
  lat: null
  long: null
  address_string: string | null
  apoyos: number
  concejalia_area: string | null
  concejal_slug: string | null
  registro_entry_number: string | null
  registered_at: string | null
  /**
   * Public URL of the *anonymized* photo, e.g. `/data/quejas-photos/q-xxxx.jpg`.
   * Present ONLY when `process-photos` has downloaded, anonymized (faces +
   * plates mosaiced) and published an image for this queja. The raw Telegram
   * file_id is NEVER exposed here — libel/PII boundary.
   */
  photo?: string
}

export interface SnapshotOptions {
  /**
   * Resolve the public URL for a queja's anonymized photo, or null when none
   * has been published. Injected for testability; defaults to a filesystem
   * probe of `<directorioFotos()>/<id>.jpg`.
   */
  photoUrlFor?: (id: string) => string | null
}

/**
 * Dónde viven las fotos anonimizadas. En Fly, en el volumen (`QUEJAS_PHOTOS_DIR`,
 * bot/fly.toml): la imagen del bot se reconstruye en cada despliegue, y lo que se
 * escribiera dentro se perdería con ella. Sin la variable, junto al quejas.json
 * exportado, como en el portátil.
 */
export function directorioFotos(env: Record<string, string | undefined> = process.env): string {
  const fija = env.QUEJAS_PHOTOS_DIR?.trim()
  if (fija) return resolve(fija)
  const out = resolve(process.cwd(), env.QUEJAS_JSON_OUT ?? '../public/data/quejas.json')
  return join(dirname(out), 'quejas-photos')
}

/** Default resolver: a published photo exists iff the anonymized file is on disk. */
function defaultPhotoUrlFor(id: string): string | null {
  const slug = id.toLowerCase()
  return existsSync(join(directorioFotos(), `${slug}.jpg`))
    ? `/data/quejas-photos/${slug}.jpg`
    : null
}

export interface PublicSnapshot {
  generatedAt: string
  source: { platform: string; spec: string }
  stats: ReturnType<typeof aggregateStats>
  items: PublicQuejaRow[]
}

/**
 * Una marca del bot en ISO 8601 y en UTC, con la Z: «2026-07-02T23:30:00Z».
 *
 * SQLite rellena las marcas con `datetime('now')`, la hora UTC escrita
 * «2026-07-02 23:30:00» sin decir que es UTC, y `new Date()` lee esa forma en la
 * hora LOCAL de quien la lee: medido el 28-09-2026 en Chrome con el reloj en
 * Madrid, la ficha fechaba el 20 de septiembre una queja enviada a la 00:30 del
 * 21. Y la instantánea dice ser Open311 GeoReport v2, que pide fecha y hora con
 * su zona.
 *
 * La lee `instanteUtc`, el mismo lector que usan el plazo y las páginas. Se
 * cambia al exportar y no en la base: `ORDER BY created_at` compara texto, y un
 * DEFAULT nuevo dejaría filas «…T…Z» junto a las viejas «… …», ordenadas por la
 * forma. Lo que no es ISO sale como está: no se le adivina la zona.
 */
function conZona(marca: string): string
function conZona(marca: string | null): string | null
function conZona(marca: string | null): string | null {
  if (marca === null) return null
  const instante = instanteUtc(marca)
  if (Number.isNaN(instante)) return marca
  return new Date(instante).toISOString().replace('.000Z', 'Z')
}

function toPublicRow(
  db: Db,
  q: QuejaRow,
  photoUrlFor: (id: string) => string | null,
): PublicQuejaRow {
  const photo = photoUrlFor(q.id)
  return {
    service_request_id: q.id,
    status: q.state,
    service_code: q.category,
    service_name: q.category,
    // Entero. Se cortaba a 500 caracteres sin decirlo, y la ficha lo titula
    // «Detalle ciudadano (verbatim)».
    description: q.detail,
    requested_datetime: conZona(q.created_at),
    updated_datetime: conZona(q.updated_at),
    lat: null, // aggregated to neighborhood — never expose exact lat/lng
    long: null,
    address_string: q.neighborhood ?? null,
    apoyos: countApoyos(db, q.id),
    concejalia_area: q.concejalia_area,
    concejal_slug: q.concejal_slug,
    registro_entry_number: q.registro_entry_number,
    registered_at: conZona(q.registered_at),
    // Only attach the key when an anonymized image was actually published, so
    // the field's presence is a truthful "there is a public photo" signal.
    ...(photo ? { photo } : {}),
  }
}

export function buildSnapshot(db: Db, limit = 1000, opts: SnapshotOptions = {}): PublicSnapshot {
  const photoUrlFor = opts.photoUrlFor ?? defaultPhotoUrlFor
  const rows = listRecentQuejas(db, limit)
  return {
    generatedAt: new Date().toISOString(),
    source: {
      platform: 'CivicPulse bot · Telegram capture',
      spec: 'Open311 GeoReport v2 (extended)',
    },
    stats: aggregateStats(db),
    items: rows.map((r) => toPublicRow(db, r, photoUrlFor)),
  }
}
