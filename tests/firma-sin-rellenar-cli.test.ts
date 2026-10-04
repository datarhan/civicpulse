/**
 * Una firma sin rellenar no se publica.
 *
 * Las órdenes que compone la cola de excepción (src/scraper/finding-exception.ts)
 * traen `--editor "<nombre y apellidos>"`. Con el motivo relleno y la firma no,
 * `correct-pleno-finding --field/--redact/--remove`, `retract-finding` y
 * `reclassify-claim` escribían el hueco como firmante de una corrección
 * publicada (visto el 30-09-2026, en la sesión de la PR #210), y la bajada de
 * siempre de `downgrade-verdict` también (04-10-2026). `--amend-reason` y las
 * otras dos vías de `downgrade-verdict` ya lo rechazaban, porque piden una
 * persona.
 *
 * Estas vías no piden una persona: el operador las firma con la cuenta de rol
 * (`civicpulse-curator`, PRs #172, #198 y #203), y esa convención es suya.
 * Rechazan sólo el hueco, con un error que lo dice y antes de leer nada
 * (`rechazoDeMarcador`, src/scraper/firma-de-persona.ts).
 *
 * Se ejercitan por subproceso, como en la terminal: llaman a `process.exit()`.
 * Todas corren sobre una copia de los datos en un directorio temporal y
 * escriben de verdad; ninguna toca `public/data/` del repositorio, ni aunque la
 * guarda fallara. `retract-finding`, `reclassify-claim` y `downgrade-verdict`
 * leen `public/data/` desde el directorio de trabajo; `correct-pleno-finding`
 * lo lee desde la carpeta de su script, así que se lanza una copia del script
 * desde una raíz temporal (`conScript`).
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { MARCADORES } from '../src/scraper/finding-exception'

const RAIZ = resolve(__dirname, '..')
const TSX = join(RAIZ, 'node_modules/tsx/dist/cli.mjs')

/** El hueco de la orden preparada, tal cual lo compone la cola. */
const HUECO = MARCADORES.firma
/**
 * Un hueco por regla de la guarda —el de la cola, que casa con dos; uno que sólo
 * delatan los `< >`; uno que sólo delata la palabra; uno sin letras—, para que
 * una CLI que se quedara con una comprobación propia y parcial no pase.
 */
const HUECOS = [HUECO, '<editor>', 'Nombre Apellido', '…']
/** La cuenta de rol con la que firma el operador, y una persona. */
const FIRMAS = ['civicpulse-curator', 'María de la Fuente Llorens']

/** Lanza un script del repositorio con `cwd` como directorio de trabajo. */
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

/**
 * Hace de `dir` la raíz de una copia del script, para los que leen sus datos
 * desde la carpeta del script y no desde el directorio de trabajo. Una copia y
 * no un enlace: Node resuelve el módulo principal por su ruta real. `src/` sí
 * se enlaza, y `package.json` se copia por su `"type": "module"`.
 */
function conScript(dir: string, script: string): string {
  mkdirSync(join(dir, 'scripts'))
  copyFileSync(join(RAIZ, 'scripts', script), join(dir, 'scripts', script))
  symlinkSync(join(RAIZ, 'src'), join(dir, 'src'), 'dir')
  copyFileSync(join(RAIZ, 'package.json'), join(dir, 'package.json'))
  return join(dir, 'scripts', script)
}

