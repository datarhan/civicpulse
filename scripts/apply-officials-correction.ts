#!/usr/bin/env tsx
/**
 * roster-correction — la ÚNICA puerta de escritura de
 * `public/data/officials-corrections.json`, y la que recompone
 * `public/data/officials.json` cuando no se puede raspar.
 *
 *   npm run roster-correction -- --list
 *   npm run roster-correction -- --alta    --from-file editorial/alta-<slug>.json
 *   npm run roster-correction -- --baja    --from-file editorial/baja-<slug>.json
 *   npm run roster-correction -- --retirar <slug>
 *   npm run roster-correction -- --reply   --from-file editorial/replica-<slug>.json
 *   npm run roster-correction -- --apply
 *
 * Por qué un CLI y no «edítalo a mano por PR»: el fichero está en la lista
 * `CURATED` del gancho de escrituras curadas desde antes de existir, así que
 * una escritura directa se deniega —y tiene que ser así, porque nombra a
 * personas vivas—. El CLI re-valida el fichero ENTERO antes de escribir
 * (`writeSnapshot`), mueve el sello y deja en git una línea por acto:
 * `--retirar` es lo que se hace cuando la web del ayuntamiento se pone al día
 * y la corrección deja de corregir nada.
 *
 * `--apply` existe porque la página de la corporación contesta 403 desde el
 * 02-09-2026: sin raspado no hay nocturna que aplique la corrección, y el
 * padrón publicado seguiría nombrando a quien ya no está. Recompone el
 * publicado a partir de sus propias filas (`rawFromPublished`) y conserva el
 * sello del raspado, porque recomponer no es volver a raspar.
 *
 * El alta se añade ANTES que la baja que la nombra en `replacedBy`: el
 * validador exige que `replacedBy` sea un alta del mismo fichero.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { writeJsonFile, writeSnapshot } from './lib/snapshot-io'
import {
  addReplica,
  composeOfficialsSnapshot,
  rawFromPublished,
  retireCorrection,
  upsertCorrection,
  validateOfficialsCorrections,
  type Alta,
  type Baja,
  type OfficialsCorrections,
  type OfficialsSnapshot,
  type ReplicaPadron,
} from '../src/scraper/officials-corrections'

const CORRECTIONS = resolve('public/data/officials-corrections.json')
const OFFICIALS = resolve('public/data/officials.json')
/** Cómo lo nombra el fichero publicado, para que un lector pueda pedirlo. */
export const CORRECTIONS_PUBLIC_PATH = '/data/officials-corrections.json'
const MANDATE = '2023-2027'
const NOTE =
  'Correcciones curadas del padrón raspado de ribarroja.es: bajas y altas de ' +
  'concejales que el Pleno ya acordó y la página de la corporación aún no recoge. ' +
  'Cada entrada cita el acta literal y va firmada; se aplican en ' +
  'scripts/scrape-officials.ts y nunca las escribe la automatización. ' +
  'Una corrección que la web ya absorbió se retira, no se deja.'

function usage(): never {
  process.stderr.write(
    'Usage:\n' +
      '  npm run roster-correction -- --list\n' +
      '  npm run roster-correction -- --alta    --from-file <entrada.json>\n' +
      '  npm run roster-correction -- --baja    --from-file <entrada.json>\n' +
      '  npm run roster-correction -- --retirar <slug>\n' +
      '  npm run roster-correction -- --reply   --from-file <replica.json>\n' +
      '  npm run roster-correction -- --apply\n',
  )
  process.exit(2)
}

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}

const validateText = (s: string) => validateOfficialsCorrections(JSON.parse(s))

function vacio(): OfficialsCorrections {
  return {
    generatedAt: new Date().toISOString(),
    mandate: MANDATE,
    note: NOTE,
    bajas: [],
    altas: [],
    replicas: [],
  }
}

/** El fichero validado, o null si aún no existe. */
export function loadCorrections(): OfficialsCorrections | null {
  if (!existsSync(CORRECTIONS)) return null
  return validateText(readFileSync(CORRECTIONS, 'utf8'))
}

