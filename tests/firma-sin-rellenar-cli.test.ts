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
 * Desde el 05-10-2026, la misma guarda en el resto de vías que escriben una
 * firma. Tres reciben el hueco de quien les compone la orden: `reanchor-claim`,
 * el `<tu nombre>` de su cola (src/scraper/claim-reanchor.ts); `retract-vote`,
 * el `"…"` con que el validador de pleno-votes.ts pide devolver un voto
 * retirado; y `review:finding-exception`, el `--reviewer` de la cola de
 * excepción —escribe en editorial/ y no publica nada, pero una «keep» firmada
 * con el hueco saca la ficha de la cola como si alguien la hubiera leído—. Las
 * otras seis lo traen de su propia línea de uso, que es de donde se copia una
 * orden que nadie compone, y se prueban con ese hueco: `correct-press-finding`,
 * `corregir-promesa`, `correct-indicador`, `retract-indicador`,
 * `correct-journalist-report` y `repoint-source-url`. Ésta última no guarda la
 * firma —sólo la imprime—, y aun así no corre una orden que nadie terminó de
 * escribir.
 *
 * Se ejercitan por subproceso, como en la terminal: llaman a `process.exit()`.
 * Todas corren sobre una copia de los datos en un directorio temporal y
 * escriben de verdad; ninguna toca `public/data/` del repositorio, ni aunque la
 * guarda fallara, y ninguna llega a la red: `corregir-promesa cita` y
 * `repoint-source-url` bajan documentos después de leer, y sus casos se paran
 * antes. `correct-pleno-finding`, `correct-press-finding` y `corregir-promesa`
 * leen sus datos desde la carpeta de su script, así que se lanza una copia del
 * script desde una raíz temporal (`conScript`); las demás, desde el directorio
 * de trabajo.
 */
import { createHash } from 'node:crypto'
import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
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

import { buildClaimReanchorQueue } from '../src/scraper/claim-reanchor'
import { MARCADORES } from '../src/scraper/finding-exception'
import { rechazoDeMarcador } from '../src/scraper/firma-de-persona'
import {
  findLiveRetraction,
  isLiveRetraction,
  retractVoteRecord,
  RETRACTION_SCOPES,
  validateSnapshot,
} from '../src/scraper/pleno-votes'
import { quoteAppearsIn, quoteCoverage } from '../src/scraper/quote-match'
import { archivosDe } from '../src/scraper/superseded-archive'

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

/** Lanza una copia del script desde la raíz temporal `dir` (ver `conScript`). */
const lanzarCopia = (script: string, dir: string, argv: string[]) =>
  spawnSync(process.execPath, [TSX, conScript(dir, script), ...argv], {
    cwd: dir,
    encoding: 'utf8',
  })

/** Borra el directorio temporal; antes, el enlace a `src/`, por si acaso. */
function limpiar(dir: string): void {
  try {
    if (lstatSync(join(dir, 'src')).isSymbolicLink()) unlinkSync(join(dir, 'src'))
  } catch {
    // No había enlace.
  }
  rmSync(dir, { recursive: true, force: true })
}

/**
 * Cada fichero que estas vías pueden escribir —bajo `public/data/` y, la de la
 * cola de excepción, bajo `editorial/`—, con la huella de sus bytes. Uno que
 * aparece también cambia la huella.
 */
function huella(dir: string): Record<string, string> {
  const out: Record<string, string> = {}
  const recorrer = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) recorrer(p)
      else out[relative(dir, p)] = createHash('sha256').update(readFileSync(p)).digest('hex')
    }
  }
  for (const sub of ['public/data', 'editorial']) {
    if (existsSync(join(dir, sub))) recorrer(join(dir, sub))
  }
  return out
}

const leerJson = (dir: string, fichero: string) =>
  JSON.parse(readFileSync(join(dir, 'public/data', fichero), 'utf8'))

const datosDelRepositorio = (fichero: string) =>
  readFileSync(join(RAIZ, 'public/data', fichero), 'utf8')

/** El hueco que trae una orden ya compuesta para esta bandera: de `--editor "…"`, `…`. */
const huecoEnLaOrden = (orden: string, bandera = '--editor') =>
  new RegExp(`${bandera} "([^"]*)"`).exec(orden)?.[1]

