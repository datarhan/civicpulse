/**
 * Exports the SQLite state to public/data/quejas.json in Open311
 * GeoReport v2-flavoured shape. Meant to be run by a nightly cron
 * (same pattern as scrape-all) that commits the resulting JSON.
 *
 * Usage:
 *   tsx src/services/export.ts            # writes to ../public/data/quejas.json
 *   tsx src/services/export.ts out.json   # writes to the given path
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import 'dotenv/config'
import { openDb } from '../db/client.ts'
import {
  aggregateStats,
  countApoyos,
  listRecentQuejas,
  type QuejaRow,
} from '../db/queries.ts'

function toPublicRow(db: ReturnType<typeof openDb>, q: QuejaRow) {
  return {
    service_request_id: q.id,
    status: q.state,
    status_notes: q.state === 'resuelta' ? 'resuelta' : q.state,
    service_code: q.category,
    service_name: q.category,
    description: q.detail.slice(0, 500),
    requested_datetime: q.created_at,
    updated_datetime: q.updated_at,
    // Location aggregated to neighborhood centroid; do NOT expose exact
    // lat/lng (LOPDGDD + editorial contract).
    lat: null,
    long: null,
    address_string: q.neighborhood ?? null,
    // Apoyos (co-sign count) surfaced as a non-standard extension field.
    apoyos: countApoyos(db, q.id),
    concejalia_area: q.concejalia_area,
    concejal_slug: q.concejal_slug,
    registro_entry_number: q.registro_entry_number,
    registered_at: q.registered_at,
  }
}

function main() {
  const outPath = resolve(
    process.cwd(),
    process.argv[2] ?? process.env.QUEJAS_JSON_OUT ?? '../public/data/quejas.json'
  )
  const db = openDb()
  const rows = listRecentQuejas(db, 1000)
  const stats = aggregateStats(db)
  const payload = {
    generatedAt: new Date().toISOString(),
    source: {
      platform: 'CivicPulse bot · Telegram capture',
      spec: 'Open311 GeoReport v2 (extended)',
    },
    stats,
    items: rows.map((r) => toPublicRow(db, r)),
  }
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(payload, null, 2))
  console.log(
    `[export] wrote ${rows.length} quejas · total=${stats.total} · to ${outPath}`
  )
}

main()