/** Borra el directorio temporal; antes, el enlace a `src/`, por si acaso. */
function limpiar(dir: string): void {
  try {
    if (lstatSync(join(dir, 'src')).isSymbolicLink()) unlinkSync(join(dir, 'src'))
  } catch {
    // No había enlace.
  }
  rmSync(dir, { recursive: true, force: true })
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
  const HALLAZGOS = datosDelRepositorio('pleno-findings.json')
  type Ficha = { id: string; quotes: unknown[]; corrections?: { field: string }[] }
  // Una ficha con dos citas o más: quitarle la última la deja con cita.
  const ficha = (JSON.parse(HALLAZGOS).items as Ficha[]).find((f) => f.quotes.length >= 2)
  const ultima = `quote.${(ficha?.quotes.length ?? 1) - 1}`
  const MOTIVO = 'Corrección de prueba: la ficha decía más de lo que sus fuentes sostienen.'
  /** Vía, campo que queda en la bitácora y argumentos. */
  const MODOS: [string, string, string[]][] = [
    ['--field', 'title', ['--field', 'title', '--new', 'Título corregido de una ficha de prueba']],
    [
      '--redact',
      'summary',
      [
        '--redact',
        'summary',
        '--new',
        'Un sumario reescrito para la prueba, más largo que un muñón, que nunca se publica.',
      ],
    ],
    ['--remove', ultima, ['--remove', ultima]],
  ]
  const SCRIPT = 'correct-pleno-finding.ts'
  const orden = (modo: string[], firma: string) => [
    ficha!.id,
    ...modo,
    '--reason',
    MOTIVO,
    '--editor',
    firma,
  ]
  const lanzarEn = (dir: string, argv: string[]) =>
    spawnSync(process.execPath, [TSX, conScript(dir, SCRIPT), ...argv], {
      cwd: dir,
      encoding: 'utf8',
    })

  it('hay una ficha publicada con dos citas o más', () => {
    // Si esto cae, los bloques de abajo dejan de medir lo que dicen.
    expect(ficha).toBeTruthy()
  })

  it.each(HUECOS)('con «%s» se niega antes de leer nada', (hueco) => {
    // Una raíz sin datos: si llegara a leer, fallaría por otra cosa.
    const dir = montar('correct-firma-', {})
    try {
      const r = lanzarEn(dir, orden(MODOS[0][2], hueco))
      expect(r.status, r.stdout + r.stderr).toBe(2)
      expect(r.stderr).toContain('--editor')
      expect(r.stderr).toContain(hueco)
    } finally {
      limpiar(dir)
    }
  })

  it.each(MODOS)('%s firmada con el hueco se niega y deja los datos byte a byte', (_, __, modo) => {
    const dir = montar('correct-firma-', { 'pleno-findings.json': HALLAZGOS })
    try {
      const antes = huella(dir)
      const r = lanzarEn(dir, orden(modo, HUECO))
      expect(r.status, r.stdout + r.stderr).toBe(2)
      expect(r.stderr).toContain(HUECO)
      expect(huella(dir)).toEqual(antes)
    } finally {
      limpiar(dir)
    }
  })

  it.each(
    MODOS.flatMap(([via, campo, modo]) =>
      FIRMAS.map((firma) => [via, firma, campo, modo] as const),
    ),
  )('%s firmada «%s» escribe la corrección con esa firma', (_, firma, campo, modo) => {
    const dir = montar('correct-firma-', { 'pleno-findings.json': HALLAZGOS })
    try {
      const r = lanzarEn(dir, orden(modo, firma))
      expect(r.status, r.stdout + r.stderr).toBe(0)
      const escrita = (leerJson(dir, 'pleno-findings.json').items as Ficha[]).find(
        (f) => f.id === ficha!.id,
      )
      expect(escrita?.corrections?.at(-1)).toMatchObject({ field: campo, editor: firma })
    } finally {
      limpiar(dir)
    }
  })
})

describe('retract-finding', () => {
  const HALLAZGOS = datosDelRepositorio('pleno-findings.json')
  const ID = (JSON.parse(HALLAZGOS).items as { id: string }[])[0]?.id
  const MOTIVO = 'Retirada de prueba: lo que deja la puerta editorial no sostiene la ficha.'
  const orden = (firma: string) => [ID, '--reason', MOTIVO, '--editor', firma]

  it('hay una ficha publicada que retirar', () => {
    expect(ID).toBeTruthy()
  })

  it.each(HUECOS)('con «%s» se niega antes de leer nada', (hueco) => {
    // Un directorio sin datos: si llegara a leer, fallaría por otra cosa.
    const dir = montar('retract-firma-', {})
    try {
      const r = lanzar('retract-pleno-finding.ts', dir, orden(hueco))
      expect(r.status, r.stdout + r.stderr).toBe(2)
      expect(r.stderr).toContain('--editor')
      expect(r.stderr).toContain(hueco)
    } finally {
      limpiar(dir)
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
      limpiar(dir)
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
      limpiar(dir)
    }
  })
})

/**
 * El corpus de declaraciones, reducido a una fila publicada y lo que la
 * recomposición necesita de ella: la base y el publicado (la misma fila), el
 * fichero que escribe la CLI, vacío, y la transcripción de su pleno, donde está
 * su literal tal cual —sin ella, la recomposición la tomaría por un corpus sin
 * procedencia—.
 */
