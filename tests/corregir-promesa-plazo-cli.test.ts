/**
 * `corregir-promesa plazo` y `quitar-plazo`, lanzadas como en la terminal.
 *
 * Por subproceso, porque llaman a `process.exit()`. El script lee
 * `public/data/promises.json` desde su propia carpeta, así que se lanza una
 * copia desde una raíz temporal con una promesa de mentira (`conScript`, como
 * en firma-sin-rellenar-cli.test.ts): ninguna toca el `public/data/` del
 * repositorio, ni aunque una guarda fallara, y ninguna llega a la red —estas dos
 * vías no bajan nada—.
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { rechazoDeFirma, rechazoDeMarcador } from '../src/scraper/firma-de-persona'

const RAIZ = resolve(__dirname, '..')
const TSX = join(RAIZ, 'node_modules/tsx/dist/cli.mjs')
const SCRIPT = 'correct-promise.ts'

const ID = 'prueba-plazo-1'
const PERSONA = 'María de la Fuente Llorens'
const ROL = 'civicpulse-curator'
const MOTIVO = 'La nota del Ayuntamiento fija la convocatoria en septiembre de 2026.'
const FRAGMENTO = 'el próximo mes de septiembre'
const ILEGIBLE = '{ si esto se llega a leer, no es JSON'

const promesa = {
  id: ID,
  party: 'PSOE',
  title: 'Ayudas de prueba para rehabilitar fachadas',
  quote: 'El consistorio lanzará la convocatoria el próximo mes de septiembre.',
  source: { url: 'https://www.ribarroja.es/es/noticia/prueba', publisher: 'Ayuntamiento' },
  madeAt: '2026-08-25',
  topic: 'urbanismo',
  kind: 'anuncio-gobierno',
  status: 'documentada',
  evidence: [],
  createdAt: '2026-09-28',
  response: null,
}

const instantanea = (frozenUntil: string | null = null) =>
  JSON.stringify(
    {
      version: '1.0',
      generatedAt: '2026-10-01T00:00:00.000Z',
      frozenUntil,
      legalNotice: 'x'.repeat(100),
      contactUrl: 'https://x.test/issues',
      methodologyUrl: '/metodologia',
      items: [promesa],
    },
    null,
    2,
  ) + '\n'

/** Una raíz temporal con la copia del script, `src/` enlazado y estos datos. */
function montar(contenido: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'promesa-plazo-'))
  mkdirSync(join(dir, 'public/data'), { recursive: true })
  writeFileSync(join(dir, 'public/data/promises.json'), contenido)
  mkdirSync(join(dir, 'scripts'))
  copyFileSync(join(RAIZ, 'scripts', SCRIPT), join(dir, 'scripts', SCRIPT))
  symlinkSync(join(RAIZ, 'src'), join(dir, 'src'), 'dir')
  copyFileSync(join(RAIZ, 'package.json'), join(dir, 'package.json'))
  return dir
}

function limpiar(dir: string): void {
  try {
    if (lstatSync(join(dir, 'src')).isSymbolicLink()) unlinkSync(join(dir, 'src'))
  } catch {
    // No había enlace.
  }
  rmSync(dir, { recursive: true, force: true })
}

const lanzar = (dir: string, argv: string[]) =>
  spawnSync(process.execPath, [TSX, join(dir, 'scripts', SCRIPT), ...argv], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 60_000,
  })

const fichero = (dir: string) => readFileSync(join(dir, 'public/data/promises.json'), 'utf8')
const huella = (dir: string) => createHash('sha256').update(fichero(dir)).digest('hex')
const fila = (dir: string) => JSON.parse(fichero(dir)).items[0]

const fijar = (editor = PERSONA, ...mas: string[]) => [
  'plazo',
  ID,
  '2026-09',
  '--fuente',
  FRAGMENTO,
  '--motivo',
  MOTIVO,
  '--editor',
  editor,
  ...mas,
]
const quitar = (editor = ROL, ...mas: string[]) => [
  'quitar-plazo',
  ID,
  '--motivo',
  'El Ayuntamiento aplazó la convocatoria sin fecha nueva.',
  '--editor',
  editor,
  ...mas,
]

/** Ejecuta `argv` y devuelve el resultado y si el fichero cambió. */
function correr(contenido: string, argv: string[]) {
  const dir = montar(contenido)
  try {
    const antes = huella(dir)
    const r = lanzar(dir, argv)
    return {
      r,
      salida: r.stdout + r.stderr,
      cambio: huella(dir) !== antes,
      fila: contenido === ILEGIBLE ? null : fila(dir),
    }
  } finally {
    limpiar(dir)
  }
}

