/**
 * Una firma sin rellenar no se publica.
 *
 * Las órdenes que compone la cola de excepción (src/scraper/finding-exception.ts)
 * traen `--editor "<nombre y apellidos>"`. Con el motivo relleno y la firma no,
 * `correct-pleno-finding --field/--redact/--remove`, `retract-finding` y
 * `reclassify-claim` escribían el hueco como firmante de una corrección
 * publicada (visto el 30-09-2026, en la sesión de la PR #210). `--amend-reason`
 * ya lo rechazaba, porque pide una persona.
 *
 * Estas tres vías no piden una persona: el operador las firma con la cuenta de
 * rol (`civicpulse-curator`, PRs #172, #198 y #203), y esa convención es suya.
 * Rechazan sólo el hueco, con un error que lo dice y antes de leer nada
 * (`rechazoDeMarcador`, src/scraper/firma-de-persona.ts).
 *
 * Se ejercitan por subproceso, como en la terminal: llaman a `process.exit()`.
 * `retract-finding` y `reclassify-claim` leen `public/data/` desde el
 * directorio de trabajo, así que corren sobre una copia en un directorio
 * temporal y escriben de verdad. `correct-pleno-finding` fija su raíz en el
 * repositorio: se ejercita con `--dry-run`, que valida el snapshot entero como
 * si fuera a escribir y no escribe.
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { MARCADORES } from '../src/scraper/finding-exception'

const RAIZ = resolve(__dirname, '..')
const TSX = join(RAIZ, 'node_modules/tsx/dist/cli.mjs')

/** El hueco de la orden preparada, tal cual lo compone la cola. */
const HUECO = MARCADORES.firma
/** La cuenta de rol con la que firma el operador, y una persona. */
const FIRMAS = ['civicpulse-curator', 'María de la Fuente Llorens']

const lanzar = (script: string, cwd: string, argv: string[]) =>
  spawnSync(process.execPath, [TSX, join(RAIZ, 'scripts', script), ...argv], {
    cwd,
    encoding: 'utf8',
  })

/** Un directorio temporal con estos ficheros bajo `public/data/`. */
function montar(prefijo: string, ficheros: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), prefijo))
  mkdirSync(join(dir, 'public/data'), { recursive: true })
  for (const [ruta, contenido] of Object.entries(ficheros)) {
    const destino = join(dir, 'public/data', ruta)
    mkdirSync(dirname(destino), { recursive: true })
    writeFileSync(destino, contenido)
  }
  return dir
}

/** Cada fichero bajo `public/data/` del directorio, con la huella de sus bytes. */
function huella(dir: string): Record<string, string> {
  const raiz = join(dir, 'public/data')
  const out: Record<string, string> = {}
  const recorrer = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) recorrer(p)
      else out[relative(raiz, p)] = createHash('sha256').update(readFileSync(p)).digest('hex')
    }
  }
  recorrer(raiz)
  return out
}

const leerJson = (dir: string, fichero: string) =>
  JSON.parse(readFileSync(join(dir, 'public/data', fichero), 'utf8'))

const datosDelRepositorio = (fichero: string) =>
  readFileSync(join(RAIZ, 'public/data', fichero), 'utf8')

describe('correct-pleno-finding · --field, --redact y --remove', () => {
  const HALLAZGOS = join(RAIZ, 'public/data/pleno-findings.json')
  // Una ficha con dos citas o más: quitarle la última la deja con cita.
  const ficha = (
    JSON.parse(readFileSync(HALLAZGOS, 'utf8')).items as { id: string; quotes: unknown[] }[]
  ).find((f) => f.quotes.length >= 2)
  const MOTIVO = 'Corrección de prueba: la ficha decía más de lo que sus fuentes sostienen.'
  const MODOS: [string, string[]][] = [
    ['--field', ['--field', 'title', '--new', 'Título corregido de una ficha de prueba']],
    [
      '--redact',
      [
        '--redact',
        'summary',
        '--new',
        'Un sumario reescrito para la prueba, más largo que un muñón, que nunca se escribe.',
      ],
    ],
    ['--remove', ['--remove', `quote.${(ficha?.quotes.length ?? 1) - 1}`]],
  ]

  it('hay una ficha publicada con dos citas o más', () => {
    // Si esto cae, los bloques de abajo dejan de medir lo que dicen.
    expect(ficha).toBeTruthy()
  })

  it.each(MODOS)('%s firmada con el hueco se niega, y no escribe', (_, modo) => {
    const antes = readFileSync(HALLAZGOS)
    const r = lanzar('correct-pleno-finding.ts', RAIZ, [
      ficha!.id,
      ...modo,
      '--reason',
      MOTIVO,
      '--editor',
      HUECO,
      '--dry-run',
    ])
    expect(r.status, r.stdout + r.stderr).toBe(2)
    expect(r.stderr).toContain('--editor')
    expect(r.stderr).toContain(HUECO)
    expect(readFileSync(HALLAZGOS).equals(antes)).toBe(true)
  })

  it('se niega antes de leer nada: ni siquiera busca la ficha', () => {
    // Sin --dry-run y con un id que no existe: si mirara la firma después de
    // leer el snapshot, contestaría que no hay tal ficha.
    const r = lanzar('correct-pleno-finding.ts', RAIZ, [
      'f-no-existe',
      '--field',
      'title',
      '--new',
      'Título corregido de una ficha de prueba',
      '--reason',
      MOTIVO,
      '--editor',
      HUECO,
    ])
    expect(r.status, r.stdout + r.stderr).toBe(2)
    expect(r.stderr).toContain(HUECO)
  })

  it.each(MODOS.flatMap(([nombre, modo]) => FIRMAS.map((firma) => [nombre, firma, modo] as const)))(
    '%s firmada «%s» pasa como antes',
    (_, firma, modo) => {
      const r = lanzar('correct-pleno-finding.ts', RAIZ, [
        ficha!.id,
        ...modo,
        '--reason',
        MOTIVO,
        '--editor',
        firma,
        '--dry-run',
      ])
      expect(r.status, r.stdout + r.stderr).toBe(0)
      expect(r.stdout).toContain(`"editor": "${firma}"`)
    },
  )
})

