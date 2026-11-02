#!/usr/bin/env tsx
/**
 * contract-correction — la ÚNICA puerta de escritura de
 * `public/data/contract-corrections.json`.
 *
 *   npm run contract-correction -- --list
 *   npm run contract-correction -- --add --from-file editorial/contrato-<id>.json
 *   npm run contract-correction -- --add-repeticion --from-file editorial/repeticion-<id>.json \
 *       --curator "<nombre>"
 *   npm run contract-correction -- --retirar <id>
 *
 * El fichero está en la lista `CURATED` del gancho de escrituras curadas: una
 * corrección pone un estado comprometido y una empresa con nombre junto a una
 * cifra, y eso lo firma una persona con el anuncio delante. Este CLI re-valida
 * el fichero ENTERO antes de escribir (`writeSnapshot`) y deja en git una
 * línea por acto. `--retirar` es lo que se hace cuando Gobierto se pone al día
 * y `check:contract-corrections` dice que la corrección sobra.
 *
 * `--add-repeticion` retira una fila que repite la adjudicación de otra. Quita
 * dinero de la cuenta de una adjudicataria con nombre, que puede ser una persona,
 * así que el borrador no trae firma: la pone `--curator` al añadirla, con la fecha
 * del día, y rechaza el hueco de la línea de uso (`rechazoDeMarcador`).
 *
 * No recompone `tenders.json`: la corrección la aplica la siguiente pasada de
 * `scrape:tenders`, y hasta entonces la guarda la da por pendiente.
 * Reglas y porqués: src/scraper/contract-corrections.ts.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { writeSnapshot } from './lib/snapshot-io'
import {
  validateContractCorrections,
  type ContractCorrections,
  type CorreccionContrato,
  type RepeticionContrato,
} from '../src/scraper/contract-corrections'
import { rechazarOpcionesDesconocidas } from '../src/scraper/opciones-cli'
import { rechazoDeMarcador } from '../src/scraper/firma-de-persona'

export const CORRECTIONS_PATH = resolve('public/data/contract-corrections.json')

const NOTE =
  'Correcciones curadas del registro de contratos de Gobierto (ribalicita): ' +
  'filas cuyo estado el registro publica mal y la Plataforma de Contratación ' +
  'tiene bien, y filas que repiten una adjudicación de otra. Cada entrada cita ' +
  'literalmente el anuncio que lo dice —en un estado, también el que explica la ' +
  'discrepancia— y va firmada; se aplican en scripts/scrape-tenders.ts y nunca ' +
  'las escribe la automatización. Una corrección que el registro ya absorbió se ' +
  'retira, no se deja.'

const validar = (json: string) => validateContractCorrections(JSON.parse(json))

export function loadContractCorrections(): ContractCorrections | null {
  if (!existsSync(CORRECTIONS_PATH)) return null
  return validar(readFileSync(CORRECTIONS_PATH, 'utf8'))
}

function usage(): never {
  console.log(
    'npm run contract-correction -- --list\n' +
      'npm run contract-correction -- --add --from-file <json con una CorreccionContrato>\n' +
      'npm run contract-correction -- --add-repeticion --from-file <json con una RepeticionContrato> --curator "<nombre>"\n' +
      'npm run contract-correction -- --retirar <id>',
  )
  process.exit(2)
}

function valorDe(argv: string[], opcion: string): string | undefined {
  const i = argv.indexOf(opcion)
  return i >= 0 ? argv[i + 1] : undefined
}

function main() {
  rechazarOpcionesDesconocidas('contract-correction', {
    banderas: ['--list', '--add', '--add-repeticion', '-h', '--help'],
    conValor: ['--retirar', '--from-file', '--curator'],
  })
  const argv = process.argv.slice(2)
  if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) usage()
  // Antes de leer nada: una orden copiada sin rellenar no firma.
  const curator = valorDe(argv, '--curator')
  if (argv.includes('--curator')) {
    const hueco = rechazoDeMarcador(curator ?? '')
    if (hueco) {
      console.error(`--curator: ${hueco}`)
      process.exit(2)
    }
  }

  const actual = loadContractCorrections() ?? { note: NOTE, corrections: [] }
  const repeticiones = actual.repeticiones ?? []

  if (argv.includes('--list')) {
    if (actual.corrections.length === 0) console.log('[contract-correction] ninguna corrección')
    for (const c of actual.corrections)
      console.log(
        `${c.id} · lote ${c.lote} · → ${c.status} · ${c.assignee} · firmada por ${c.curatedBy} el ${c.curatedAt}\n  ${c.motivo}`,
      )
    for (const r of repeticiones)
      console.log(
        `${r.id} · lote ${r.lote} · repite ${r.queda.id} · ${r.assignee} · firmada por ${r.curatedBy} el ${r.curatedAt}\n  ${r.motivo}`,
      )
    return
  }

  if (argv.includes('--add-repeticion')) {
    const desde = valorDe(argv, '--from-file')
    if (!desde || !curator) usage()
    const borrador = JSON.parse(readFileSync(resolve(desde), 'utf8')) as RepeticionContrato
    const nueva: RepeticionContrato = {
      ...borrador,
      curatedBy: curator,
      curatedAt: new Date().toISOString().slice(0, 10),
    }
    writeSnapshot(
      CORRECTIONS_PATH,
      { ...actual, note: NOTE, repeticiones: [...repeticiones, nueva] },
      validar,
    )
    console.log(
      `[contract-correction] añadida la repetición ${nueva.id} (lote ${nueva.lote}), queda ` +
        `${nueva.queda.id}; firmada por ${nueva.curatedBy}. La retira la siguiente pasada de ` +
        'scrape:tenders.',
    )
    return
  }

  if (argv.includes('--add')) {
    const desde = valorDe(argv, '--from-file')
    if (!desde) usage()
    const nueva = JSON.parse(readFileSync(resolve(desde), 'utf8')) as CorreccionContrato
    const siguiente: ContractCorrections = {
      note: actual.note || NOTE,
      corrections: [...actual.corrections, nueva],
    }
    writeSnapshot(CORRECTIONS_PATH, siguiente, validar)
    console.log(
      `[contract-correction] añadida ${nueva.id} (lote ${nueva.lote}) → ${nueva.status}. ` +
        'La aplica la siguiente pasada de scrape:tenders.',
    )
    return
  }

  const retirar = valorDe(argv, '--retirar')
  if (retirar) {
    const quedan = actual.corrections.filter((c) => c.id !== retirar)
    const quedanRepeticiones = repeticiones.filter((r) => r.id !== retirar)
    const quitadas =
      actual.corrections.length - quedan.length + repeticiones.length - quedanRepeticiones.length
    if (quitadas === 0) {
      console.error(`[contract-correction] no hay ninguna corrección con id ${retirar}`)
      process.exit(1)
    }
    if (quitadas > 1) {
      console.error(
        `[contract-correction] ${quitadas} entradas llevan el id ${retirar}: ninguna se retira`,
      )
      process.exit(1)
    }
    const siguiente: ContractCorrections = { ...actual, corrections: quedan }
    if (actual.repeticiones) siguiente.repeticiones = quedanRepeticiones
    writeSnapshot(CORRECTIONS_PATH, siguiente, validar)
    console.log(`[contract-correction] retirada ${retirar}`)
    return
  }
  usage()
}

// `scrape-tenders.ts` importa `loadContractCorrections`: al importar no se escribe nada.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
