/**
 * Una orden preparada copiada sin rellenar no escribe nada.
 *
 * Tres colas de revisión componen órdenes para que las firme una persona en su
 * terminal: la de apoyo de /hallazgos (src/scraper/finding-support.ts) y la de
 * reanclaje de sus citas (quote-reanchor.ts), hacia `correct-pleno-finding`, y
 * la de reanclaje de declaraciones (claim-reanchor.ts), hacia `reanchor-claim`.
 * Las tres componían `--reason "<por qué, ≥20 caracteres>"`: 25 caracteres, que
 * pasan el suelo de 20 de las dos CLIs. Con el texto nuevo y la firma rellenos y
 * el motivo no, `correct-pleno-finding` salía con 0 y escribía el hueco como
 * motivo publicado de la corrección, el que BitacoraCorrecciones imprime en
 * /hallazgos (reproducido el 04-10-2026, durante la PR #224).
 *
 * El literal de la cola de citas es el mismo defecto: `--new "<el literal del
 * texto nuevo, copiado tal cual>"` mide 49, y el validador sólo pide a una cita
 * 20; con el motivo y la firma rellenos, el hueco se publicaba como cita.
 *
 * Cada bloque toma la orden TAL CUAL la compone su cola —nunca una copia escrita
 * aquí (docs/DATA_INTEGRITY.md, regla 1)—, la trocea como lo haría el shell
 * (`tokeniza`, el troceo de los ganchos), rellena lo que el operador sí rellenó y
 * deja el resto como llegó. Y cada uno lleva su control: la misma orden, rellena
 * entera, escribe. Sin él, una negativa por cualquier otra causa pasaría por la
 * guarda.
 *
 * Todas corren sobre una copia de los datos en un directorio temporal y
 * escriben de verdad; ninguna toca `public/data/` del repositorio, ni aunque la
 * guarda fallara. `correct-pleno-finding` lee sus datos desde la carpeta de su
 * script, así que se lanza una copia del script desde una raíz temporal
 * (`conScript`); `reanchor-claim` los lee desde el directorio de trabajo.
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

import { tokeniza } from '../.claude/hooks/shell-tokens.mjs'
import { buildClaimReanchorQueue } from '../src/scraper/claim-reanchor'
import { buildSupportQueue } from '../src/scraper/finding-support'
import { validateFindingsSnapshot, type PlenoFinding } from '../src/scraper/pleno-finding'
import { MARKED_STATUS_IDS } from '../src/scraper/quote-provenance'
import { quoteAppearsIn, quoteCoverage } from '../src/scraper/quote-match'
import { buildReanchorQueue } from '../src/scraper/quote-reanchor'
import { RETENCION_MINIMA, retencionLexica } from '../src/scraper/verified-merge'

const RAIZ = resolve(__dirname, '..')
const TSX = join(RAIZ, 'node_modules/tsx/dist/cli.mjs')
const PAQUETE = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}
const GENERADA = '2026-10-05T00:00:00.000Z'

/** Con lo que firma el operador: la cuenta de rol. */
const FIRMA = 'civicpulse-curator'
const MOTIVO = 'Corrección de prueba: la ficha decía más de lo que sus fuentes sostienen.'

type Token = { texto: string; opaco: boolean; sust: boolean; sep?: boolean; heredoc?: boolean }

/**
 * La orden tal como le llegaría a la CLI: troceada como lo haría el shell y sin
 * el `npm run <nombre> --` de delante. Sólo palabras: un hueco fuera de las
 * comillas sería una redirección, y eso ya es otra orden. El script sale de
 * `package.json`, no de una tabla escrita aquí.
 */
function argvDe(orden: string): { script: string; argv: string[] } {
  const tokens = tokeniza(orden) as Token[]
  expect(
    tokens.every((t) => !t.sep && !t.heredoc && !t.opaco && !t.sust),
    `el shell no leería «${orden}» como una orden hecha sólo de palabras`,
  ).toBe(true)
  const palabras = tokens.map((t) => t.texto)
  expect(palabras.slice(0, 2), orden).toEqual(['npm', 'run'])
  expect(palabras[3], orden).toBe('--')
  const npm = PAQUETE.scripts[palabras[2]]
  const script = /scripts\/([\w-]+\.ts)$/.exec(npm ?? '')?.[1]
  expect(script, `${palabras[2]} → ${npm}`).toBeTruthy()
  return { script: script!, argv: palabras.slice(4) }
}