type Fila = {
  claim: { id: string; plenoId: string; type: string; verbatim: string }
  verification: { verdict: string }
}
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
const filaCon = (cumple: (f: Fila) => boolean) =>
  corpus.items.find((f) => cumple(f) && transcripcion(f)?.includes(f.claim.verbatim))

function corpusDeUnaFila(prefijo: string, fila: Fila, fichero: string): string {
  const snap = JSON.stringify(
    { generatedAt: corpus.generatedAt, source: corpus.source, items: [fila] },
    null,
    2,
  )
  return montar(prefijo, {
    'pleno-claims-verified-base.json': snap + '\n',
    'pleno-claims-verified.json': snap + '\n',
    [fichero]: JSON.stringify({ version: 1, generatedAt: '', entries: {} }, null, 2) + '\n',
    [`pleno-transcripts/${fila.claim.plenoId}.txt`]: transcripcion(fila)!,
  })
}

describe('reclassify-claim', () => {
  const fila = filaCon((f) => f.claim.type === 'acusacion_publica')
  const MOTIVO = 'Es una valoración política del grupo, no una acusación contra nadie.'
  const orden = (firma: string) => [
    fila!.claim.id,
    'valoracion_politica',
    '--reason',
    MOTIVO,
    '--editor',
    firma,
  ]
  const conDatos = () =>
    corpusDeUnaFila('reclas-firma-', fila!, 'pleno-claim-reclassifications.json')

  it('hay una acusación publicada con su literal en la transcripción', () => {
    expect(fila).toBeTruthy()
  })

  it.each(HUECOS)('con «%s» se niega antes de leer nada', (hueco) => {
    const dir = montar('reclas-firma-', {})
    try {
      const r = lanzar('reclassify-claim.ts', dir, orden(hueco))
      expect(r.status, r.stdout + r.stderr).toBe(2)
      expect(r.stderr).toContain('--editor')
      expect(r.stderr).toContain(hueco)
    } finally {
      limpiar(dir)
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
      limpiar(dir)
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
      limpiar(dir)
    }
  })
})

/**
 * La bajada de siempre, sin `--amend-reason` ni `--literal-no-dicho`: esas dos
 * ya piden una persona; ésta la firma el operador —sin --editor, «curator»— y
 * escribía el hueco en el overlay, que se sirve.
 */
describe('downgrade-verdict · la bajada de siempre', () => {
  const fila = filaCon((f) => f.verification.verdict === 'parcial')
  const MOTIVO = 'La evidencia citada no sostiene la afirmación: sólo comparte una palabra.'
  const orden = (firma: string) => [
    fila!.claim.id,
    'sin-datos',
    '--reason',
    MOTIVO,
    '--editor',
    firma,
  ]
  const conDatos = () => corpusDeUnaFila('downgrade-firma-', fila!, 'pleno-claims-overlay.json')

  it('hay una declaración publicada en parcial con su literal en la transcripción', () => {
    expect(fila).toBeTruthy()
  })

  it.each(HUECOS)('con «%s» se niega antes de leer nada', (hueco) => {
    const dir = montar('downgrade-firma-', {})
    try {
      const r = lanzar('downgrade-verdict.ts', dir, orden(hueco))
      expect(r.status, r.stdout + r.stderr).toBe(2)
      expect(r.stderr).toContain('--editor')
      expect(r.stderr).toContain(hueco)
    } finally {
      limpiar(dir)
    }
  })

  it('con el hueco se niega y no toca ni el overlay ni el corpus', () => {
    const dir = conDatos()
    try {
      const antes = huella(dir)
      const r = lanzar('downgrade-verdict.ts', dir, orden(HUECO))
      expect(r.status, r.stdout + r.stderr).toBe(2)
      expect(r.stderr).toContain(HUECO)
      expect(huella(dir)).toEqual(antes)
    } finally {
      limpiar(dir)
    }
  })

  it.each(FIRMAS)('firmada «%s», baja el veredicto y el overlay lleva esa firma', (firma) => {
    const dir = conDatos()
    try {
      const r = lanzar('downgrade-verdict.ts', dir, orden(firma))
      expect(r.status, r.stdout + r.stderr).toBe(0)
      expect(leerJson(dir, 'pleno-claims-overlay.json').entries[fila!.claim.id]).toMatchObject({
        source: 'curator-downgrade',
        editor: firma,
      })
    } finally {
      limpiar(dir)
    }
  })
})