describe('retract-finding', () => {
  const HALLAZGOS = datosDelRepositorio('pleno-findings.json')
  const ID = (JSON.parse(HALLAZGOS).items as { id: string }[])[0]?.id
  const MOTIVO = 'Retirada de prueba: lo que deja la puerta editorial no sostiene la ficha.'
  const orden = (firma: string) => [ID, '--reason', MOTIVO, '--editor', firma]

  it('hay una ficha publicada que retirar', () => {
    expect(ID).toBeTruthy()
  })

  it('con el hueco se niega antes de leer nada', () => {
    // Un directorio sin datos: si llegara a leer, fallaría por otra cosa.
    const dir = montar('retract-firma-', {})
    try {
      const r = lanzar('retract-pleno-finding.ts', dir, orden(HUECO))
      expect(r.status, r.stdout + r.stderr).toBe(2)
      expect(r.stderr).toContain('--editor')
      expect(r.stderr).toContain(HUECO)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('con el hueco se niega y deja los datos byte a byte', () => {
    const dir = montar('retract-firma-', { 'pleno-findings.json': HALLAZGOS })
    try {
      const antes = huella(dir)
      const r = lanzar('retract-pleno-finding.ts', dir, orden(HUECO))
      expect(r.status, r.stdout + r.stderr).toBe(2)
      expect(r.stderr).toContain(HUECO)
      expect(huella(dir)).toEqual(antes)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it.each(FIRMAS)('firmada «%s», retira la ficha y el registro lleva esa firma', (firma) => {
    const dir = montar('retract-firma-', { 'pleno-findings.json': HALLAZGOS })
    try {
      const r = lanzar('retract-pleno-finding.ts', dir, orden(firma))
      expect(r.status, r.stdout + r.stderr).toBe(0)
      const snap = leerJson(dir, 'pleno-findings.json')
      expect(snap.items.some((f: { id: string }) => f.id === ID)).toBe(false)
      expect(snap.retractions.at(-1)).toMatchObject({ findingId: ID, editor: firma })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

/**
 * El corpus de declaraciones, reducido a una acusación publicada y lo que la
 * recomposición necesita de ella: la base y el publicado (la misma fila), el
 * sidecar vacío y la transcripción de su pleno, donde está su literal tal cual
 * —sin ella, la recomposición la tomaría por un corpus sin procedencia—.
 */
describe('reclassify-claim', () => {
  type Fila = { claim: { id: string; plenoId: string; type: string; verbatim: string } }
  const corpus = JSON.parse(datosDelRepositorio('pleno-claims-verified.json')) as {
    generatedAt: string
    source?: unknown
    items: Fila[]
  }
  const transcripcion = (f: Fila): string | null => {
    try {
      return datosDelRepositorio(`pleno-transcripts/${f.claim.plenoId}.txt`)
    } catch {
      return null
    }
  }
  const fila = corpus.items.find(
    (f) => f.claim.type === 'acusacion_publica' && transcripcion(f)?.includes(f.claim.verbatim),
  )
  const MOTIVO = 'Es una valoración política del grupo, no una acusación contra nadie.'
  const orden = (firma: string) => [
    fila!.claim.id,
    'valoracion_politica',
    '--reason',
    MOTIVO,
    '--editor',
    firma,
  ]

  const conDatos = () => {
    const snap = JSON.stringify(
      { generatedAt: corpus.generatedAt, source: corpus.source, items: [fila] },
      null,
      2,
    )
    return montar('reclas-firma-', {
      'pleno-claims-verified-base.json': snap + '\n',
      'pleno-claims-verified.json': snap + '\n',
      'pleno-claim-reclassifications.json':
        JSON.stringify({ version: 1, generatedAt: '', entries: {} }, null, 2) + '\n',
      [`pleno-transcripts/${fila!.claim.plenoId}.txt`]: transcripcion(fila!)!,
    })
  }

  it('hay una acusación publicada con su literal en la transcripción', () => {
    expect(fila).toBeTruthy()
  })

  it('con el hueco se niega antes de leer nada', () => {
    const dir = montar('reclas-firma-', {})
    try {
      const r = lanzar('reclassify-claim.ts', dir, orden(HUECO))
      expect(r.status, r.stdout + r.stderr).toBe(2)
      expect(r.stderr).toContain('--editor')
      expect(r.stderr).toContain(HUECO)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('con el hueco se niega y no toca ni el sidecar ni el corpus', () => {
    const dir = conDatos()
    try {
      const antes = huella(dir)
      const r = lanzar('reclassify-claim.ts', dir, orden(HUECO))
      expect(r.status, r.stdout + r.stderr).toBe(2)
      expect(r.stderr).toContain(HUECO)
      expect(huella(dir)).toEqual(antes)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it.each(FIRMAS)('firmada «%s», reclasifica y el sidecar lleva esa firma', (firma) => {
    const dir = conDatos()
    try {
      const r = lanzar('reclassify-claim.ts', dir, orden(firma))
      expect(r.status, r.stdout + r.stderr).toBe(0)
      expect(
        leerJson(dir, 'pleno-claim-reclassifications.json').entries[fila!.claim.id],
      ).toMatchObject({
        type: 'valoracion_politica',
        from: 'acusacion_publica',
        editor: firma,
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