/** Sustituye el valor que sigue a cada bandera; la bandera tiene que estar en la orden. */
function rellenar(argv: string[], valores: Record<string, string>): string[] {
  const out = [...argv]
  for (const [bandera, valor] of Object.entries(valores)) {
    const i = out.indexOf(bandera)
    expect(i, `la orden compuesta no lleva ${bandera}: ${argv.join(' ')}`).toBeGreaterThanOrEqual(0)
    expect(i + 1, `${bandera} no lleva valor: ${argv.join(' ')}`).toBeLessThan(out.length)
    out[i + 1] = valor
  }
  return out
}

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

const HALLAZGOS = datosDelRepositorio('pleno-findings.json')
const FICHA = validateFindingsSnapshot(HALLAZGOS).items[0] as PlenoFinding

/**
 * Lanza `correct-pleno-finding` como copia desde una raíz temporal con una copia
 * de las fichas publicadas, y devuelve lo que quedó escrito en ella.
 */
function corregir(script: string, argv: string[]) {
  const dir = montar('orden-hallazgo-', { 'pleno-findings.json': HALLAZGOS })
  try {
    const antes = huella(dir)
    const r = spawnSync(process.execPath, [TSX, conScript(dir, script), ...argv], {
      cwd: dir,
      encoding: 'utf8',
    })
    const ficha = (leerJson(dir, 'pleno-findings.json').items as PlenoFinding[]).find(
      (f) => f.id === FICHA.id,
    )
    return { r, antes, despues: huella(dir), ficha }
  } finally {
    limpiar(dir)
  }
}

describe('cola de apoyo → correct-pleno-finding --field summary', () => {
  const fila = buildSupportQueue(validateFindingsSnapshot(HALLAZGOS), {
    generatedAt: GENERADA,
  }).rows.find((r) => r.id === FICHA.id)
  const { script, argv } = argvDe(fila!.correctionCommand)
  const SUMARIO =
    'Un sumario reescrito para la prueba, más largo que un muñón, que nunca se publica.'

  it('con el sumario y la firma rellenos y el motivo como llegó, se niega y no toca los datos', () => {
    const { r, antes, despues } = corregir(
      script,
      rellenar(argv, { '--new': SUMARIO, '--editor': FIRMA }),
    )
    expect(r.status, r.stdout + r.stderr).not.toBe(0)
    expect(r.stderr).toContain('--reason')
    expect(despues).toEqual(antes)
  })

  it('rellena entera, escribe la corrección con ese motivo', () => {
    const { r, ficha } = corregir(
      script,
      rellenar(argv, { '--new': SUMARIO, '--reason': MOTIVO, '--editor': FIRMA }),
    )
    expect(r.status, r.stdout + r.stderr).toBe(0)
    expect(ficha?.summary).toBe(SUMARIO)
    expect(ficha?.corrections?.at(-1)).toMatchObject({
      field: 'summary',
      reason: MOTIVO,
      editor: FIRMA,
    })
  })
})

describe('cola de reanclaje de citas → correct-pleno-finding --field quote.<i>.text', () => {
  // La cola encola lo que la procedencia marca. Aquí se marca la primera cita de
  // una ficha cualquiera con el primer estado que marca, leído de su lista: la
  // cola publicada se vacía a medida que se reancla, y la orden que compone no
  // depende de qué cita sea.
  const fila = buildReanchorQueue(
    [FICHA],
    { quotes: { [FICHA.id]: [{ status: MARKED_STATUS_IDS[0], gate: null }] } },
    new Map(),
    { generatedAt: GENERADA },
  ).rows[0]
  const { script, argv } = argvDe(fila.correctionCommand)
  const LITERAL = 'Un literal de prueba, copiado de la transcripción, que nunca se publica.'

  it('la cola compone la orden para la cita marcada', () => {
    expect(fila.findingId).toBe(FICHA.id)
    expect(argv).toContain(`quote.${fila.quoteIndex}.text`)
  })

  it('con el literal y la firma rellenos y el motivo como llegó, se niega y no toca los datos', () => {
    const { r, antes, despues } = corregir(
      script,
      rellenar(argv, { '--new': LITERAL, '--editor': FIRMA }),
    )
    expect(r.status, r.stdout + r.stderr).not.toBe(0)
    expect(r.stderr).toContain('--reason')
    expect(despues).toEqual(antes)
  })

  it('con el motivo y la firma rellenos y el literal como llegó, se niega y no toca los datos', () => {
    const { r, antes, despues } = corregir(
      script,
      rellenar(argv, { '--reason': MOTIVO, '--editor': FIRMA }),
    )
    expect(r.status, r.stdout + r.stderr).not.toBe(0)
    expect(r.stderr).toContain(`quotes[${fila.quoteIndex}].text`)
    expect(despues).toEqual(antes)
  })

  it('rellena entera, escribe el literal y la corrección con ese motivo', () => {
    const { r, ficha } = corregir(
      script,
      rellenar(argv, { '--new': LITERAL, '--reason': MOTIVO, '--editor': FIRMA }),
    )
    expect(r.status, r.stdout + r.stderr).toBe(0)
    expect(ficha?.quotes[fila.quoteIndex]?.text).toBe(LITERAL)
    expect(ficha?.corrections?.at(-1)).toMatchObject({
      field: `quote.${fila.quoteIndex}.text`,
      corrected: LITERAL,
      reason: MOTIVO,
      editor: FIRMA,
    })
  })
})

