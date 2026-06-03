/**
 * Curator CLI: apply an approved right-of-reply to a queja.
 *
 * Mirrors scripts/apply-promise-response.ts — only ever mutates the
 * curated file public/data/quejas-responses.json. Never touches the
 * bot's quejas.json snapshot (which is a live export, not curation).
 *
 * Usage:
 *   npm run queja-reply -- <Q-ID> "<role>" "<firmante>" "<verbatim text>" [source-url]
 *
 * Example:
 *   npm run queja-reply -- Q-ABC12301 \
 *     "Concejalía de Obra Pública" \
 *     "Teresa Pozuelo Martín" \
 *     "El bache será reparado la semana del 28 de abril. Expediente OBR-2026-0123." \
 *     https://www.ribarroja.es/actas/pleno_2026_04_20
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

interface QuejaResponseItem {
  id: string
  queja_id: string
  role: string
  firmante: string
  text: string
  source_url: string | null
  appliedAt: string
}

interface QuejaResponsesSnapshot {
  generatedAt: string
  note: string
  items: QuejaResponseItem[]
}

function usage(): never {
  console.error('Usage: npm run queja-reply -- <Q-ID> "<role>" "<firmante>" "<text>" [source-url]')
  process.exit(2)
}

function main() {
  const args = process.argv.slice(2)
  if (args.length < 4) usage()
  const [rawId, role, firmante, text, sourceUrl] = args

  const id = rawId.toUpperCase().trim()
  if (!/^Q-[0-9A-Z]{4,}$/.test(id)) {
    console.error(`Invalid queja id: ${rawId}`)
    process.exit(2)
  }
  if (role.trim().length < 3) {
    console.error('Role must be at least 3 chars.')
    process.exit(2)
  }
  if (firmante.trim().length < 3) {
    console.error('Firmante must be at least 3 chars.')
    process.exit(2)
  }
  if (text.trim().length < 20) {
    console.error('Response text must be at least 20 chars (avoid truncation).')
    process.exit(2)
  }
  if (text.trim().length > 2000) {
    console.error('Response text must be ≤ 2000 chars.')
    process.exit(2)
  }
  if (sourceUrl && !/^https?:\/\//.test(sourceUrl)) {
    console.error('Source URL must be absolute (https://…).')
    process.exit(2)
  }

  const path = resolve(process.cwd(), 'public/data/quejas-responses.json')
  const snap = JSON.parse(readFileSync(path, 'utf8')) as QuejaResponsesSnapshot

  const newId = `qr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const entry: QuejaResponseItem = {
    id: newId,
    queja_id: id,
    role: role.trim(),
    firmante: firmante.trim(),
    text: text.trim(),
    source_url: sourceUrl?.trim() || null,
    appliedAt: new Date().toISOString(),
  }
  snap.items.push(entry)
  snap.generatedAt = new Date().toISOString()
  writeFileSync(path, JSON.stringify(snap, null, 2) + '\n')
  console.log(`[queja-reply] applied ${newId} → ${id} (${firmante})`)
}

main()
