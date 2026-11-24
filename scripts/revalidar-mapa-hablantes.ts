#!/usr/bin/env tsx
/**
 * Re-apply Gate 2b (a vote read back or a short answer identifies nobody) to
 * the speaker maps stored before it existed. No model is called.
 *
 *   npm run revalidar:mapa              # ensayo: dice qué retiraría, no escribe
 *   npm run revalidar:mapa -- --write   # escribe pleno-speaker-map/*.json
 *
 * Only ever weakening (tier A): rows move from `rows` to `rejected` with the
 * reason a fresh run would give, and each map records the pass in
 * `revalidaciones`. The rule lives in `src/scraper/speaker-map-validate.ts`
 * (`respuestaBreve`) and is applied by `src/scraper/speaker-map-revalidar.ts`;
 * this file only reads, reports and writes.
 *
 * A published bloc does not change here. What changes is what the next
 * re-extraction can keep (`carry:attribution` keeps a bloc only if today's map
 * gives it to that literal) and what `check:claim-provenance` reports.
 *
 * Run it where the maps live and the cron does not: the /hallazgos cron writes
 * `pleno-speaker-map/` from the curator's checkout (see CLAUDE.md, «the
 * curator's working tree is never quiet»).
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { SpeakerMap } from '../src/scraper/speaker-map'
import { revalidarMapa } from '../src/scraper/speaker-map-revalidar'
import { vedaActiva } from './lib/veda'

const DIR = resolve('pleno-speaker-map')
const write = process.argv.includes('--write')
const log = (s: string) => process.stdout.write(`[revalidar-mapa] ${s}\n`)

const veda = vedaActiva()
if (veda && write) {
  log(`veda electoral hasta ${veda}: no se toca ningún mapa (ensayo sí).`)
  process.exit(0)
}

const fecha = new Date().toISOString().slice(0, 10)
let mapas = 0
let cambiados = 0
let retiradas = 0
let noEvaluadas = 0
let conservadas = 0
const porMotivo: Record<string, number> = {}
for (const f of readdirSync(DIR)
  .filter((x) => x.endsWith('.json'))
  .sort()) {
  const path = join(DIR, f)
  const raw = readFileSync(path, 'utf8')
  const map = JSON.parse(raw) as SpeakerMap
  mapas++
  const r = revalidarMapa(map, fecha)
  conservadas += r.conservadas
  retiradas += r.retiradas.length
  noEvaluadas += r.noEvaluadas.length
  for (const x of r.retiradas) porMotivo[x.reason] = (porMotivo[x.reason] ?? 0) + 1
  const out = JSON.stringify(r.map, null, 2) + '\n'
  const cambia = out !== raw
  if (cambia) cambiados++
  log(
    `${map.plenoId}: ${r.conservadas} conservadas · ${r.retiradas.length} retiradas · ` +
      `${r.noEvaluadas.length} sin evaluar${cambia ? '' : ' · sin cambios'}`,
  )
  for (const x of r.retiradas) log(`    − ${x.label} ${x.bloc ?? '—'} [${x.reason}] ${x.detail}`)
  for (const x of r.noEvaluadas) log(`    ? ${x.label} ${x.why}`)
  if (write && cambia) writeFileSync(path, out)
}
log(
  `${mapas} mapa(s) · ${conservadas} filas conservadas · ${retiradas} retiradas ${JSON.stringify(porMotivo)} · ` +
    `${noEvaluadas} sin evaluar · ${cambiados} fichero(s) ${write ? 'escritos' : 'cambiarían (ensayo; --write para escribir)'}`,
)
