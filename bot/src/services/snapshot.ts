/**
 * Build the public snapshot that lands in public/data/quejas.json.
 * Shared between `tsx src/services/export.ts` (write to disk) and the
 * HTTP endpoint at GET /export/quejas.json (serve for the GH Actions cron).
 */

import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { Db } from '../db/client.ts'
import { aggregateStats, countApoyos, listRecentQuejas, type QuejaRow } from '../db/queries.ts'

export interface PublicQuejaRow {
  service_request_id: string
  status: string
  service_code: string
  service_name: string
  description: string
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
   * probe of `<dir of quejas.json>/quejas-photos/<id>.jpg`.
   */
  photoUrlFor?: (id: string) => string | null
}

/** Directory the anonymized photos live in — next to the exported quejas.json. */
function defaultPhotosDir(): string {
  const out = resolve(process.cwd(), process.env.QUEJAS_JSON_OUT ?? '../public/data/quejas.json')
  return join(dirname(out), 'quejas-photos')
}

/** Default resolver: a published photo exists iff the anonymized file is on disk. */
function defaultPhotoUrlFor(id: string): string | null {
  const slug = id.toLowerCase()
  return existsSync(join(defaultPhotosDir(), `${slug}.jpg`))
    ? `/data/quejas-photos/${slug}.jpg`
    : null
}

export interface PublicSnapshot {
  generatedAt: string
  source: { platform: string; spec: string }
  stats: ReturnType<typeof aggregateStats>
  items: PublicQuejaRow[]
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
    description: q.detail.slice(0, 500),
    requested_datetime: q.created_at,
    updated_datetime: q.updated_at,
    lat: null, // aggregated to neighborhood — never expose exact lat/lng
    long: null,
    address_string: q.neighborhood ?? null,
    apoyos: countApoyos(db, q.id),
    concejalia_area: q.concejalia_area,
    concejal_slug: q.concejal_slug,
    registro_entry_number: q.registro_entry_number,
    registered_at: q.registered_at,
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
