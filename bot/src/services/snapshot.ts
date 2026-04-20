/**
 * Build the public snapshot that lands in public/data/quejas.json.
 * Shared between `tsx src/services/export.ts` (write to disk) and the
 * HTTP endpoint at GET /export/quejas.json (serve for the GH Actions cron).
 */

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
}

export interface PublicSnapshot {
  generatedAt: string
  source: { platform: string; spec: string }
  stats: ReturnType<typeof aggregateStats>
  items: PublicQuejaRow[]
}

function toPublicRow(db: Db, q: QuejaRow): PublicQuejaRow {
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
  }
}

export function buildSnapshot(db: Db, limit = 1000): PublicSnapshot {
  const rows = listRecentQuejas(db, limit)
  return {
    generatedAt: new Date().toISOString(),
    source: {
      platform: 'CivicPulse bot · Telegram capture',
      spec: 'Open311 GeoReport v2 (extended)',
    },
    stats: aggregateStats(db),
    items: rows.map((r) => toPublicRow(db, r)),
  }
}
