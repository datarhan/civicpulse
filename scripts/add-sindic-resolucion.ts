/**
 * Curator CLI: add a Síndic de Greuges CV resolución to the curated
 * public/data/sindic.json snapshot. Mirrors apply-promise-response.ts /
 * apply-queja-response.ts.
 *
 * Usage:
 *   npm run sindic:add -- \
 *     <expediente> <fecha-YYYY-MM-DD> <materia> <sentido> \
 *     "<titulo>" "<resumen-verbatim>" <urlPdf> [Q-XXXX-si-aplica]
 *
 * Example:
 *   npm run sindic:add -- 202400427 2024-06-12 transparencia recomendacion \
 *     "Falta de respuesta a solicitud de acceso a contratos de limpieza" \
 *     "El Síndic recomienda al Ayuntamiento de Riba-roja que resuelva expresamente …" \
 *     https://www.elsindic.com/resoluciones/expedientes/2024/202400427/12337532.pdf \
 *     Q-ABC12301
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  idResolucion,
  validateResolucion,
  validateSnapshot,
  ALLOWED_MATERIAS,
  ALLOWED_SENTIDOS,
  type SindicResolucion,
  type SindicSnapshot,
} from '../src/scraper/sindic.ts'

function usage(): never {
  console.error(
    'Usage: npm run sindic:add -- <expediente> <fecha> <materia> <sentido> "<titulo>" "<resumen>" <urlPdf> [Q-XXXX]\n' +
      `\nAllowed materia: ${ALLOWED_MATERIAS.join(' | ')}\n` +
      `Allowed sentido: ${ALLOWED_SENTIDOS.join(' | ')}`,
  )
  process.exit(2)
}

function main() {
  const args = process.argv.slice(2)
  if (args.length < 7) usage()
  const [expediente, fecha, materia, sentido, titulo, resumen, urlPdf, quejaId] = args

  const candidate: SindicResolucion = {
    id: idResolucion(expediente, urlPdf),
    expediente,
    fecha,
    materia: materia as never,
    sentido: sentido as never,
    titulo,
    resumen,
    urlPdf,
    quejaIdRelacionada: quejaId ?? null,
  }
  const validated = validateResolucion(candidate)

  const path = resolve(process.cwd(), 'public/data/sindic.json')
  const rawSnap = JSON.parse(readFileSync(path, 'utf8')) as SindicSnapshot
  // Reject if id already present
  if (rawSnap.items.some((i) => i.id === validated.id)) {
    console.error(
      `[sindic:add] ${validated.id} already present. Remove or edit it in public/data/sindic.json first.`,
    )
    process.exit(3)
  }
  const merged = [...rawSnap.items, validated].sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
  const nextSnap: SindicSnapshot = {
    generatedAt: new Date().toISOString(),
    note: rawSnap.note,
    source: rawSnap.source,
    items: merged,
  }
  // Re-validate the whole snapshot before writing (catches duplicates etc.)
  const out = validateSnapshot(nextSnap)
  writeFileSync(path, JSON.stringify(out, null, 2) + '\n')
  console.log(`[sindic:add] saved ${validated.id} · ${merged.length} total items`)
}

main()
