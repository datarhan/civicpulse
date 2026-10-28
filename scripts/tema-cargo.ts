#!/usr/bin/env tsx
/**
 * tema-cargo — la ÚNICA puerta de escritura de `public/data/temas-cargos.json`,
 * el vocabulario del buscador «¿A quién le pregunto por…?» de /cargos.
 *
 *   npm run tema-cargo -- --list
 *   npm run tema-cargo -- --add --from-file editorial/temas-cargos/<borrador>.json
 *   npm run tema-cargo -- --retirar <tema>
 *
 * `--from-file` trae una fila o una lista. Una fila con `cargo` va a `temas`;
 * una con `motivo`, a `sinAsignar`. El fichero está en la lista CURATED del
 * gancho de escrituras curadas (decisión D3): este CLI re-valida el fichero
 * ENTERO antes de escribir (`writeSnapshot`), mueve su `generatedAt` y deja en
 * git una línea por acto. Además se niega a apuntar un asunto a un área que hoy
 * no tiene nadie en officials.json: la página diría «no lo sabemos» desde el
 * primer día.
 *
 * Reglas y porqués: src/scraper/temas-cargos.ts.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { writeSnapshot } from './lib/snapshot-io'
import {
  temasSinTitular,
  validateTemasCargos,
  type EntradaDeTema,
  type TemasCargos,
  type TemaConCargo,
  type TemaSinAsignar,
} from '../src/scraper/temas-cargos'
import { rechazarOpcionesDesconocidas } from '../src/scraper/opciones-cli'

export const TEMAS_PATH = resolve('public/data/temas-cargos.json')
const OFFICIALS_PATH = resolve('public/data/officials.json')

const NOTE =
  'Vocabulario curado del buscador «¿A quién le pregunto por…?» de /cargos: qué área ' +
  'delegada corresponde a cada asunto de la vida diaria. Las áreas son las cadenas ' +
  'literales de la lista de cargos; quién tiene hoy cada una sale de esa lista, no ' +
  'de aquí, y este fichero no nombra a nadie. «literal» es cuando el área nombra el ' +
  'asunto con sus palabras; «editorial», cuando el salto lo damos nosotros, y va con ' +
  'su razón. Un asunto que ninguna área nombra va a sinAsignar con su motivo. Sólo ' +
  'lo escribe npm run tema-cargo.'

const FUENTE = {
  titulo: 'Corporación municipal · Ayuntamiento de Riba-roja de Túria',
  url: 'https://www.ribarroja.es/es/ayuntamiento/corporacion_municipal',
}

const validar = (json: string) => validateTemasCargos(JSON.parse(json))

function cargar(): TemasCargos {
  if (!existsSync(TEMAS_PATH))
    return {
      generatedAt: new Date().toISOString(),
      note: NOTE,
      fuente: FUENTE,
      temas: [],
      sinAsignar: [],
    }
  return validar(readFileSync(TEMAS_PATH, 'utf8'))
}

function lista(): { slug: string; portfolios?: string[] }[] {
  if (!existsSync(OFFICIALS_PATH)) {
    console.error(
      '[tema-cargo] falta public/data/officials.json: no hay con qué comprobar las áreas',
    )
    process.exit(1)
  }
  return JSON.parse(readFileSync(OFFICIALS_PATH, 'utf8')).officials ?? []
}

function usage(): never {
  console.log(
    'npm run tema-cargo -- --list\n' +
      'npm run tema-cargo -- --add --from-file <json con una fila o una lista>\n' +
      'npm run tema-cargo -- --retirar <tema>',
  )
  process.exit(2)
}

function valorDe(argv: string[], opcion: string): string | undefined {
  const i = argv.indexOf(opcion)
  return i >= 0 ? argv[i + 1] : undefined
}

const esConCargo = (e: EntradaDeTema): e is TemaConCargo => 'cargo' in e

function escribe(siguiente: TemasCargos): void {
  try {
    writeSnapshot(TEMAS_PATH, { ...siguiente, generatedAt: new Date().toISOString() }, validar)
  } catch (err) {
    console.error(`[tema-cargo] no se escribe nada: ${(err as Error).message}`)
    process.exit(1)
  }
}

function main() {
  rechazarOpcionesDesconocidas('tema-cargo', {
    banderas: ['--list', '--add', '-h', '--help'],
    conValor: ['--retirar', '--from-file'],
  })
  const argv = process.argv.slice(2)
  if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) usage()

  if (argv.includes('--list')) {
    const v = cargar()
    if (v.temas.length + v.sinAsignar.length === 0) console.log('[tema-cargo] ningún asunto')
    for (const t of v.temas)
      console.log(`${t.tema} → ${t.cargo} · ${t.confianza}\n  ${t.palabras.join(', ')}`)
    for (const t of v.sinAsignar) console.log(`${t.tema} → sin área\n  ${t.motivo}`)
    return
  }

  if (argv.includes('--add')) {
    const desde = valorDe(argv, '--from-file')
    if (!desde) usage()
    const leido = JSON.parse(readFileSync(resolve(desde), 'utf8')) as
      EntradaDeTema | EntradaDeTema[]
    const nuevas = Array.isArray(leido) ? leido : [leido]
    const actual = cargar()
    const siguiente: TemasCargos = {
      ...actual,
      note: actual.note || NOTE,
      fuente: actual.fuente ?? FUENTE,
      temas: [...actual.temas, ...nuevas.filter(esConCargo)],
      sinAsignar: [
        ...actual.sinAsignar,
        ...nuevas.filter((e): e is TemaSinAsignar => !esConCargo(e)),
      ],
    }
    // Antes de escribir: un asunto que apunta a un área que hoy no tiene nadie.
    const sinTitular = temasSinTitular({ ...siguiente, temas: nuevas.filter(esConCargo) }, lista())
    if (sinTitular.length > 0) {
      const areas = nuevas
        .filter((e) => esConCargo(e) && sinTitular.includes(e.tema))
        .map((e) => `«${e.tema}» → «${(e as TemaConCargo).cargo}»`)
      console.error(
        `[tema-cargo] no se escribe nada: ninguna persona de la lista de cargos tiene hoy ${areas.join(', ')}`,
      )
      process.exit(1)
    }
    escribe(siguiente)
    console.log(`[tema-cargo] añadidos ${nuevas.map((e) => e.tema).join(', ')}`)
    return
  }

  const retirar = valorDe(argv, '--retirar')
  if (retirar) {
    const actual = cargar()
    const temas = actual.temas.filter((t) => t.tema !== retirar)
    const sinAsignar = actual.sinAsignar.filter((t) => t.tema !== retirar)
    if (temas.length + sinAsignar.length === actual.temas.length + actual.sinAsignar.length) {
      console.error(`[tema-cargo] no hay ningún asunto «${retirar}»`)
      process.exit(1)
    }
    escribe({ ...actual, temas, sinAsignar })
    console.log(`[tema-cargo] retirado ${retirar}`)
    return
  }
  usage()
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
