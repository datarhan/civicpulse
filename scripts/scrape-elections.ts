#!/usr/bin/env tsx
/**
 * Municipal election results for Riba-roja de Túria (INE 46214) from the
 * GVA/ICV open-data WFS layer «Mapa electoral municipal — Elecciones
 * Locales» (fed by ARGOS). CC-BY 4.0.
 *
 *   npm run scrape:elections
 *
 * Near-static upstream (changes at elections + occasional revisions) —
 * runs BEST-EFFORT in scrape:all: a WFS flake must not red the nightly,
 * yesterday's snapshot stays valid. Output: public/data/elections.json.
 * Consumers: the journalist agent's biography research floor (local
 * high-trust citation for «Resultados electorales»); /datos catalog can
 * follow later.
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseEleccionesLocales } from '../src/scraper/elections'

const WFS_CSV_URL =
  'https://terramapas.icv.gva.es/2001_EleccionesLocales?request=GetFeature&service=WFS&version=2.0.0&typename=Locales.WFS&outputformat=csv'
const INE = '46214'
const OUT = resolve('public/data/elections.json')

async function main() {
  const res = await fetch(WFS_CSV_URL, {
    headers: { 'User-Agent': 'CivicPulse/1.0 (civic monitor Riba-roja; respectful scraper)' },
  })
  if (!res.ok) {
    process.stderr.write(`[scrape-elections] WFS returned ${res.status}\n`)
    process.exit(1)
  }
  const csv = await res.text()
  const snap = parseEleccionesLocales(csv, INE)
  writeFileSync(OUT, JSON.stringify(snap, null, 2) + '\n', 'utf8')
  const latest = snap.elections[0]
  process.stdout.write(
    `[scrape-elections] ${snap.elections.length} municipales for INE ${INE} · ` +
      `latest ${latest.year}: ${latest.results
        .slice(0, 3)
        .map((r) => `${r.party} ${r.pct}%`)
        .join(', ')} · abstención ${latest.abstencionPct}%\n`,
  )
}

main().catch((err) => {
  process.stderr.write(`[scrape-elections] failed: ${(err as Error).message}\n`)
  process.exit(1)
})