describe('corregir-promesa plazo', () => {
  it('fija el plazo de un mes en su último día, con fragmento, firma y motivo', () => {
    const { r, salida, cambio, fila: p } = correr(instantanea(), fijar())
    expect(r.status, salida).toBe(0)
    expect(cambio).toBe(true)
    expect(p.dueBy).toBe('2026-09-30')
    expect(p.dueBySource).toBe(FRAGMENTO)
    expect(p.dueByLog).toHaveLength(1)
    expect(p.dueByLog[0]).toMatchObject({
      from: null,
      to: { dueBy: '2026-09-30', dueBySource: FRAGMENTO, rule: 'fin-de-mes' },
      reason: MOTIVO,
      editor: PERSONA,
    })
    expect(salida).toMatch(/2026-09-30/)
    expect(salida).toMatch(/fin-de-mes/)
  })

  it('--dry-run dice lo que haría y no escribe nada', () => {
    const { r, salida, cambio, fila: p } = correr(instantanea(), fijar(PERSONA, '--dry-run'))
    expect(r.status, salida).toBe(0)
    expect(cambio).toBe(false)
    expect(p.dueBy).toBeUndefined()
    expect(salida).toMatch(/--dry-run/)
    expect(salida).toMatch(/2026-09-30/)
  })

  it('un fragmento que no está literal en la cita no escribe nada', () => {
    const argv = fijar()
    argv[4] = 'en el mes de septiembre que viene'
    const { r, salida, cambio } = correr(instantanea(), argv)
    expect(r.status, salida).toBe(1)
    expect(cambio).toBe(false)
    expect(salida).toMatch(/no está literal en la cita/)
  })

  it('una fecha que no es día ni mes no escribe nada', () => {
    const argv = fijar()
    argv[2] = 'septiembre'
    const { r, salida, cambio } = correr(instantanea(), argv)
    expect(r.status, salida).toBe(2)
    expect(cambio).toBe(false)
  })

  it('un motivo de menos de 20 caracteres no escribe nada', () => {
    const argv = fijar()
    argv[6] = 'corto'
    const { r, salida, cambio } = correr(instantanea(), argv)
    expect(r.status, salida).not.toBe(0)
    expect(cambio).toBe(false)
  })

  it('durante la veda electoral se niega y no escribe nada', () => {
    const { r, salida, cambio } = correr(instantanea('2099-01-01'), fijar())
    expect(r.status, salida).toBe(3)
    expect(cambio).toBe(false)
    expect(salida).toMatch(/LOREG/)
  })

  it('la cuenta de rol no fija un plazo: lo firma una persona, y se niega antes de leer nada', () => {
    const { r, salida } = correr(ILEGIBLE, fijar(ROL))
    expect(r.status, salida).toBe(2)
    expect(r.stderr).toContain(`--editor: ${rechazoDeFirma(ROL)}`)
  })

  it.each(['<nombre y apellidos>', 'undefined', 'null', 'Nombre Apellido', '…'])(
    'con «%s» se niega antes de leer nada',
    (hueco) => {
      const { r, salida } = correr(ILEGIBLE, fijar(hueco))
      expect(r.status, salida).toBe(2)
      expect(r.stderr).toContain('--editor: ')
    },
  )

  it('sin --fuente no corre', () => {
    const argv = fijar().filter((_, i) => i !== 3 && i !== 4)
    const { r, salida, cambio } = correr(instantanea(), argv)
    expect(r.status, salida).toBe(2)
    expect(cambio).toBe(false)
  })

  it('--editorial es de `cita`: con `plazo` se rechaza antes de leer nada', () => {
    const { r, salida } = correr(ILEGIBLE, fijar(PERSONA, '--editorial', 'Levante-EMV'))
    expect(r.status, salida).toBe(2)
    expect(r.stderr).toMatch(/opción desconocida: --editorial/)
  })

  it('--dryrun (errata) se rechaza antes de leer nada', () => {
    const { r, salida } = correr(ILEGIBLE, fijar(PERSONA, '--dryrun'))
    expect(r.status, salida).toBe(2)
    expect(r.stderr).toMatch(/opción desconocida: --dryrun/)
  })
})

describe('corregir-promesa quitar-plazo', () => {
  /** La instantánea con el plazo ya fijado por la propia CLI. */
  function conPlazo(): string {
    const dir = montar(instantanea())
    try {
      const r = lanzar(dir, fijar())
      expect(r.status, r.stdout + r.stderr).toBe(0)
      return fichero(dir)
    } finally {
      limpiar(dir)
    }
  }

  it('quita el plazo, firmado y razonado, y deja el rastro antes→después', () => {
    const { r, salida, cambio, fila: p } = correr(conPlazo(), quitar())
    expect(r.status, salida).toBe(0)
    expect(cambio).toBe(true)
    expect(p.dueBy).toBeUndefined()
    expect(p.dueBySource).toBeUndefined()
    expect(p.dueByLog).toHaveLength(2)
    expect(p.dueByLog[1]).toMatchObject({
      from: { dueBy: '2026-09-30', dueBySource: FRAGMENTO },
      to: null,
      editor: ROL,
    })
  })

  it('--dry-run no escribe nada', () => {
    const { r, salida, cambio } = correr(conPlazo(), quitar(ROL, '--dry-run'))
    expect(r.status, salida).toBe(0)
    expect(cambio).toBe(false)
  })

  it('con el hueco se niega antes de leer nada', () => {
    const { r, salida } = correr(ILEGIBLE, quitar('<nombre y apellidos>'))
    expect(r.status, salida).toBe(2)
    expect(r.stderr).toContain(`--editor: ${rechazoDeMarcador('<nombre y apellidos>')}`)
  })

  it('--fuente es de `plazo` y `cita`: con `quitar-plazo` se rechaza antes de leer nada', () => {
    const { r, salida } = correr(ILEGIBLE, quitar(ROL, '--fuente', FRAGMENTO))
    expect(r.status, salida).toBe(2)
    expect(r.stderr).toMatch(/opción desconocida: --fuente/)
  })

  it('una promesa sin plazo no tiene nada que quitar', () => {
    const { r, salida, cambio } = correr(instantanea(), quitar())
    expect(r.status, salida).toBe(1)
    expect(cambio).toBe(false)
    expect(salida).toMatch(/no tiene plazo/)
  })
})

describe('corregir-promesa retirar --dry-run', () => {
  it('no retira nada', () => {
    const { r, salida, cambio } = correr(instantanea(), [
      'retirar',
      ID,
      '--motivo',
      'Retirada de prueba: la fuente no recoge esas palabras como del partido.',
      '--editor',
      ROL,
      '--dry-run',
    ])
    expect(r.status, salida).toBe(0)
    expect(cambio).toBe(false)
    expect(salida).toMatch(/--dry-run/)
  })
})
