#!/usr/bin/env tsx
/**
 * reunir:atribucion — give statements extracted before their speaker map the
 * group the map vouches for, without re-extracting them.
 *
 *   npm run reunir:atribucion                         # dry run: what it would do
 *   npm run reunir:atribucion -- --pleno qz6weg       # one session (repeatable)
 *   npm run reunir:atribucion -- --write              # write, at most --max sessions
 *   npm run reunir:atribucion -- --write --max 12
 *
 * Then rebuild the base and what is published, as after `carry:attribution`:
 *
 *   npm run verify:pleno-claims
 *
 * Why it exists, what it never does and the join it reuses are in
 * src/scraper/reunir-atribucion.ts. In short: until now the only re-join was
 * re-extraction, and the extractor's orphan guard refuses that for any session
 * a finding cites, so those sessions kept their map on disk and published no
 * group at all.
 *
 * The cap is the nightly's (`REATRIBUCION_MAX`, 2 already-published sessions per
 * pass, decision 4.4 of 2026-11-22): a faulty map must not change dozens of
 * sessions before anyone sees it. It counts sessions this pass would CHANGE;
 * the rest are reported as postponed, never dropped silently. Raising it with
 * `--max` is a person's choice, made where it can be read: a commit someone
 * reviews.
 *
 * Writes `public/data/pleno-claims-suggestions.json`, the extractor's output and
 * the verifier's input — the same file `carry:attribution` writes. Never under
 * the LOREG freeze.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { resolverDeGrupo } from '../src/scraper/claim-provenance'
import { seatsFromOfficials, type OfficialsDoc } from '../src/scraper/corporation-seats'
import { plenosConMapa } from '../src/scraper/etiqueta-de-grupo'
import { rechazarOpcionesDesconocidas } from '../src/scraper/opciones-cli'
import { retencionDeGrupo } from '../src/scraper/retencion-de-grupo'
import {
  DESENLACES,
  POR_QUE,
  corregidasEnFichas,
  reunirAtribucion,
  type Declaracion,
} from '../src/scraper/reunir-atribucion'
import { vedaActiva } from './lib/veda'

const SUGERENCIAS = resolve('public/data/pleno-claims-suggestions.json')
const RELABELS = resolve('public/data/pleno-claim-relabels.json')
const FINDINGS = resolve('public/data/pleno-findings.json')
const OFFICIALS = resolve('public/data/officials.json')
const MAPAS = resolve('pleno-speaker-map')
const TRANSCRIPCIONES = resolve('public/data/pleno-transcripts')

const leer = (p: string): string | null => (existsSync(p) ? readFileSync(p, 'utf8') : null)
const log = (s: string) => process.stdout.write(`[reunir-atribucion] ${s}\n`)

function main() {
  rechazarOpcionesDesconocidas('reunir-atribucion', {
    banderas: ['--write'],
    conValor: ['--pleno', '--max'],
  })
  const argv = process.argv.slice(2)
  const escribir = argv.includes('--write')
  const pedidas = argv.flatMap((a, i) => (a === '--pleno' ? [argv[i + 1]] : []))
  const maxCrudo = argv.includes('--max')
    ? argv[argv.indexOf('--max') + 1]
    : (process.env.REATRIBUCION_MAX ?? '2')
  const max = /^\d+$/.test(maxCrudo ?? '') ? Number(maxCrudo) : 0
  if (String(max) !== maxCrudo) log(`--max «${maxCrudo}» no es un número: se usa 0`)

  // Sin composición no se sabe qué grupo nombra a una persona: no se intenta nada.
  const officials = leer(OFFICIALS)
  const seats = officials ? seatsFromOfficials(JSON.parse(officials) as OfficialsDoc) : []
  if (seats.length === 0) {
    process.stderr.write(
      `[reunir-atribucion] ABORTADO: ${OFFICIALS} no da la composición; sin ella no se sabe ` +
        'qué grupo nombra a su concejal. No se intenta nada.\n',
    )
    process.exitCode = 1
    return
  }
  const retener = retencionDeGrupo(seats)

  const relabels = JSON.parse(leer(RELABELS) ?? '{"entries":{}}') as {
    entries?: Record<string, unknown>
  }
  const firmadas = new Set(Object.keys(relabels.entries ?? {}))
  // Sin las fichas no se sabe qué grupos retiró una persona en /hallazgos, y «no
  // lo sé» no es «ninguno»: no se intenta nada.
  const fichas = leer(FINDINGS)
  if (fichas === null) {
    process.stderr.write(`[reunir-atribucion] ABORTADO: falta ${FINDINGS}. No se intenta nada.\n`)
    process.exitCode = 1
    return
  }
  const corregidas = corregidasEnFichas(
    (JSON.parse(fichas) as { items?: Parameters<typeof corregidasEnFichas>[0] }).items ?? [],
  )
  log(`declaraciones con el grupo de su cita corregido con firma en /hallazgos: ${corregidas.size}`)

  const conMapa = plenosConMapa(existsSync(MAPAS) ? readdirSync(MAPAS) : [])
  const desconocidas = pedidas.filter((p) => !conMapa.has(p))
  if (desconocidas.length)
    log(`sin mapa de voces en disco, no se miran: ${desconocidas.join(', ')}`)
  const sesiones = new Set(pedidas.length ? pedidas.filter((p) => conMapa.has(p)) : conMapa)

  const sug = JSON.parse(readFileSync(SUGERENCIAS, 'utf8')) as { items: Declaracion[] }
  const resolverDe = (pleno: string) =>
    resolverDeGrupo(leer(join(TRANSCRIPCIONES, `${pleno}.txt`)), leer(join(MAPAS, `${pleno}.json`)))

  // Primero, sobre todas: qué cambiaría en cada sesión. El tope se aplica a las
  // que cambian, en orden de id, y la segunda pasada sólo toca ésas.
  const ensayo = reunirAtribucion(sug.items, {
    sesiones,
    resolverDe,
    retener,
    firmadas,
    corregidas,
  })
  const cambian = Object.keys(ensayo.porSesion)
    .filter((p) => ensayo.porSesion[p].desenlaces.unida > 0)
    .sort()
  const dentro = new Set(cambian.slice(0, max))
  const pospuestas = cambian.slice(max)
  const r = escribir
    ? reunirAtribucion(sug.items, { sesiones: dentro, resolverDe, retener, firmadas, corregidas })
    : ensayo

  const sesionesVistas = Object.keys(ensayo.porSesion).sort()
  log(
    `sesiones con mapa: ${conMapa.size} · miradas: ${sesionesVistas.length} · ` +
      `con algo que unir: ${cambian.length} · tope: ${max}`,
  )
  if (ensayo.sinMapaLegible.length) {
    log(
      `con mapa pero sin poder cotejarlo (sin transcripción o ilegible), NO intentadas: ` +
        ensayo.sinMapaLegible.join(', '),
    )
  }
  const sinDeclaraciones = [...sesiones].filter(
    (p) => !ensayo.porSesion[p] && !ensayo.sinMapaLegible.includes(p),
  )
  if (sinDeclaraciones.length) {
    log(`con mapa y sin declaraciones extraídas: ${sinDeclaraciones.sort().join(', ')}`)
  }

  // Cada desenlace por separado, también a cero (DATA_INTEGRITY, regla 2).
  const total = Object.fromEntries(DESENLACES.map((d) => [d, 0])) as Record<string, number>
  process.stdout.write(
    'sesión     decl.  antes→después  ' + DESENLACES.join(' · ') + '  · grupos escritos\n',
  )
  for (const p of sesionesVistas) {
    const s = ensayo.porSesion[p]
    const aplicada = !escribir || dentro.has(p)
    const despues = aplicada ? s.conGrupoDespues : s.conGrupoAntes
    for (const d of DESENLACES) total[d] += s.desenlaces[d]
    process.stdout.write(
      `${p.padEnd(10)} ${String(s.declaraciones).padStart(5)}  ` +
        `${String(s.conGrupoAntes).padStart(5)}→${String(despues).padEnd(7)} ` +
        DESENLACES.map((d) => s.desenlaces[d]).join(' · ') +
        `  · ${JSON.stringify(s.porGrupo)}` +
        (escribir && !aplicada && s.desenlaces.unida > 0 ? '  POSPUESTA (tope)' : '') +
        '\n',
    )
  }
  for (const d of DESENLACES) log(`${d.padEnd(24)} ${String(total[d]).padStart(5)}  ${POR_QUE[d]}`)

  if (!escribir) {
    log('ENSAYO — no se ha escrito nada. Repite con --write para aplicarlo.')
    return
  }
  // En veda, el ensayo vale; escribir no: dar un grupo a una cita es atribuírsela a un candidato.
  const veda = vedaActiva()
  if (veda) {
    log(`veda electoral hasta ${veda}: --write NO se aplica, no se ha escrito nada`)
    return
  }
  const intentadas = [...dentro]
  const unidas = intentadas.reduce((n, p) => n + r.porSesion[p].desenlaces.unida, 0)
  if (pospuestas.length) {
    log(`POSPUESTAS por el tope (${max}), sin tocar: ${pospuestas.join(', ')}`)
  }
  if (unidas === 0) {
    log('nada que escribir')
    return
  }
  // La única diferencia permitida es `speakerGroup` de null a un grupo. Si no, no se escribe.
  const antes = sug.items
  for (let i = 0; i < antes.length; i++) {
    const a = antes[i]
    const b = r.items[i]
    if (a === b) continue
    if (a.id !== b.id || a.verbatim !== b.verbatim || a.speakerGroup || !b.speakerGroup) {
      process.stderr.write(`[reunir-atribucion] ABORTADO: cambio inesperado en ${a.id}\n`)
      process.exit(1)
    }
  }
  writeFileSync(SUGERENCIAS, JSON.stringify({ ...sug, items: r.items }, null, 2) + '\n')
  log(`escrito ${SUGERENCIAS}: ${unidas} grupo(s) en ${intentadas.length} sesión(es)`)
  log('siguiente paso: npm run verify:pleno-claims (regenera la base y el publicado)')
}

main()
