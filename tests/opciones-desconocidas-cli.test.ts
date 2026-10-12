/**
 * Una opción que el CLI no conoce no escribe nada.
 *
 * El 11-10-2026 se vio que `reclassify-claim` no tenía `--dry-run` y que su
 * `parse()` metía cualquier opción desconocida entre los posicionales:
 * `reclassify-claim <id> <tipo> --reason "…" --dry-run` escribía el sidecar
 * curado y recomponía verified.json de verdad. La auditoría de todos los CLIs
 * que escriben un fichero curado encontró lo mismo, de tres formas:
 *
 *   - la opción se cuela como posicional (`reclassify-claim`, `downgrade-verdict`,
 *     `reanchor-claim`, los CLIs sólo posicionales: `reply`, `finding-reply`,
 *     `queja-reply`, `sindic:add`, `indicador-reply`, `apply-promise-draft`…);
 *   - la opción se ignora sin más, porque el parser sólo pregunta
 *     `process.argv.includes('--x')` por las que conoce (`freeze:set`,
 *     `retract-vote`, `correct-pleno-finding`, `promote-place`, `solicitud`…);
 *   - la opción se rechaza antes de leer nada (`promote-claim`, `promote-report`,
 *     `subir-veredicto`, `corregir-rotulo-motor`, `journalist:archive`…).
 *
 * Las dos primeras corren la orden entera: escriben. Aquí se exige la tercera a
 * todas, con `--dry-run` en las que no lo tienen —la opción que más se supone—,
 * con `--dryrun` en las que sí —la que más se teclea mal— y con una inventada.
 *
 * Cada orden es completa y plausible: sin la guarda, seguiría hasta leer sus
 * datos. Se lanza en un directorio temporal con esos datos ILEGIBLES, así que
 * llegar a leerlos la tumbaría con otro error, y el mensaje de la guarda prueba
 * que se negó antes. Ninguna toca el `public/data/` del repositorio: las que
 * leen desde la carpeta de su script se lanzan desde una copia (`copia`), como
 * en firma-sin-rellenar-cli.test.ts. Ninguna llega a la red ni a un modelo:
 * `fetch` se sustituye por uno que apunta y falla, y `npx`, `claude`, `agy` y
 * `gemini` por unos de mentira que apuntan y salen con 1.
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

import { CURATED } from '../.claude/hooks/curated-paths.mjs'
import { RESPONDENTES } from '../src/scraper/eficiencia-finding'
import { ALLOWED_PARTIES } from '../src/scraper/promises'
import { ALLOWED_MATERIAS, ALLOWED_SENTIDOS } from '../src/scraper/sindic'
import { ALLOWED_CLAIM_TYPES } from '../src/scraper/pleno-claim'
import { RESPONSE_BLOCS } from '../src/scraper/journalist/types'
import { SPEAKER_GROUPS } from '../src/scraper/pleno-votes'
import { TRINQUETE } from '../src/scraper/trinquete'

const RAIZ = resolve(__dirname, '..')
const TSX = join(RAIZ, 'node_modules/tsx/dist/cli.mjs')
const SCRIPTS_NPM = (
  JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>
  }
).scripts

const ILEGIBLE = '{ si esto se llega a leer, no es JSON'

/** Una pasada declarada retirada: con una viva, `retirar-pasada` para antes de leer. */
const RETIRADA = Object.keys(TRINQUETE).find(
  (k) => TRINQUETE[k as keyof typeof TRINQUETE].retirada,
)!

/** Las capas de verified.json: las lee todo lo que recompone. */
const VERIFICADOS = [
  'pleno-claims-verified.json',
  'pleno-claims-verified-base.json',
  'pleno-claims-overlay.json',
  'pleno-claim-reclassifications.json',
  'pleno-claim-reanchors.json',
  'pleno-claim-relabels.json',
  'officials.json',
]

