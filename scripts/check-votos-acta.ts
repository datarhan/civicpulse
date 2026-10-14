#!/usr/bin/env tsx
/**
 * Coteja cada desglose por grupos publicado en `pleno-votes.json` contra la
 * votación de FONDO del acta de su sesión (`src/scraper/cotejo-votos-acta.ts`).
 *
 * Sólo informa: no escribe ningún fichero. Una contradicción la arregla una
 * persona con `npm run corregir-voto`, que deja constancia firmada; nada
 * automático reescribe un desglose publicado (CLAUDE.md, regla 4).
 *
 * Sale 1 cuando `resumenCotejo` falla: hay una contradicción, había actas y no
 * se pudo cotejar nada, o «no-encontrada» pasa del 20 % de lo evaluado. Un
 * cotejo que no evaluó nada no puede salir en verde (regla 2).
 *
 * Lee el texto de `.cache/pleno-actas/<plenoId>.txt`, que deja `scrape:pleno-actas`.
 *
 * Uso: npm run check:votos-acta
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseVotacionesActa, type VotacionActa } from '../src/scraper/acta-votos'
import { cotejarVoto, resumenCotejo, type Cotejo } from '../src/scraper/cotejo-votos-acta'
import { validateSnapshot } from '../src/scraper/pleno-votes'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')
const VOTOS = join(PROJECT_ROOT, 'public/data/pleno-votes.json')
const ACTAS = join(PROJECT_ROOT, 'public/data/pleno-actas.json')
const CACHE = join(PROJECT_ROOT, '.cache/pleno-actas')

function main(): number {
  const votos = validateSnapshot(JSON.parse(readFileSync(VOTOS, 'utf8')))
  if (!existsSync(ACTAS)) {
    console.error(`[votos-acta] falta ${ACTAS} — corre scrape:pleno-actas`)
    return 1
  }
  const indice = JSON.parse(readFileSync(ACTAS, 'utf8')) as { items?: Array<{ plenoId: string }> }
  const conActa = new Set((indice.items ?? []).map((a) => a.plenoId))

  const leidas = new Map<string, VotacionActa[] | 'sin-texto'>()
  const votacionesDe = (plenoId: string) => {
    if (!leidas.has(plenoId)) {
      const txt = join(CACHE, `${plenoId}.txt`)
      leidas.set(
        plenoId,
        existsSync(txt) ? parseVotacionesActa(readFileSync(txt, 'utf8')) : 'sin-texto',
      )
    }
    return leidas.get(plenoId)!
  }

  const cotejos: Cotejo[] = []
  let sinDesglose = 0
  for (const v of votos.items) {
    if (v.votes.length === 0) {
      sinDesglose += 1
      continue
    }
    if (!conActa.has(v.plenoId)) {
      cotejos.push(cotejarVoto(v, null))
      continue
    }
    const actas = votacionesDe(v.plenoId)
    cotejos.push(
      actas === 'sin-texto'
        ? {
            voteId: v.id,
            resultado: 'no-encontrada',
            detalle: 'texto no descargado — corre scrape:pleno-actas',
          }
        : cotejarVoto(v, actas),
    )
  }

  for (const c of cotejos) {
    if (c.resultado !== 'coincide')
      console.log(`${c.resultado.padEnd(13)} ${c.voteId}  ${c.detalle}`)
  }
  const r = resumenCotejo(cotejos)
  const cuenta = Object.entries(r.porResultado)
    .map(([k, n]) => `${k} ${n}`)
    .join(' · ')
  console.log(
    `[votos-acta] ${cotejos.length} desgloses publicados · evaluados ${r.evaluados} · ${cuenta}` +
      ` · sin desglose (no se cotejan) ${sinDesglose}`,
  )
  if (r.falla) {
    console.error(`[votos-acta] FALLA: ${r.motivo}`)
    return 1
  }
  console.log('[votos-acta] ok')
  return 0
}

process.exit(main())
