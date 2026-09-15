#!/usr/bin/env tsx
/**
 * La red completa de Metrovalencia —vías y estaciones de todas sus líneas— desde las
 * relaciones de ruta de OSM, por Overpass. Cada vía y cada estación llevan la ref de
 * sus líneas, y una estación de varias líneas acumula sus `lineRefs`.
 *
 * El parseo vive en `src/scraper/metro-network.ts`, que deja fuera lo que FGV opera en
 * otras redes: la consulta pide también `operator~FGV` para no perder una relación de
 * València sin `network`, y con eso trae el TRAM d'Alacant. Lo descartado sale contado
 * en el bloque `ambito` del snapshot y en el log.
 *
 * Salida: public/data/metro-network.json, que carga el mapa de la portada.
 *
 * Uso: npm run scrape:metro-network
 *      npm run scrape:metro-network -- --save-raw    guarda además el payload crudo
 *      npm run scrape:metro-network -- --from-cache  parsea el payload guardado, sin red
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseMetroNetwork,
  violacionesDeAmbito,
  type OsmElement,
} from '../src/scraper/metro-network'
import { fetchOverpass, OVERPASS_ENDPOINTS } from '../src/scraper/overpass-fetch'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const OUT = join(PROJECT_ROOT, 'public/data/metro-network.json')
// El payload crudo de Overpass, fuera de git: para iterar sin volver a pedirlo y
// para recortar de él el fixture del parser, como `.cache/incendios`.
const CACHE = join(PROJECT_ROOT, '.cache/metro-network/overpass.json')

// Recorded in the emitted payload for provenance; the shared fetcher rotates
// across all OVERPASS_ENDPOINTS with 429/5xx retry.
const OVERPASS = OVERPASS_ENDPOINTS[0]

const runQuery = (ql: string) => fetchOverpass(ql, { label: 'metro-network' })

// Route relations (one per line × direction) + their members. `>` recurses
// to pull way geometry; we then re-hit station nodes explicitly because
// Overpass relation-member expansion only gives us the `stop` role nodes.
// Las dos cláusulas se quedan: la de `operator` trae el TRAM d'Alacant, que el
// parser descarta, pero también cubriría una relación de València sin `network`.
const NETWORK_QL = `[out:json][timeout:60];
(
  relation["route"~"subway|tram|light_rail"]["network"~"Metrovalencia"];
  relation["route"~"subway|tram|light_rail"]["operator"~"Ferrocarrils de la Generalitat Valenciana"];
);
out body;
>;
out geom tags;`

async function traePayload(): Promise<string> {
  if (process.argv.includes('--from-cache')) {
    console.log(`[metro-network] parseando el payload guardado en ${CACHE}`)
    return readFile(CACHE, 'utf8')
  }
  console.log('[metro-network] fetching full Metrovalencia network…')
  const raw = await runQuery(NETWORK_QL)
  if (process.argv.includes('--save-raw')) {
    await mkdir(dirname(CACHE), { recursive: true })
    await writeFile(CACHE, raw)
    console.log(`[metro-network] payload crudo guardado en ${CACHE}`)
  }
  return raw
}

async function main() {
  const raw = await traePayload()
  const red = parseMetroNetwork(JSON.parse(raw) as { elements: OsmElement[] })
  const { relaciones } = red.ambito

  // Un renglón por cada grupo descartado: lo que queda fuera se dice, no se calla.
  for (const e of relaciones.excluidas) {
    const red = e.network ? ` · ${e.network}` : ''
    const refs = e.refs.length ? ` · ${e.refs.join(', ')}` : ''
    console.log(`[metro-network] fuera: ${e.relaciones} relación(es) · ${e.por}${red}${refs}`)
  }
  if (relaciones.sinRef > 0) {
    console.log(`[metro-network] dentro del ámbito y sin ref de línea: ${relaciones.sinRef}`)
  }
  if (relaciones.incluidas === 0) {
    // La nocturna lo corre como best-effort: si falla, se queda el snapshot de ayer.
    throw new Error(
      `ninguna de las ${relaciones.consultadas} relaciones cae dentro de Metrovalencia: ` +
        'no se publica una red vacía',
    )
  }
  for (const v of violacionesDeAmbito(red)) console.warn(`[metro-network] AVISO ${v}`)

  const payload = {
    generatedAt: new Date().toISOString(),
    source: { platform: 'OSM Overpass API', endpoint: OVERPASS },
    lines: red.lines,
    tracks: red.tracks,
    stations: red.stations,
    ambito: red.ambito,
    stats: {
      lines: red.lines.length,
      tracks: red.tracks.length,
      stations: red.stations.length,
    },
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
  console.log(
    `[metro-network] wrote ${OUT}\n` +
      `[metro-network] ${relaciones.incluidas} de ${relaciones.consultadas} relaciones · ` +
      `${payload.stats.lines} lines · ${payload.stats.tracks} tracks · ${payload.stats.stations} stations`,
  )
}

main().catch((err) => {
  console.error('[metro-network] failed:', err)
  process.exit(1)
})