/**
 * El hueco que enseña la línea de uso de la propia CLI, que es de donde se
 * copia una orden que ninguna cola compone. Se lanza sin argumentos sobre estos
 * datos —casi todas imprimen el uso antes de leer nada; la de la cola de
 * excepción, después—.
 */
function huecoDeSuUso(
  script: string,
  bandera = '--editor',
  ficheros: Record<string, string> = {},
): string | undefined {
  const dir = montar('uso-', ficheros)
  try {
    const r = lanzar(script, dir, [])
    return huecoEnLaOrden(r.stdout + r.stderr, bandera)
  } finally {
    limpiar(dir)
  }
}

/**
 * Se negó por el hueco y con el mensaje de la guarda común
 * (`rechazoDeMarcador`): una CLI que se quedara con una comprobación propia y
 * parcial no pasa.
 */
function seNegoPorElHueco(r: SpawnSyncReturns<string>, bandera: string, hueco: string): void {
  expect(r.status, r.stdout + r.stderr).toBe(2)
  expect(r.stderr).toContain(`${bandera}: ${rechazoDeMarcador(hueco)}`)
}

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
  claim: {
    id: string
    plenoId: string
    type: string
    verbatim: string
    speakerGroup?: string | null
  }
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

/**
 * Las transcripciones de una sesión que lee `reanchor-claim` —la vigente y las
 * sustituidas—, por su ruta bajo `public/data/`.
 */
function transcripcionesDe(plenoId: string): Record<string, string> {
  const out: Record<string, string> = {}
  const vigente = `pleno-transcripts/${plenoId}.txt`
  if (existsSync(join(RAIZ, 'public/data', vigente))) out[vigente] = datosDelRepositorio(vigente)
  const sustituidas = 'pleno-transcripts/superseded'
  for (const nombre of archivosDe(readdirSync(join(RAIZ, 'public/data', sustituidas)), plenoId)) {
    out[`${sustituidas}/${nombre}`] = datosDelRepositorio(`${sustituidas}/${nombre}`)
  }
  return out
}