const MOTIVO = 'Motivo de prueba, con más de veinte caracteres.'
const CITA = 'Una cita literal de prueba, con más de veinte caracteres.'
const ROL = 'civicpulse-curator'
const PERSONA = 'María de la Fuente Llorens'

interface Caso {
  /** La orden de npm (o el script, si no tiene). */
  orden: string
  /** El fichero bajo scripts/. */
  script: string
  /** Una orden completa y plausible: sin la guarda, seguiría hasta leer. */
  argv: string[]
  /** Rutas bajo `public/data/` que se dejan ilegibles. */
  datos?: string[]
  /** Rutas desde la raíz (`editorial/…`, `tests/fixtures/…`) que se dejan ilegibles. */
  fuera?: string[]
  /** Ficheros que la orden necesita, con su contenido, por su ruta desde la raíz. */
  extra?: Record<string, string>
  /** Lee sus datos desde la carpeta del script: se lanza una copia. */
  copia?: boolean
  /** ¿Admite `--dry-run`? Entonces se prueba su errata, `--dryrun`. */
  dryRun?: boolean
}

/**
 * Los que NO rechazaban una opción desconocida: la escribían como posicional o
 * la ignoraban, y corrían la orden entera.
 */
const ABIERTOS: Caso[] = [
  {
    orden: 'reply',
    script: 'apply-promise-response.ts',
    argv: ['una-promesa', ALLOWED_PARTIES[0], CITA],
    datos: ['promises.json'],
    copia: true,
  },
  {
    orden: 'freeze:set',
    script: 'set-promises-freeze.ts',
    argv: ['set', '2027-05-01'],
    datos: ['promises.json'],
    copia: true,
  },
  {
    orden: 'freeze:clear',
    script: 'set-promises-freeze.ts',
    argv: ['clear'],
    datos: ['promises.json'],
    copia: true,
  },
  {
    orden: 'aviso-promesas',
    script: 'set-promises-notice.ts',
    argv: ['set', 'Un aviso de prueba sobre las promesas.'],
    datos: ['promises.json'],
    copia: true,
  },
  {
    orden: 'corregir-promesa',
    script: 'correct-promise.ts',
    argv: ['retirar', 'una-promesa', '--motivo', MOTIVO, '--editor', ROL],
    datos: ['promises.json'],
    copia: true,
    // Desde que tiene `plazo`, `--dry-run` es un modo de verdad en las cuatro vías.
    dryRun: true,
  },
  {
    orden: 'pleno-vote',
    script: 'apply-pleno-vote.ts',
    argv: ['--file', 'voto.json'],
    datos: ['pleno-votes.json', 'plenos.json'],
    fuera: ['voto.json'],
  },
  {
    orden: 'promote-vote',
    script: 'promote-pleno-vote-suggestion.ts',
    argv: ['un-pleno', '3'],
    datos: [
      'pleno-votes.json',
      'pleno-votes-suggestions.json',
      'plenos-agendas.json',
      'plenos.json',
    ],
  },
  {
    orden: 'retract-vote',
    script: 'retract-pleno-vote.ts',
    argv: ['un-voto-03', '--reason', MOTIVO, '--editor', ROL],
    datos: ['pleno-votes.json'],
    dryRun: true,
  },
  {
    orden: 'finding-reply',
    script: 'apply-finding-response.ts',
    argv: ['un-hallazgo', SPEAKER_GROUPS[0], CITA],
    datos: ['pleno-findings.json'],
  },
  {
    orden: 'correct-pleno-finding',
    script: 'correct-pleno-finding.ts',
    argv: [
      'un-hallazgo',
      '--field',
      'title',
      '--new',
      'Un título nuevo',
      '--reason',
      MOTIVO,
      '--editor',
      ROL,
    ],
    datos: ['pleno-findings.json', 'finding-quote-provenance.json'],
    copia: true,
    dryRun: true,
  },
  {
    orden: 'downgrade-verdict',
    script: 'downgrade-verdict.ts',
    argv: ['una-declaracion', 'parcial', '--reason', MOTIVO],
    datos: [...VERIFICADOS, 'pleno-findings.json'],
    dryRun: true,
  },
  {
    orden: 'verify:pleno-claims',
    script: 'verify-pleno-claims.ts',
    argv: ['--base-only'],
    datos: [...VERIFICADOS, 'pleno-claims-suggestions.json'],
  },
  {
    orden: 'apply-gold-downgrades',
    script: 'apply-gold-downgrades.ts',
    argv: [],
    datos: VERIFICADOS,
    fuera: ['tests/fixtures/verifier-gold.json'],
    dryRun: true,
  },
  {
    orden: 'reclassify-claim',
    script: 'reclassify-claim.ts',
    argv: ['una-declaracion', ALLOWED_CLAIM_TYPES[0], '--reason', MOTIVO],
    datos: VERIFICADOS,
  },
  {
    orden: 'reanchor-claim',
    script: 'reanchor-claim.ts',
    argv: ['una-declaracion', '--verbatim', CITA, '--reason', MOTIVO],
    datos: VERIFICADOS,
    dryRun: true,
  },
  {
    orden: 'relabel-attribution',
    script: 'relabel-attribution.ts',
    argv: [
      'una-declaracion',
      '--grupo',
      SPEAKER_GROUPS[0],
      '--segundos',
      '4016-4095',
      '--motivo',
      MOTIVO,
      '--editor',
      PERSONA,
    ],
    datos: [...VERIFICADOS, 'promises.json'],
    dryRun: true,
  },
  {
    orden: 'correct-press-finding',
    script: 'correct-press-finding.ts',
    argv: [
      'un-hallazgo',
      '--field',
      'title',
      '--new',
      'Un título nuevo',
      '--reason',
      MOTIVO,
      '--editor',
      ROL,
    ],
    datos: ['press-findings.json'],
    copia: true,
  },
  {
    orden: 'queja-reply',
    script: 'apply-queja-response.ts',
    argv: ['Q-ABCD', 'Servicio municipal', 'Una persona', CITA, 'https://example.org/respuesta'],
    datos: ['quejas-responses.json'],
  },
  {
    orden: 'sindic:add',
    script: 'add-sindic-resolucion.ts',
    argv: [
      '12345',
      '2026-10-01',
      ALLOWED_MATERIAS[0],
      ALLOWED_SENTIDOS[0],
      'Un título de resolución de prueba',
      'Un resumen de la resolución de prueba, con algo de texto.',
      'https://www.elsindic.com/resolucion-de-prueba.pdf',
      'Q-ABCD',
    ],
    datos: ['sindic.json'],
  },
  {
    orden: 'promote-place',
    script: 'promote-place.ts',
    argv: ['un-contrato', '--curator', ROL],
    datos: ['place-overrides.json', 'place-suggestions.json'],
  },
  {
    orden: 'entity-alias',
    script: 'entity-alias.ts',
    argv: ['EMPRESA UNA SL', 'EMPRESA DOS SA', '--curator', ROL],
    datos: ['entity-overrides.json', 'entities.json'],
  },
  {
    orden: 'promote-area-fit',
    script: 'promote-area-fit.ts',
    argv: ['--official', 'una-persona', '--area', 'Urbanismo', '--curator', ROL],
    datos: ['area-fit.json', 'officials.json', 'journalist-reports.json', 'promises.json'],
    fuera: ['editorial/area-fit-queue.json'],
  },
  {
    orden: 'promote-indicador',
    script: 'promote-indicador.ts',
    argv: ['un-candidato', '--curator', ROL, '--titulo', 'Un titular', '--cuerpo', CITA],
    datos: ['eficiencia-findings.json', 'promises.json'],
    fuera: ['editorial/indicador-candidates.json'],
    dryRun: true,
  },
  {
    orden: 'correct-indicador',
    script: 'correct-indicador.ts',
    argv: [
      'una-ficha',
      '--field',
      'titulo',
      '--new',
      'Un titular',
      '--reason',
      MOTIVO,
      '--editor',
      ROL,
    ],
    datos: ['eficiencia-findings.json', 'indicadores.json'],
  },
  {
    orden: 'retract-indicador',
    script: 'retract-indicador.ts',
    argv: ['una-ficha', '--editor', ROL, '--reason', MOTIVO],
    datos: ['eficiencia-findings.json'],
  },
  {
    orden: 'competencia-reply',
    script: 'apply-competencia-response.ts',
    argv: ['--oficial', 'una-persona', '--fecha', '2026-10-01', '--texto', 'replica.txt'],
    datos: ['competencias.json'],
    extra: { 'replica.txt': CITA },
  },
  {
    orden: 'roster-correction',
    script: 'apply-officials-correction.ts',
    argv: ['--retirar', 'una-persona'],
    datos: ['officials-corrections.json', 'officials.json'],
  },
  {
    orden: 'solicitud',
    script: 'solicitud-acceso.ts',
    argv: ['responder', 'una-solicitud', '--fecha', '2026-10-05', '--sentido', 'parcial'],
    datos: ['solicitudes-acceso.json'],
  },
  {
    orden: 'restamp',
    script: 'restamp-curated.ts',
    argv: ['promises.json', '--motivo', MOTIVO],
    datos: ['promises.json'],
    dryRun: true,
  },
  // Fuera de CURATED, pero también escriben un fichero curado.
  {
    orden: 'apply-curation',
    script: 'apply-curation.ts',
    argv: [],
    datos: ['pleno-findings.json'],
    fuera: [
      'editorial/curation-decisions.json',
      'editorial/auto-curation-queue-pending-measurement.json',
    ],
    dryRun: true,
  },
  {
    orden: 'apply-promise-draft',
    script: 'apply-promise-draft.ts',
    argv: ['un-borrador'],
    datos: ['promises.json'],
    fuera: ['editorial/promise-review-queue.json', 'editorial/promise-review-archive.json'],
    copia: true,
  },
  {
    orden: 'auto-curate-press',
    script: 'auto-curate-press.ts',
    argv: ['--max', '3'],
    datos: ['press-claims-verified.json', 'press-findings.json', 'press.json', 'promises.json'],
    copia: true,
    dryRun: true,
  },
  {
    orden: 'backfill:self-declared',
    script: 'backfill-self-declared.ts',
    argv: ['--curator', ROL],
    datos: ['journalist-reports.json'],
    dryRun: true,
  },
  {
    orden: 'indicador-reply',
    script: 'reply-indicador.ts',
    argv: ['una-ficha', RESPONDENTES[0], CITA],
    datos: ['eficiencia-findings.json'],
  },
  {
    orden: 'repoint-finding-claims',
    script: 'repoint-finding-claims.ts',
    argv: ['un-hallazgo', '--apply'],
    datos: ['pleno-findings.json', 'pleno-claims-suggestions.json'],
  },
  {
    orden: 'retract-finding',
    script: 'retract-pleno-finding.ts',
    argv: ['un-hallazgo', '--reason', MOTIVO, '--editor', ROL],
    datos: ['pleno-findings.json'],
    dryRun: true,
  },
  {
    orden: 'retirar-pasada',
    script: 'retirar-pasada.ts',
    argv: ['--source', RETIRADA],
    datos: VERIFICADOS,
    dryRun: true,
  },
  {
    orden: 'migrate:area-fit-short',
    script: 'migrate-area-fit-short.ts',
    argv: [],
    datos: ['area-fit.json', 'officials.json', 'journalist-reports.json'],
    dryRun: true,
  },
  {
    orden: 'migrate:area-fit-portfolio-key',
    script: 'migrate-area-fit-portfolio-key.ts',
    argv: [],
    datos: ['area-fit.json', 'officials.json', 'journalist-reports.json'],
    dryRun: true,
  },
  {
    orden: 'migrate:area-fit-department-slug',
    script: 'migrate-area-fit-department-slug.ts',
    argv: [],
    datos: ['area-fit.json', 'officials.json', 'journalist-reports.json'],
    dryRun: true,
  },
  {
    orden: 'migrate:verified-split',
    script: 'migrate-verified-split.ts',
    argv: ['--force'],
    datos: VERIFICADOS,
  },
  {
    orden: 'migrate-vote-provenance.ts',
    script: 'migrate-vote-provenance.ts',
    argv: [],
    datos: ['pleno-votes.json'],
    dryRun: true,
  },
  {
    orden: 'migrate-finding-crosschecked.ts',
    script: 'migrate-finding-crosschecked.ts',
    argv: ['--target', 'pleno'],
    datos: ['pleno-findings.json', 'press-findings.json'],
    dryRun: true,
  },
]