/**
 * `reanchor-claim` sólo reancla una declaración cuyo literal no consta en
 * ninguna transcripción, y sólo hacia un pasaje que conste ENTERO. Se toma una
 * declaración publicada sin grupo —la de una atribuida se niega por otra razón—
 * cuyo literal sí consta, y se publica en la copia con las palabras al revés:
 * así no consta, conserva todas sus palabras con contenido, y su literal de
 * verdad es el pasaje al que reanclarla.
 */
describe('cola de reanclaje de declaraciones → reanchor-claim', () => {
  type Fila = {
    claim: {
      id: string
      plenoId: string
      type: string
      verbatim: string
      speakerGroup: string | null
    }
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
  const alReves = (s: string) => s.trim().split(/\s+/).reverse().join(' ')
  const elegida = corpus.items.find((f) => {
    const acta = transcripcion(f)
    const v = f.claim.verbatim
    return (
      acta != null &&
      f.claim.speakerGroup == null &&
      v.trim().split(/\s+/).length >= 12 &&
      quoteCoverage(v, acta) === 1 &&
      !quoteAppearsIn(alReves(v), acta) &&
      retencionLexica(alReves(v), v) >= RETENCION_MINIMA
    )
  })
  const literal = elegida?.claim.verbatim ?? ''
  const publicada = elegida && {
    ...elegida,
    claim: { ...elegida.claim, verbatim: alReves(literal) },
  }
  const fila =
    publicada &&
    buildClaimReanchorQueue([publicada], new Set([publicada.claim.id]), new Map(), {
      generatedAt: GENERADA,
    }).rows[0]
  const { script, argv } = fila ? argvDe(fila.correctionCommand) : { script: '', argv: [] }

  /** Lanza `reanchor-claim` sobre una copia con la declaración publicada al revés. */
  function reanclar(argv: string[]) {
    const snap =
      JSON.stringify(
        { generatedAt: corpus.generatedAt, source: corpus.source, items: [publicada] },
        null,
        2,
      ) + '\n'
    const dir = montar('orden-declaracion-', {
      'pleno-claims-verified-base.json': snap,
      'pleno-claims-verified.json': snap,
      'pleno-claim-reanchors.json':
        JSON.stringify({ version: 1, generatedAt: '', entries: {} }, null, 2) + '\n',
      [`pleno-transcripts/${elegida!.claim.plenoId}.txt`]: transcripcion(elegida!)!,
    })
    try {
      const antes = huella(dir)
      const r = spawnSync(process.execPath, [TSX, join(RAIZ, 'scripts', script), ...argv], {
        cwd: dir,
        encoding: 'utf8',
      })
      return {
        r,
        antes,
        despues: huella(dir),
        reanclajes: leerJson(dir, 'pleno-claim-reanchors.json'),
      }
    } finally {
      limpiar(dir)
    }
  }

  it('hay una declaración publicada sin grupo cuyo literal consta en su transcripción', () => {
    // Si esto cae, los bloques de abajo dejan de medir lo que dicen.
    expect(elegida).toBeTruthy()
    expect(fila?.claimId).toBe(elegida?.claim.id)
  })

  it('con el literal y la firma rellenos y el motivo como llegó, se niega y no toca los datos', () => {
    const { r, antes, despues } = reanclar(
      rellenar(argv, { '--verbatim': literal, '--editor': FIRMA }),
    )
    expect(r.status, r.stdout + r.stderr).not.toBe(0)
    expect(r.stderr).toContain('--reason')
    expect(despues).toEqual(antes)
  })

  it('rellena entera, reancla con ese motivo y esa firma', () => {
    const { r, reanclajes } = reanclar(
      rellenar(argv, { '--verbatim': literal, '--reason': MOTIVO, '--editor': FIRMA }),
    )
    expect(r.status, r.stdout + r.stderr).toBe(0)
    expect(reanclajes.entries[elegida!.claim.id]).toMatchObject({
      verbatim: literal,
      reason: MOTIVO,
      editor: FIRMA,
    })
  })
})