function corpusDeUnaFila(
  prefijo: string,
  fila: Fila,
  fichero: string,
  transcripciones: Record<string, string> = {
    [`pleno-transcripts/${fila.claim.plenoId}.txt`]: transcripcion(fila)!,
  },
): string {
  const snap = JSON.stringify(
    { generatedAt: corpus.generatedAt, source: corpus.source, items: [fila] },
    null,
    2,
  )
  return montar(prefijo, {
    'pleno-claims-verified-base.json': snap + '\n',
    'pleno-claims-verified.json': snap + '\n',
    [fichero]: JSON.stringify({ version: 1, generatedAt: '', entries: {} }, null, 2) + '\n',
    ...transcripciones,
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

/**
 * El reanclaje de una declaración. Su cola (src/scraper/claim-reanchor.ts)
 * compone `--editor "<tu nombre>"`, y la firma acaba en
 * pleno-claim-reanchors.json, que se sirve.
 *
 * El caso verde repite un reanclaje de verdad: el corpus de una fila con el
 * literal que tenía antes (`from`), las transcripciones de su sesión que lee la
 * CLI, y la orden con el literal que se ancló. Se elige con los emparejadores
 * de la CLI, no con unos propios.
 */
describe('reanchor-claim', () => {
  const SCRIPT = 'reanchor-claim.ts'
  const MOTIVO = 'El extractor recortó la frase del acta; éste es el pasaje tal cual consta.'
  const HUECO_DE_LA_COLA = huecoEnLaOrden(
    buildClaimReanchorQueue(
      [{ claim: { id: 'p-001-afi-aaa', plenoId: 'p', verbatim: 'una cita cualquiera del pleno' } }],
      new Set(['p-001-afi-aaa']),
      new Map(),
      { generatedAt: '' },
    ).rows[0]?.correctionCommand ?? '',
  )
  const reanclajes = JSON.parse(datosDelRepositorio('pleno-claim-reanchors.json')) as {
    entries: Record<string, { verbatim: string; from: string }>
  }
  const repeticion = Object.entries(reanclajes.entries)
    .map(([id, e]) => {
      const fila = corpus.items.find((f) => f.claim.id === id)
      return { e, fila, textos: fila ? transcripcionesDe(fila.claim.plenoId) : {} }
    })
    .find(({ e, fila, textos }) => {
      const t = Object.values(textos)
      return (
        fila != null &&
        fila.claim.speakerGroup == null &&
        !t.some((x) => quoteAppearsIn(e.from, x)) &&
        t.some((x) => quoteCoverage(e.verbatim, x) === 1)
      )
    })
  const orden = (firma: string) => [
    repeticion!.fila!.claim.id,
    '--verbatim',
    repeticion!.e.verbatim,
    '--reason',
    MOTIVO,
    '--editor',
    firma,
  ]
  /** El estado de antes del reanclaje: la fila con su literal viejo y el sidecar vacío. */
  const conDatos = () => {
    const { e, fila, textos } = repeticion!
    return corpusDeUnaFila(
      'reanchor-firma-',
      { ...fila!, claim: { ...fila!.claim, verbatim: e.from } },
      'pleno-claim-reanchors.json',
      textos,
    )
  }

  it('la cola compone la orden con la firma por rellenar', () => {
    expect(HUECO_DE_LA_COLA).toBeDefined()
    expect(rechazoDeMarcador(HUECO_DE_LA_COLA!)).not.toBeNull()
  })

  it('hay un reanclaje publicado que se puede repetir', () => {
    // Su declaración sin bloc, su literal de antes sin procedencia en ninguna
    // transcripción de la sesión, y el anclado, entero en una de ellas.
    expect(repeticion).toBeTruthy()
  })

  it.each(HUECOS)('con «%s» se niega antes de leer nada', (hueco) => {
    // Un directorio sin datos: si llegara a leer, fallaría por otra cosa.
    const dir = montar('reanchor-firma-', {})
    try {
      seNegoPorElHueco(lanzar(SCRIPT, dir, orden(hueco)), '--editor', hueco)
    } finally {
      limpiar(dir)
    }
  })

  it('con la firma de la cola se niega y no toca ni el sidecar ni el corpus', () => {
    const dir = conDatos()
    try {
      const antes = huella(dir)
      const r = lanzar(SCRIPT, dir, orden(HUECO_DE_LA_COLA!))
      seNegoPorElHueco(r, '--editor', HUECO_DE_LA_COLA!)
      expect(huella(dir)).toEqual(antes)
    } finally {
      limpiar(dir)
    }
  })

  it.each(FIRMAS)('firmada «%s», reancla y el sidecar lleva esa firma', (firma) => {
    const dir = conDatos()
    try {
      const r = lanzar(SCRIPT, dir, orden(firma))
      expect(r.status, r.stdout + r.stderr).toBe(0)
      const { e, fila } = repeticion!
      expect(leerJson(dir, 'pleno-claim-reanchors.json').entries[fila!.claim.id]).toMatchObject({
        verbatim: e.verbatim,
        from: e.from,
        editor: firma,
      })
      // Y la recomposición lo publicó: el corpus ya dice el literal anclado.
      expect(leerJson(dir, 'pleno-claims-verified.json').items[0].claim.verbatim).toBe(e.verbatim)
    } finally {
      limpiar(dir)
    }
  })
})

/**
 * La retirada de una votación. Cuando un voto retirado vuelve a `items[]`, el
 * validador de pleno-votes.ts compone la orden que lo devuelve,
 * `--unretract --reason "…" --editor "…"`; con el motivo relleno y la firma
 * no, la revocación quedaba firmada por el hueco en pleno-votes.json, que se
 * sirve. Lee `public/data/` desde el directorio de trabajo.
 */
describe('retract-vote', () => {
  const SCRIPT = 'retract-pleno-vote.ts'
  const VOTOS = datosDelRepositorio('pleno-votes.json')
  const snap = validateSnapshot(JSON.parse(VOTOS))
  const MOTIVO = 'Retirada de prueba: la fuente citada no publica el resultado de esta votación.'
  /** Un voto publicado sin ninguna retirada en vigor: se puede retirar entero. */
  const libre = snap.items.find((v) =>
    RETRACTION_SCOPES.every((s) => !findLiveRetraction(snap, v.id, s)),
  )
  /** Una retirada entera en vigor: se puede levantar. */
  const viva = snap.retractions.find((r) => r.scope === 'record' && isLiveRetraction(r))
  /**
   * La orden del validador, tal cual la compone: se retira `libre` en memoria,
   * se vuelve a publicar y se lee lo que pide para devolverlo.
   */
  const ORDEN_DEL_VALIDADOR = (() => {
    if (!libre) return ''
    const retirado = retractVoteRecord(snap, libre.id, {
      reason: MOTIVO,
      editor: FIRMAS[0],
      at: '2026-10-05T00:00:00.000Z',
    })
    try {
      validateSnapshot({ ...retirado, items: [...retirado.items, libre] })
      return ''
    } catch (err) {
      return (err as Error).message
    }
  })()
  const HUECO_DEL_VALIDADOR = huecoEnLaOrden(ORDEN_DEL_VALIDADOR)
  const retirar = (firma: string) => [libre!.id, '--reason', MOTIVO, '--editor', firma]
  const levantar = (firma: string) => [
    viva!.voteId,
    '--unretract',
    '--reason',
    MOTIVO,
    '--editor',
    firma,
  ]

  it('hay un voto sin retirar y una retirada entera en vigor', () => {
    expect(libre).toBeTruthy()
    expect(viva).toBeTruthy()
  })

  it('el validador compone la orden de vuelta con la firma por rellenar', () => {
    expect(ORDEN_DEL_VALIDADOR).toContain('--unretract')
    expect(HUECO_DEL_VALIDADOR).toBeDefined()
    expect(rechazoDeMarcador(HUECO_DEL_VALIDADOR!)).not.toBeNull()
  })

  it.each(HUECOS)('con «%s» se niega antes de leer nada', (hueco) => {
    const dir = montar('votos-firma-', {})
    try {
      seNegoPorElHueco(lanzar(SCRIPT, dir, retirar(hueco)), '--editor', hueco)
    } finally {
      limpiar(dir)
    }
  })

  it('la orden del validador, con el motivo relleno y la firma no, se niega y deja los datos byte a byte', () => {
    const dir = montar('votos-firma-', { 'pleno-votes.json': VOTOS })
    try {
      const antes = huella(dir)
      const r = lanzar(SCRIPT, dir, levantar(HUECO_DEL_VALIDADOR!))
      seNegoPorElHueco(r, '--editor', HUECO_DEL_VALIDADOR!)
      expect(huella(dir)).toEqual(antes)
    } finally {
      limpiar(dir)
    }
  })

  it.each(FIRMAS)(
    'firmada «%s», retira la votación entera y el registro lleva esa firma',
    (firma) => {
      const dir = montar('votos-firma-', { 'pleno-votes.json': VOTOS })
      try {
        const r = lanzar(SCRIPT, dir, retirar(firma))
        expect(r.status, r.stdout + r.stderr).toBe(0)
        const escrito = leerJson(dir, 'pleno-votes.json')
        expect(escrito.items.some((v: { id: string }) => v.id === libre!.id)).toBe(false)
        expect(escrito.retractions.at(-1)).toMatchObject({
          voteId: libre!.id,
          scope: 'record',
          editor: firma,
        })
      } finally {
        limpiar(dir)
      }
    },
  )

  it.each(FIRMAS)('firmada «%s», levanta una retirada y la revocación lleva esa firma', (firma) => {
    const dir = montar('votos-firma-', { 'pleno-votes.json': VOTOS })
    try {
      const r = lanzar(SCRIPT, dir, levantar(firma))
      expect(r.status, r.stdout + r.stderr).toBe(0)
      const entrada = leerJson(dir, 'pleno-votes.json').retractions.find(
        (x: { voteId: string; scope: string }) => x.voteId === viva!.voteId && x.scope === 'record',
      )
      expect(entrada).toMatchObject({ revokedBy: firma })
    } finally {
      limpiar(dir)
    }
  })
})

/**
 * Mantener una ficha de la cola de excepción. La cola compone
 * `--reviewer "<nombre y apellidos>"` (`MARCADORES.firma`). La CLI escribe en
 * editorial/ y no publica nada, pero una «keep» firmada con el hueco saca la
 * ficha de la cola como si alguien la hubiera leído. Lee `public/data/` y
 * escribe `editorial/` desde el directorio de trabajo.
 */
describe('review:finding-exception', () => {
  const SCRIPT = 'review-finding-exception.ts'
  const HALLAZGOS = datosDelRepositorio('pleno-findings.json')
  const ID = (JSON.parse(HALLAZGOS).items as { id: string }[])[0]?.id
  const NOTA = 'El sumario cuenta el debate sin decir lo que la cita retenida no puede decir.'
  const orden = (firma: string, nota = NOTA) => [ID, '--reviewer', firma, '--note', nota]
  const conDatos = () => montar('excepcion-firma-', { 'pleno-findings.json': HALLAZGOS })

  it('hay una ficha publicada que mantener', () => {
    expect(ID).toBeTruthy()
  })

  it.each(HUECOS)('con «%s» se niega antes de leer nada', (hueco) => {
    const dir = montar('excepcion-firma-', {})
    try {
      seNegoPorElHueco(lanzar(SCRIPT, dir, orden(hueco)), '--reviewer', hueco)
    } finally {
      limpiar(dir)
    }
  })

  it('con la firma de la cola se niega y no escribe el registro', () => {
    const dir = conDatos()
    try {
      const antes = huella(dir)
      seNegoPorElHueco(lanzar(SCRIPT, dir, orden(HUECO)), '--reviewer', HUECO)
      expect(huella(dir)).toEqual(antes)
    } finally {
      limpiar(dir)
    }
  })

  it('la orden de su línea de uso, con la ficha y la firma rellenas y la nota no, se niega', () => {
    // El hueco de la nota tiene que quedar por debajo del suelo de la CLI, como
    // el de la cola (`MARCADORES.nota`): uno de 25 caracteres lo pasaba, y la
    // «keep» se anotaba con el hueco por nota.
    const nota = huecoDeSuUso(SCRIPT, '--note', { 'pleno-findings.json': HALLAZGOS })
    expect(nota).toBeDefined()
    const dir = conDatos()
    try {
      const antes = huella(dir)
      const r = lanzar(SCRIPT, dir, orden(FIRMAS[0], nota))
      expect(r.status, r.stdout + r.stderr).toBe(2)
      expect(r.stderr).toContain('--note')
      expect(huella(dir)).toEqual(antes)
    } finally {
      limpiar(dir)
    }
  })

  it.each(FIRMAS)('firmada «%s», anota la ficha como mantenida con esa firma', (firma) => {
    const dir = conDatos()
    try {
      const r = lanzar(SCRIPT, dir, orden(firma))
      expect(r.status, r.stdout + r.stderr).toBe(0)
      const registro = JSON.parse(
        readFileSync(join(dir, 'editorial/finding-exception-reviews.json'), 'utf8'),
      )
      expect(registro.reviews.find((x: { findingId: string }) => x.findingId === ID)).toMatchObject(
        { decision: 'keep', reviewer: firma, note: NOTA },
      )
    } finally {
      limpiar(dir)
    }
  })
})

/**
 * Las seis vías cuya orden no compone nadie. El hueco viene de su línea de
 * uso, y con ése se prueba que no toca los datos.
 */
describe('correct-press-finding', () => {
  const SCRIPT = 'correct-press-finding.ts'
  const PRENSA = datosDelRepositorio('press-findings.json')
  const ID = (JSON.parse(PRENSA).items as { id: string }[])[0]?.id
  const MOTIVO = 'Corrección de prueba: el título decía más de lo que sostiene la fuente.'
  const TITULO = 'Un título corregido para la prueba de la firma'
  const orden = (firma: string) => [
    ID,
    '--field',
    'title',
    '--new',
    TITULO,
    '--reason',
    MOTIVO,
    '--editor',
    firma,
  ]
  const conDatos = () => montar('prensa-firma-', { 'press-findings.json': PRENSA })

  it('hay un hallazgo de prensa publicado', () => {
    expect(ID).toBeTruthy()
  })

  it.each(HUECOS)('con «%s» se niega antes de leer nada', (hueco) => {
    // Una raíz sin datos: si llegara a leer, fallaría por otra cosa.
    const dir = montar('prensa-firma-', {})
    try {
      seNegoPorElHueco(lanzarCopia(SCRIPT, dir, orden(hueco)), '--editor', hueco)
    } finally {
      limpiar(dir)
    }
  })

  it('con el hueco de su línea de uso se niega y deja los datos byte a byte', () => {
    const hueco = huecoDeSuUso(SCRIPT)
    expect(hueco).toBeDefined()
    const dir = conDatos()
    try {
      const antes = huella(dir)
      seNegoPorElHueco(lanzarCopia(SCRIPT, dir, orden(hueco!)), '--editor', hueco!)
      expect(huella(dir)).toEqual(antes)
    } finally {
      limpiar(dir)
    }
  })

  it.each(FIRMAS)('firmada «%s», corrige y la bitácora lleva esa firma', (firma) => {
    const dir = conDatos()
    try {
      const r = lanzarCopia(SCRIPT, dir, orden(firma))
      expect(r.status, r.stdout + r.stderr).toBe(0)
      const ficha = leerJson(dir, 'press-findings.json').items.find(
        (f: { id: string }) => f.id === ID,
      )
      expect(ficha.corrections.at(-1)).toMatchObject({
        field: 'title',
        corrected: TITULO,
        editor: firma,
      })
    } finally {
      limpiar(dir)
    }
  })
})

/** `cita` baja la fuente antes de escribir: sus casos se paran antes de leer nada. */
describe('corregir-promesa', () => {
  const SCRIPT = 'correct-promise.ts'
  const PROMESAS = datosDelRepositorio('promises.json')
  const ID = (JSON.parse(PROMESAS).items as { id: string }[])[0]?.id
  const MOTIVO = 'Retirada de prueba: la fuente no recoge esas palabras como del partido.'
  const retirar = (firma: string) => ['retirar', ID, '--motivo', MOTIVO, '--editor', firma]
  const citar = (firma: string) => [
    'cita',
    ID,
    'Una cita corregida que nunca llega a comprobarse',
    '--motivo',
    MOTIVO,
    '--editor',
    firma,
  ]
  const conDatos = () => montar('promesa-firma-', { 'promises.json': PROMESAS })

  it('hay una promesa publicada', () => {
    expect(ID).toBeTruthy()
  })

  it.each(HUECOS)('retirar, con «%s», se niega antes de leer nada', (hueco) => {
    const dir = montar('promesa-firma-', {})
    try {
      seNegoPorElHueco(lanzarCopia(SCRIPT, dir, retirar(hueco)), '--editor', hueco)
    } finally {
      limpiar(dir)
    }
  })

  it('cita, con el hueco de su línea de uso, se niega antes de leer nada y de bajar la fuente', () => {
    const hueco = huecoDeSuUso(SCRIPT)
    expect(hueco).toBeDefined()
    const dir = montar('promesa-firma-', {})
    try {
      seNegoPorElHueco(lanzarCopia(SCRIPT, dir, citar(hueco!)), '--editor', hueco!)
    } finally {
      limpiar(dir)
    }
  })

  it('retirar, con el hueco de su línea de uso, se niega y deja los datos byte a byte', () => {
    const hueco = huecoDeSuUso(SCRIPT)
    expect(hueco).toBeDefined()
    const dir = conDatos()
    try {
      const antes = huella(dir)
      seNegoPorElHueco(lanzarCopia(SCRIPT, dir, retirar(hueco!)), '--editor', hueco!)
      expect(huella(dir)).toEqual(antes)
    } finally {
      limpiar(dir)
    }
  })

  it.each(FIRMAS)(
    'retirar, firmada «%s», retira la promesa y su huella lleva esa firma',
    (firma) => {
      const dir = conDatos()
      try {
        const r = lanzarCopia(SCRIPT, dir, retirar(firma))
        expect(r.status, r.stdout + r.stderr).toBe(0)
        const snap = leerJson(dir, 'promises.json')
        expect(snap.items.some((p: { id: string }) => p.id === ID)).toBe(false)
        expect(snap.retractions.at(-1)).toMatchObject({ promiseId: ID, editor: firma })
      } finally {
        limpiar(dir)
      }
    },
  )
})

describe('correct-indicador', () => {
  const SCRIPT = 'correct-indicador.ts'
  const FICHAS = datosDelRepositorio('eficiencia-findings.json')
  const ID = (JSON.parse(FICHAS).items as { id: string }[])[0]?.id
  const MOTIVO = 'Corrección de prueba: el titular decía más de lo que mide la cifra.'
  const TITULAR = 'Un titular corregido para la prueba de la firma'
  const orden = (firma: string) => [
    ID,
    '--field',
    'titulo',
    '--new',
    TITULAR,
    '--reason',
    MOTIVO,
    '--editor',
    firma,
  ]
  const conDatos = () => montar('indicador-firma-', { 'eficiencia-findings.json': FICHAS })

  it('hay una ficha de eficiencia publicada', () => {
    expect(ID).toBeTruthy()
  })

  it.each(HUECOS)('con «%s» se niega antes de leer nada', (hueco) => {
    const dir = montar('indicador-firma-', {})
    try {
      seNegoPorElHueco(lanzar(SCRIPT, dir, orden(hueco)), '--editor', hueco)
    } finally {
      limpiar(dir)
    }
  })

  it('con el hueco de su línea de uso se niega y deja los datos byte a byte', () => {
    const hueco = huecoDeSuUso(SCRIPT)
    expect(hueco).toBeDefined()
    const dir = conDatos()
    try {
      const antes = huella(dir)
      seNegoPorElHueco(lanzar(SCRIPT, dir, orden(hueco!)), '--editor', hueco!)
      expect(huella(dir)).toEqual(antes)
    } finally {
      limpiar(dir)
    }
  })

  it.each(FIRMAS)('firmada «%s», corrige y la bitácora lleva esa firma', (firma) => {
    const dir = conDatos()
    try {
      const r = lanzar(SCRIPT, dir, orden(firma))
      expect(r.status, r.stdout + r.stderr).toBe(0)
      const ficha = leerJson(dir, 'eficiencia-findings.json').items.find(
        (f: { id: string }) => f.id === ID,
      )
      expect(ficha.corrections.at(-1)).toMatchObject({
        field: 'titulo',
        corrected: TITULAR,
        editor: firma,
      })
    } finally {
      limpiar(dir)
    }
  })
})

describe('retract-indicador', () => {
  const SCRIPT = 'retract-indicador.ts'
  const FICHAS = datosDelRepositorio('eficiencia-findings.json')
  const ID = (JSON.parse(FICHAS).items as { id: string }[])[0]?.id
  const MOTIVO = 'Retirada de prueba: la cifra ya no la respalda el panel del ministerio.'
  const orden = (firma: string) => [ID, '--editor', firma, '--reason', MOTIVO]
  const conDatos = () => montar('retirada-firma-', { 'eficiencia-findings.json': FICHAS })

  it('hay una ficha de eficiencia publicada', () => {
    expect(ID).toBeTruthy()
  })

  it.each(HUECOS)('con «%s» se niega antes de leer nada', (hueco) => {
    const dir = montar('retirada-firma-', {})
    try {
      seNegoPorElHueco(lanzar(SCRIPT, dir, orden(hueco)), '--editor', hueco)
    } finally {
      limpiar(dir)
    }
  })

  it('con el hueco de su línea de uso se niega y deja los datos byte a byte', () => {
    const hueco = huecoDeSuUso(SCRIPT)
    expect(hueco).toBeDefined()
    const dir = conDatos()
    try {
      const antes = huella(dir)
      seNegoPorElHueco(lanzar(SCRIPT, dir, orden(hueco!)), '--editor', hueco!)
      expect(huella(dir)).toEqual(antes)
    } finally {
      limpiar(dir)
    }
  })

  it.each(FIRMAS)('firmada «%s», retira la ficha y la lápida lleva esa firma', (firma) => {
    const dir = conDatos()
    try {
      const r = lanzar(SCRIPT, dir, orden(firma))
      expect(r.status, r.stdout + r.stderr).toBe(0)
      const snap = leerJson(dir, 'eficiencia-findings.json')
      expect(snap.items.some((f: { id: string }) => f.id === ID)).toBe(false)
      expect(snap.retractions.at(-1)).toMatchObject({ findingId: ID, editor: firma })
    } finally {
      limpiar(dir)
    }
  })
})

describe('correct-journalist-report', () => {
  const SCRIPT = 'correct-journalist-report.ts'
  const INFORMES = datosDelRepositorio('journalist-reports.json')
  type Informe = { id: string; sections: { kind: string; payload: { heading?: string } }[] }
  const informe = (JSON.parse(INFORMES).items as Informe[]).find((r) =>
    r.sections.some((s) => s.kind === 'narrative'),
  )
  const epigrafe = informe?.sections.find((s) => s.kind === 'narrative')?.payload.heading
  const CAMPO = `narrative.${epigrafe}.heading`
  const NUEVO = `${epigrafe} (corregido)`
  const MOTIVO = 'Corrección de prueba: el epígrafe no describía lo que cuenta la sección.'
  const orden = (firma: string) => [
    informe!.id,
    '--field',
    CAMPO,
    '--new',
    NUEVO,
    '--reason',
    MOTIVO,
    '--editor',
    firma,
  ]
  const conDatos = () => montar('informe-firma-', { 'journalist-reports.json': INFORMES })

  it('hay un informe publicado con una sección narrativa', () => {
    expect(epigrafe).toBeTruthy()
  })

  it.each(HUECOS)('con «%s» se niega antes de leer nada', (hueco) => {
    const dir = montar('informe-firma-', {})
    try {
      seNegoPorElHueco(lanzar(SCRIPT, dir, orden(hueco)), '--editor', hueco)
    } finally {
      limpiar(dir)
    }
  })

  it('con el hueco de su línea de uso se niega y deja los datos byte a byte', () => {
    const hueco = huecoDeSuUso(SCRIPT)
    expect(hueco).toBeDefined()
    const dir = conDatos()
    try {
      const antes = huella(dir)
      seNegoPorElHueco(lanzar(SCRIPT, dir, orden(hueco!)), '--editor', hueco!)
      expect(huella(dir)).toEqual(antes)
    } finally {
      limpiar(dir)
    }
  })

  it.each(FIRMAS)('firmada «%s», corrige y la bitácora lleva esa firma', (firma) => {
    const dir = conDatos()
    try {
      const r = lanzar(SCRIPT, dir, orden(firma))
      expect(r.status, r.stdout + r.stderr).toBe(0)
      const escrito = leerJson(dir, 'journalist-reports.json').items.find(
        (r: { id: string }) => r.id === informe!.id,
      )
      expect(escrito.corrections.at(-1)).toMatchObject({
        field: CAMPO,
        corrected: NUEVO,
        editor: firma,
      })
    } finally {
      limpiar(dir)
    }
  })
})

/**
 * No guarda la firma en ningún sitio —sólo la imprime al terminar—, así que lo
 * comprobable en verde es que la guarda la deja pasar: lee los informes y se
 * para porque ninguno cita la URL vieja, antes de la red.
 */
describe('repoint-source-url', () => {
  const SCRIPT = 'repoint-source-url.ts'
  const INFORMES = datosDelRepositorio('journalist-reports.json')
  const VIEJA = 'https://example.org/acta-que-ninguna-fuente-cita.pdf'
  const NUEVA = 'https://example.org/acta-reubicada.pdf'
  const MOTIVO = 'El ayuntamiento movió el documento a otra dirección de su portal.'
  const orden = (firma: string) => [
    '--old',
    VIEJA,
    '--new',
    NUEVA,
    '--reason',
    MOTIVO,
    '--editor',
    firma,
  ]
  const conDatos = () => montar('repoint-firma-', { 'journalist-reports.json': INFORMES })

  it('ninguna fuente publicada cita la URL vieja de la prueba', () => {
    // Si alguna la citara, la vía seguiría hasta la red.
    const urls = (JSON.parse(INFORMES).items as { sources: { url: string }[] }[]).flatMap((r) =>
      r.sources.map((s) => s.url),
    )
    expect(urls.length).toBeGreaterThan(0)
    expect(urls).not.toContain(VIEJA)
  })

  it.each(HUECOS)('con «%s» se niega antes de leer nada', (hueco) => {
    const dir = montar('repoint-firma-', {})
    try {
      seNegoPorElHueco(lanzar(SCRIPT, dir, orden(hueco)), '--editor', hueco)
    } finally {
      limpiar(dir)
    }
  })

  it('con el hueco de su línea de uso se niega antes de leer los informes', () => {
    const hueco = huecoDeSuUso(SCRIPT)
    expect(hueco).toBeDefined()
    const dir = conDatos()
    try {
      const antes = huella(dir)
      seNegoPorElHueco(lanzar(SCRIPT, dir, orden(hueco!)), '--editor', hueco!)
      expect(huella(dir)).toEqual(antes)
    } finally {
      limpiar(dir)
    }
  })

  it.each(FIRMAS)('firmada «%s», pasa la guarda y lee los informes', (firma) => {
    const dir = conDatos()
    try {
      const antes = huella(dir)
      const r = lanzar(SCRIPT, dir, orden(firma))
      expect(r.status, r.stdout + r.stderr).toBe(1)
      expect(r.stderr).toContain(`no source cites ${VIEJA}`)
      expect(huella(dir)).toEqual(antes)
    } finally {
      limpiar(dir)
    }
  })
})