function save(snap: OfficialsCorrections): void {
  writeSnapshot(CORRECTIONS, snap, validateText)
  process.stdout.write(
    `[roster-correction] escrito ${CORRECTIONS} · ${snap.bajas.length} baja(s) · ` +
      `${snap.altas.length} alta(s) · ${snap.replicas.length} réplica(s)\n`,
  )
}

function entryFromFile<T extends object>(): T {
  const f = arg('from-file')
  if (!f) usage()
  const e = JSON.parse(readFileSync(resolve(f), 'utf8')) as T & { curatedAt?: string }
  // Una firma sin fecha se fecha hoy; una réplica no lleva firma y no se toca.
  if ('curatedBy' in e && !e.curatedAt) e.curatedAt = new Date().toISOString().slice(0, 10)
  return e
}

function list(snap: OfficialsCorrections | null): void {
  if (!snap) {
    process.stdout.write('[roster-correction] no hay fichero de correcciones\n')
    return
  }
  process.stdout.write(`officials-corrections · sello ${snap.generatedAt}\n`)
  for (const b of snap.bajas)
    process.stdout.write(
      `  [baja]  ${b.slug} · hasta ${b.until} · ${b.reason}` +
        (b.replacedBy ? ` · sustituye ${b.replacedBy}` : ' · escaño vacante') +
        ` · firmado ${b.curatedBy} ${b.curatedAt}\n`,
    )
  for (const a of snap.altas)
    process.stdout.write(
      `  [alta]  ${a.slug} · ${a.party} · desde ${a.since} · credencial ${a.credencial.emitidaPor} ` +
        `${a.credencial.fecha} · firmado ${a.curatedBy} ${a.curatedAt}\n`,
    )
  for (const r of snap.replicas)
    process.stdout.write(`  [réplica] ${r.oficial} · ${r.recibidaEl}\n`)
}

/** Recompone `officials.json` desde sus propias filas; devuelve el resumen. */
export function recompose(): OfficialsSnapshot {
  if (!existsSync(OFFICIALS)) throw new Error(`${OFFICIALS} no existe: raspa primero`)
  const published = JSON.parse(readFileSync(OFFICIALS, 'utf8')) as OfficialsSnapshot
  const raw = rawFromPublished(published)
  return composeOfficialsSnapshot(raw, loadCorrections(), {
    generatedAt: published.generatedAt,
    source: published.source,
    correctionsFile: CORRECTIONS_PUBLIC_PATH,
  })
}

function main(): void {
  const argv = process.argv.slice(2)
  if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) usage()

  if (argv.includes('--list')) {
    list(loadCorrections())
    return
  }
  if (argv.includes('--alta')) {
    save(upsertCorrection(loadCorrections() ?? vacio(), 'alta', entryFromFile<Alta>()))
    return
  }
  if (argv.includes('--baja')) {
    save(upsertCorrection(loadCorrections() ?? vacio(), 'baja', entryFromFile<Baja>()))
    return
  }
  if (argv.includes('--retirar')) {
    const slug = arg('retirar')
    if (!slug) usage()
    const snap = loadCorrections()
    if (!snap) {
      process.stderr.write('[roster-correction] no hay fichero de correcciones\n')
      process.exit(1)
    }
    save(retireCorrection(snap, slug))
    return
  }
  if (argv.includes('--reply')) {
    const snap = loadCorrections()
    if (!snap) {
      process.stderr.write('[roster-correction] no hay fichero de correcciones\n')
      process.exit(1)
    }
    save(addReplica(snap, entryFromFile<ReplicaPadron>()))
    return
  }
  if (argv.includes('--apply')) {
    const snap = recompose()
    writeJsonFile(OFFICIALS, snap)
    process.stdout.write(
      `[roster-correction] recompuesto ${OFFICIALS} · ${snap.count} vigentes · ` +
        `${snap.formerOfficials.length} cesado(s) · correcciones aplicadas: ` +
        `${snap.corrections ? `${snap.corrections.bajas} baja(s), ${snap.corrections.altas} alta(s)` : 'ninguna'}\n`,
    )
    return
  }
  usage()
}

// Protegido para que `recompose` y `loadCorrections` se puedan importar desde
// la guarda sin que el CLI corra contra public/data al importar.
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main()
  } catch (err) {
    process.stderr.write(`[roster-correction] ${(err as Error).message}\n`)
    process.exit(1)
  }
}