/**
 * Los que ya la rechazaban antes de leer nada, cada uno con su parser. Se fijan
 * aquí para que no se pierda: no se tocan.
 */
const CERRADOS: Caso[] = [
  {
    orden: 'promote-claim',
    script: 'promote-claim.ts',
    argv: [
      'una-declaracion',
      '--title',
      'Un título de prueba',
      '--summary',
      'Un resumen de prueba con más de cuarenta caracteres, para pasar.',
      '--curator',
      ROL,
    ],
    datos: [...VERIFICADOS, 'pleno-findings.json'],
  },
  {
    orden: 'promote-report',
    script: 'promote-report.ts',
    argv: ['una-asignacion', '--curator', ROL],
    datos: ['journalist-reports.json', 'promises.json'],
  },
  {
    orden: 'correct-journalist-report',
    script: 'correct-journalist-report.ts',
    argv: [
      'un-informe',
      '--field',
      'title',
      '--new',
      'Un título',
      '--reason',
      MOTIVO,
      '--editor',
      ROL,
    ],
    datos: ['journalist-reports.json'],
  },
  {
    orden: 'journalist-reply',
    script: 'apply-journalist-response.ts',
    argv: ['un-informe', RESPONSE_BLOCS[0], CITA],
    datos: ['journalist-reports.json'],
  },
  {
    orden: 'journalist:archive',
    script: 'journalist-archive.ts',
    argv: ['una-asignacion', '--superseded-by', 'otra', '--reason', MOTIVO, '--curator', ROL],
    datos: ['journalist-reports.json', 'journalist-assignments.json'],
    dryRun: true,
  },
  {
    orden: 'journalist:archive-sources',
    script: 'journalist-archive-sources.ts',
    argv: ['una-asignacion'],
    datos: ['journalist-reports.json'],
    dryRun: true,
  },
  {
    orden: 'subir-veredicto',
    script: 'subir-veredicto.ts',
    argv: ['una-declaracion', 'parcial', '--resumen', CITA, '--editor', PERSONA],
    datos: VERIFICADOS,
    dryRun: true,
  },
  {
    orden: 'corregir-rotulo-motor',
    script: 'corregir-rotulo-motor.ts',
    argv: ['--ids', 'ids.txt', '--reason', MOTIVO, '--editor', PERSONA],
    datos: VERIFICADOS,
    fuera: ['ids.txt'],
    dryRun: true,
  },
]

