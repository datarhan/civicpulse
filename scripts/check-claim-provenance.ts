#!/usr/bin/env tsx
/**
 * ¿Sigue estando cada declaración publicada donde dice que está?
 *
 *   npm run check:claim-provenance             # todo el corpus publicado
 *   npm run check:claim-provenance -- --pleno <id>
 *   npm run check:claim-provenance -- --list sin-rastro   # detalle de un desenlace
 *
 * El hueco que tapa: `check:finding-quotes` comprueba las citas de los
 * HALLAZGOS —la prosa curada, ~130 citas— y las 4.664 declaraciones publicadas
 * no las comprobaba nadie. La primera cuenta, el 3-sep-2026: 1.564 (33 %) sólo
 * existen ya en la transcripción superseded, 24 en ninguna, 291 atribuciones
 * sin sostén y 4 con el partido cambiado. Cuatro sesiones se re-transcribieron
 * después de extraer sus declaraciones y nada re-derivó nada.
 *
 * La lógica —los cuatro desenlaces y qué bloquea— vive en
 * `src/scraper/claim-provenance.ts`, probada. Aquí sólo hay E/S.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  classifyAttribution,
  classifyClaimProvenance,
  tallyProvenance,
  type AttributionOutcome,
  type ProvenanceOutcome,
  type ProvenanceRow,
} from '../src/scraper/claim-provenance'
import { alignSpeakerMap, blocResolverFor } from '../src/scraper/speaker-map-align'
import { parseDiarizedTranscript } from '../src/scraper/voice-id'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CLAIMS = join(ROOT, 'public/data/pleno-claims')
const TRANSCRIPTS = join(ROOT, 'public/data/pleno-transcripts')
const MAPS = join(ROOT, 'pleno-speaker-map')

const read = (p: string): string | null => (existsSync(p) ? readFileSync(p, 'utf8') : null)

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i === -1 ? undefined : process.argv[i + 1]
}

interface Detail extends ProvenanceRow {
  plenoId: string
  claimId: string
  verbatim: string
  stored: string | null
  fresh: string | null
}

function main() {
  const onlyPleno = arg('--pleno')
  const listWanted = arg('--list')
  const details: Detail[] = []
  const rows: ProvenanceRow[] = []
  let plenosSeen = 0
  let plenosWithoutTranscript = 0
  let plenosWithoutMap = 0

  const files = readdirSync(CLAIMS).filter((f) => f.endsWith('.json') && f !== 'index.json')
  for (const f of files) {
    const plenoId = f.replace(/\.json$/, '')
    if (onlyPleno && plenoId !== onlyPleno) continue
    plenosSeen += 1

    const current = read(join(TRANSCRIPTS, `${plenoId}.txt`))
    const superseded = read(join(TRANSCRIPTS, 'superseded', `${plenoId}.txt`))
    if (current === null) plenosWithoutTranscript += 1

    // El mapa de voces es opcional y su ausencia NO es un desacuerdo: sin él
    // no hay con qué cotejar la atribución, y decir «coincide» sería inventar
    // un acuerdo con nadie.
    const mapRaw = read(join(MAPS, `${plenoId}.json`))
    let resolveBloc: ((v: string) => string | null) | null = null
    if (mapRaw !== null && current !== null) {
      try {
        const published = parseDiarizedTranscript(current)
        const map = JSON.parse(mapRaw)
        resolveBloc = blocResolverFor(published, alignSpeakerMap({ published, map } as never))
      } catch {
        resolveBloc = null
      }
    }
    if (resolveBloc === null) plenosWithoutMap += 1

    const chunk = JSON.parse(readFileSync(join(CLAIMS, f), 'utf8'))
    for (const item of chunk.items ?? []) {
      const claim = item.claim
      const verbatim: string | undefined = claim?.verbatim
      if (!verbatim) continue
      const provenance: ProvenanceOutcome = classifyClaimProvenance({
        verbatim,
        current,
        superseded,
      })
      const stored: string | null = claim.speakerGroup ?? null
      const fresh = resolveBloc ? resolveBloc(verbatim) : null
      const attribution: AttributionOutcome = classifyAttribution({
        stored,
        fresh,
        hasMap: resolveBloc !== null,
      })
      rows.push({ provenance, attribution })
      details.push({
        plenoId,
        claimId: claim.id ?? '?',
        verbatim,
        stored,
        fresh,
        provenance,
        attribution,
      })
    }
  }

  const t = tallyProvenance(rows)

  console.log(`── check:claim-provenance ${'─'.repeat(38)}`)
  console.log(
    `  ${plenosSeen} sesión(es) · ${t.total} declaración(es) · ` +
      `${plenosWithoutTranscript} sin transcripción · ${plenosWithoutMap} sin mapa de voces`,
  )
  console.log('\n  procedencia de la cita')
  const P: Array<[ProvenanceOutcome, string]> = [
    ['vigente', 'en la transcripción vigente'],
    ['solo-superseded', 'SÓLO en la superseded — la procedencia existe, es la anterior'],
    ['sin-rastro', 'en NINGUNA transcripción'],
    ['sin-transcripcion', 'no hay acta que leer — no comprobada, que no es lo mismo'],
  ]
  for (const [k, label] of P) {
    console.log(`    ${String(t.provenance[k] ?? 0).padStart(5)}  ${k.padEnd(18)} ${label}`)
  }
  console.log('\n  atribución frente al mapa de voces de hoy')
  const A: Array<[AttributionOutcome, string]> = [
    ['coincide', 'lo publicado es lo que sostiene la evidencia'],
    ['sin-sosten', 'publicamos un bloc que la evidencia ya NO sostiene'],
    ['sin-publicar', 'la evidencia sostiene uno que no publicamos (aditivo)'],
    ['partido-distinto', 'publicamos el partido EQUIVOCADO'],
    ['sin-mapa', 'sin mapa: no se juzga'],
  ]
  for (const [k, label] of A) {
    console.log(`    ${String(t.attribution[k] ?? 0).padStart(5)}  ${k.padEnd(18)} ${label}`)
  }

  if (listWanted) {
    const hits = details.filter((d) => d.provenance === listWanted || d.attribution === listWanted)
    console.log(`\n  ── ${listWanted} · ${hits.length} ${'─'.repeat(30)}`)
    for (const d of hits.slice(0, 40)) {
      console.log(`    ${d.plenoId}  ${d.claimId}`)
      console.log(`      «${d.verbatim.slice(0, 90)}…»`)
      if (d.stored !== d.fresh) console.log(`      publicado=${d.stored} · evidencia=${d.fresh}`)
    }
    if (hits.length > 40) console.log(`    …y ${hits.length - 40} más`)
  }

  console.log()
  if (!t.ok) {
    console.error(`[check:claim-provenance] ${t.motivo}`)
    console.error(
      '  `solo-superseded` NO bloquea: la cita existe, en la versión anterior.\n' +
        '  Bloquean las dos que no tienen arreglo silencioso — una cita que no está\n' +
        '  en ninguna acta, y un partido cambiado. Revísalas con:\n' +
        '    npm run check:claim-provenance -- --list sin-rastro\n' +
        '    npm run check:claim-provenance -- --list partido-distinto',
    )
    process.exit(1)
  }
  console.log(`[check:claim-provenance] ${t.motivo}`)
}

main()