/** Lo que se planta en el directorio para que nada salga a la red ni a un modelo. */
const SIN_RED = `import { appendFileSync } from 'node:fs'
globalThis.fetch = async (url) => {
  appendFileSync(process.env.FETCH_LOG, String(url) + '\\n')
  throw new Error('sin red en la prueba')
}
`
const BINARIO_FALSO = (dir: string, nombre: string) =>
  `#!/bin/sh\nprintf '%s %s\\n' '${nombre}' "$*" >> '${join(dir, 'llamadas.log')}'\nexit 1\n`

/** Un directorio temporal con los datos del caso ilegibles. */
function montar(caso: Caso): string {
  const dir = mkdtempSync(join(tmpdir(), 'opcion-desconocida-'))
  const escribir = (destino: string, contenido: string) => {
    mkdirSync(dirname(destino), { recursive: true })
    writeFileSync(destino, contenido)
  }
  for (const r of caso.datos ?? []) escribir(join(dir, 'public/data', r), ILEGIBLE)
  for (const r of caso.fuera ?? []) escribir(join(dir, r), ILEGIBLE)
  for (const [r, c] of Object.entries(caso.extra ?? {})) escribir(join(dir, r), c)
  writeFileSync(join(dir, 'sin-red.mjs'), SIN_RED)
  mkdirSync(join(dir, 'bin'))
  for (const b of ['npx', 'claude', 'agy', 'gemini']) {
    writeFileSync(join(dir, 'bin', b), BINARIO_FALSO(dir, b), { mode: 0o755 })
  }
  return dir
}

/**
 * La ruta del script que se lanza: el del repositorio o, si lee sus datos desde
 * su carpeta, una copia bajo `dir` con `src/` enlazado.
 */
function rutaDelScript(caso: Caso, dir: string): string {
  if (!caso.copia) return join(RAIZ, 'scripts', caso.script)
  mkdirSync(join(dir, 'scripts'))
  copyFileSync(join(RAIZ, 'scripts', caso.script), join(dir, 'scripts', caso.script))
  symlinkSync(join(RAIZ, 'src'), join(dir, 'src'), 'dir')
  copyFileSync(join(RAIZ, 'package.json'), join(dir, 'package.json'))
  return join(dir, 'scripts', caso.script)
}

function lanzar(caso: Caso, dir: string, argv: string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [TSX, rutaDelScript(caso, dir), ...argv], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      PATH: `${join(dir, 'bin')}:${process.env.PATH ?? ''}`,
      HOME: process.env.HOME ?? '',
      TMPDIR: process.env.TMPDIR ?? tmpdir(),
      NODE_OPTIONS: `--import ${join(dir, 'sin-red.mjs')}`,
      FETCH_LOG: join(dir, 'red.log'),
      LLM_BACKEND: 'claude-code',
      CLAUDE_CODE_BIN: join(dir, 'bin', 'claude'),
      AGY_BIN: join(dir, 'bin', 'agy'),
      GEMINI_BIN: join(dir, 'bin', 'gemini'),
      RUN_MANIFEST_DIR: join(dir, '.run-manifests'),
    },
    timeout: 60_000,
  })
}

/** Cada fichero del directorio con la huella de sus bytes, salvo el andamiaje. */
function huella(dir: string): Record<string, string> {
  const andamiaje = new Set(['bin', 'scripts', 'src', 'package.json', 'sin-red.mjs'])
  const out: Record<string, string> = {}
  const recorrer = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (d === dir && andamiaje.has(e.name)) continue
      if (e.isSymbolicLink()) continue
      if (e.isDirectory()) recorrer(p)
      else out[relative(dir, p)] = createHash('sha256').update(readFileSync(p)).digest('hex')
    }
  }
  recorrer(dir)
  return out
}

function limpiar(dir: string): void {
  try {
    if (lstatSync(join(dir, 'src')).isSymbolicLink()) unlinkSync(join(dir, 'src'))
  } catch {
    // No había enlace.
  }
  rmSync(dir, { recursive: true, force: true })
}

/** Las opciones malas de un caso: la que se supone (o su errata) y una inventada. */
const malas = (caso: Caso): string[] => [caso.dryRun ? '--dryrun' : '--dry-run', '--nonsense']

function seNiega(caso: Caso, mala: string, mensaje: RegExp): void {
  const dir = montar(caso)
  try {
    const antes = huella(dir)
    const r = lanzar(caso, dir, [...caso.argv, mala])
    const salida = `${r.stdout}\n${r.stderr}`
    expect(r.status, salida).toBe(2)
    expect(r.stderr, salida).toMatch(mensaje)
    expect(huella(dir), 'no escribe nada').toEqual(antes)
    expect(existsSync(join(dir, 'red.log')), 'no sale a la red').toBe(false)
    expect(existsSync(join(dir, 'llamadas.log')), 'no llama a npx ni a un modelo').toBe(false)
  } finally {
    limpiar(dir)
  }
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

describe('una opción desconocida se rechaza antes de leer nada', () => {
  for (const caso of ABIERTOS) {
    describe(caso.orden, () => {
      it.each(malas(caso))('con %s sale con 2, lo dice y no escribe', (mala) => {
        seNiega(caso, mala, new RegExp(`opción desconocida: ${escapar(mala)}\\b`))
      })
    })
  }

  it('el mensaje dice qué admite, o que no admite ninguna', () => {
    const conOpciones = ABIERTOS.find((c) => c.orden === 'reclassify-claim')!
    const dir = montar(conOpciones)
    try {
      const r = lanzar(conOpciones, dir, [...conOpciones.argv, '--dry-run'])
      expect(r.stderr).toMatch(/Admite: .*--reason <valor>.*--editor <valor>/)
      expect(r.stderr).toMatch(/no tiene modo de prueba/)
    } finally {
      limpiar(dir)
    }
    const posicional = ABIERTOS.find((c) => c.orden === 'finding-reply')!
    const dir2 = montar(posicional)
    try {
      const r = lanzar(posicional, dir2, [...posicional.argv, '--dry-run'])
      expect(r.stderr).toMatch(/No admite ninguna opción/)
    } finally {
      limpiar(dir2)
    }
  })
})

describe('los que ya la rechazaban siguen rechazándola', () => {
  for (const caso of CERRADOS) {
    describe(caso.orden, () => {
      it.each(malas(caso))('con %s sale con 2, la nombra y no escribe', (mala) => {
        seNiega(caso, mala, new RegExp(escapar(mala)))
      })
    })
  }
})

/**
 * Las órdenes que nombra CURATED, sacadas de su texto: `npm run a / b / c`,
 * `npm run d -- …`, `… · npm run e`. Las que no escriben el curado se dicen aquí
 * con su porqué.
 */
const NO_ESCRIBEN_EL_CURADO: Record<string, string> = {
  'scrape:borme': 'trae material a .cache/; lo que se publica de una empresa lo firma una persona',
}

function ordenesDeCurated(): string[] {
  const out = new Set<string>()
  for (const texto of Object.values(CURATED as Record<string, string>)) {
    for (const m of texto.matchAll(/npm run ([^·()]+)/g)) {
      const tramo = m[1].split(' -- ')[0]
      for (const parte of tramo.split(' / ')) {
        const nombre = parte.trim().split(/\s+/)[0]
        if (nombre) out.add(nombre)
      }
    }
  }
  return [...out]
}

describe('cobertura', () => {
  const cubiertas = new Set([...ABIERTOS, ...CERRADOS].map((c) => c.orden))
  const ordenes = ordenesDeCurated()

  it('se leen órdenes de CURATED', () => {
    expect(ordenes.length).toBeGreaterThan(20)
    expect(ordenes).toContain('reclassify-claim')
    expect(ordenes).toContain('roster-correction')
    expect(ordenes).toContain('competencia-reply')
  })

  it.each(ordenes)('«%s» está en la tabla, o se dice por qué no', (orden) => {
    if (orden in NO_ESCRIBEN_EL_CURADO) return
    expect(SCRIPTS_NPM[orden], `${orden} no está en package.json`).toBeTruthy()
    expect(cubiertas.has(orden), `${orden} escribe un curado y no tiene caso aquí`).toBe(true)
  })

  it.each([...ABIERTOS, ...CERRADOS].filter((c) => c.orden in SCRIPTS_NPM))(
    '$orden lanza el script de la tabla',
    (caso) => {
      expect(SCRIPTS_NPM[caso.orden]).toContain(`scripts/${caso.script}`)
    },
  )
})
