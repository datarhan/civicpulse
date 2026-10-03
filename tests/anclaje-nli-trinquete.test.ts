import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { mergeVerified } from '../src/scraper/verified-merge'
import { shortlistCandidates } from '../src/scraper/claim-verifier'

/**
 * Lo que hace `verify:pleno-claims:nli` con una declaración que ya retractó una
 * etapa que sólo baja.
 *
 * El anclaje NLI elige sus candidatas entre los `sin-datos` PUBLICADOS. Uno de
 * ésos puede ser el de la base —lo que el anclaje existe para mirar— o una
 * retractación: la del motor de veredictos, o la de un curador que escribió por
 * qué la evidencia no sostenía la afirmación. Hasta el 30-09-2026 el guion no
 * distinguía unas de otras: una pasada lanzada después volvía a puntuar lo que
 * un curador o el motor habían bajado. Ahora las aparta antes de puntuar
 * (`motivoParaNoProponer`), y lo que propone no llega al overlay: espera una
 * firma en la cola (`exigeFirma`, src/scraper/trinquete.ts).
 *
 * De punta a punta a propósito: lo que se prueba es a quién le pregunta el guion
 * y qué dice su parte, y eso vive en la costura entre el overlay que carga, la
 * selección y lo que imprime. Que el overlay no acepte una subida lo prueban
 * tests/entrada-de-pasada.test.ts («una subida nunca sustituye una
 * retractación») y tests/trinquete.test.ts (`exigeFirma`).
 *
 * Las filas son de verdad (tests/fixtures/anclaje-nli-trinquete_2026-09-30.json).
 * Lo único falso es el modelo: un `python` en el sitio del venv que puntúa BAJO
 * todo par y apunta qué afirmación le llegó. Aquí no se mide qué se propone sino
 * a quién se pregunta. Hasta el 30-09-2026 daba igual cómo puntuara: el `lookup`
 * del guion guardaba cada puntuación con el id global del par (`<claim>#<i>`) y
 * `verifyClaimWithNli` la busca por el índice (`<i>`), así que no le llegaba
 * ninguna. Medido con este mismo falso puntuando 0,95: `propuestas 0 · sin
 * respaldo 1`, un «sin respaldo» que el modelo no dijo. Ahora le llegan, y el
 * parte dice cuántas leyó de cuántas pidió; lo que se propone con ellas lo
 * prueba tests/anclaje-nli-puntuaciones.test.ts.
 */

const SCRIPT = resolve('scripts/verify-pleno-claims-nli.ts')
// tsx por su ruta: `npx` desde una caja de arena sin node_modules lo bajaría de
// la red.
const TSX = resolve('node_modules/.bin/tsx')
const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/anclaje-nli-trinquete_2026-09-30.json'), 'utf8'),
)

/** curator-downgrade → sin-datos: el curador descartó la única evidencia. */
const DEL_CURADOR = '15uvjew-137-afi-3bd4bc'
/** verdict-engine → sin-datos. */
const DEL_MOTOR = '1237hbp-091-afi-a7c5f4'
/** curator-downgrade → parcial: sólo la alcanza una lista explícita. */
const PARCIAL_DEL_CURADOR = '1sqj7is-053-pro-68944b'
/** El control: el sin-datos de la base, sin entrada en el overlay. */
const DE_LA_BASE = '1xmr0do-016-afi-ff77f6'

/**
 * El `python` del venv, falso. `nli-client.ts` le pasa los pares en JSONL por
 * la entrada y lee las puntuaciones por la salida; éste apunta cada hipótesis
 * —el literal de la declaración— en `CALL_LOG`.
 */
const NLI_FALSO = `#!/usr/bin/env node
const { appendFileSync } = require('node:fs')
let entrada = ''
process.stdin.on('data', (d) => (entrada += d))
process.stdin.on('end', () => {
  for (const linea of entrada.split('\\n')) {
    if (!linea.trim()) continue
    const par = JSON.parse(linea)
    appendFileSync(process.env.CALL_LOG, par.hypothesis + '\\n')
    process.stdout.write(
      JSON.stringify({ id: par.id, entailment: 0.05, neutral: 0.9, contradiction: 0.05, label: 'neutral' }) + '\\n',
    )
  }
})
`

// Arranca el guion de verdad (~3 s con tsx); el tope de 5 s de vitest no da.
vi.setConfig({ testTimeout: 60_000 })

const cajas: string[] = []
afterAll(() => {
  for (const c of cajas) rmSync(c, { recursive: true, force: true })
})

interface Corrida {
  status: number | null
  stdout: string
  stderr: string
  /** Los literales que le llegaron al NLI, uno por par puntuado. */
  preguntadas: string[]
}

/** Una caja de arena con la fixture publicada tal y como la compone `rebuildVerified`. */
function correr(args: (caja: string) => string[]): Corrida {
  const caja = mkdtempSync(join(tmpdir(), 'anclaje-nli-trinquete-'))
  cajas.push(caja)
  const data = join(caja, 'public/data')
  mkdirSync(join(data, 'pleno-claims'), { recursive: true })
  mkdirSync(join(data, 'pleno-transcripts'), { recursive: true })
  const venv = join(caja, '.local/civicpulse-nli/venv/bin')
  mkdirSync(venv, { recursive: true })

  const escribir = (ruta: string, valor: unknown) =>
    writeFileSync(join(data, ruta), JSON.stringify(valor, null, 2) + '\n')
  escribir('pleno-claims-verified-base.json', FIXTURE.base)
  escribir('pleno-claims-overlay.json', FIXTURE.overlay)
  escribir('pleno-claims-verified.json', {
    generatedAt: FIXTURE.base.generatedAt,
    items: mergeVerified(FIXTURE.base.items, FIXTURE.overlay),
  })
  escribir('tenders.json', FIXTURE.tenders)
  for (const [pleno, texto] of Object.entries(FIXTURE.transcripciones)) {
    writeFileSync(join(data, 'pleno-transcripts', `${pleno}.txt`), texto as string)
  }
  writeFileSync(join(venv, 'python'), NLI_FALSO, { mode: 0o755 })

  const log = join(caja, 'pares.log')
  const res = spawnSync(TSX, [SCRIPT, ...args(caja)], {
    cwd: caja,
    encoding: 'utf8',
    // Un entorno limpio. HOME apunta a la caja porque ahí busca el venv
    // `nli-client.ts` (~/.local/civicpulse-nli/venv): así contesta el falso y no
    // el modelo de quien corre la prueba.
    env: {
      PATH: process.env.PATH,
      HOME: caja,
      TMPDIR: process.env.TMPDIR,
      VERIFIER_SHORTLIST: 'lexical',
      CALL_LOG: log,
    },
    timeout: 120_000,
  })
  let preguntadas: string[] = []
  try {
    preguntadas = readFileSync(log, 'utf8').split('\n').filter(Boolean)
  } catch {
    preguntadas = []
  }
  return { status: res.status, stdout: res.stdout, stderr: res.stderr, preguntadas }
}

/** Escribe una lista de ids para `--claimIds` y devuelve su ruta. */
const lista = (ids: string[]) => (caja: string) => {
  const ruta = join(caja, 'ids.txt')
  writeFileSync(ruta, ids.join('\n') + '\n')
  return ['--claimIds', ruta]
}

const literal = (id: string): string =>
  FIXTURE.base.items.find((it: { claim: { id: string } }) => it.claim.id === id).claim.verbatim

describe('las filas de la fixture', () => {
  it('las cuatro tienen candidatos: si alguna no se puntúa, no es por la recuperación', () => {
    // Sin esto, «no llegó al NLI» podría ser «la shortlist vino vacía», que
    // es el modo 13 de docs/DATA_INTEGRITY.md y no dice nada del trinquete.
    for (const id of [DEL_CURADOR, DEL_MOTOR, PARCIAL_DEL_CURADOR, DE_LA_BASE]) {
      const claim = FIXTURE.base.items.find(
        (it: { claim: { id: string } }) => it.claim.id === id,
      ).claim
      const candidatos = shortlistCandidates(
        {
          claim,
          tenders: FIXTURE.tenders,
          tendersTed: null,
          bdns: null,
          budget: null,
          promises: null,
          priorClaims: [],
        },
        8,
      )
      expect(candidatos.length, `${id} sin candidatos`).toBeGreaterThan(0)
    }
  })
})

describe('verify:pleno-claims:nli, barrido de los sin-datos publicados', () => {
  let r: Corrida
  beforeAll(() => {
    r = correr(() => [])
  })

  it('termina bien, y el NLI falso puntuó la declaración de control', () => {
    expect(r.status, r.stderr).toBe(0)
    // El control: sin esto, lo de abajo se cumpliría con un NLI que nunca
    // contestó.
    expect(r.preguntadas).toContain(literal(DE_LA_BASE))
  })

  it('no le pregunta al NLI por lo que retractó un curador ni por lo que retractó el motor', () => {
    expect(r.preguntadas, 'la retractación del curador llegó al NLI').not.toContain(
      literal(DEL_CURADOR),
    )
    expect(r.preguntadas, 'la retractación del motor llegó al NLI').not.toContain(
      literal(DEL_MOTOR),
    )
  })

  it('y el parte las cuenta aparte, con la etapa que las retractó', () => {
    const linea = r.stdout.split('\n').find((l) => /no se proponen/.test(l)) ?? ''
    expect(linea, r.stdout).toMatch(/\b2 no se proponen/)
    expect(linea).toMatch(/\b1 retractada por «[^»]+» \(curator-downgrade\)/)
    expect(linea).toMatch(/\b1 retractada por «[^»]+» \(verdict-engine\)/)
  })
})

describe('verify:pleno-claims:nli --claimIds', () => {
  let r: Corrida
  beforeAll(() => {
    r = correr(lista([PARCIAL_DEL_CURADOR, DE_LA_BASE, 'no-existe-000-afi-000000']))
  })

  it('puntúa la de la base y no el parcial que firmó un curador', () => {
    expect(r.status, r.stderr).toBe(0)
    expect(r.preguntadas).toContain(literal(DE_LA_BASE))
    expect(r.preguntadas).not.toContain(literal(PARCIAL_DEL_CURADOR))
  })

  it('la retractada sale como retractada, no como «sin localizar»', () => {
    const cuenta = r.stdout.split('\n').find((l) => /lista explícita/.test(l)) ?? ''
    expect(cuenta, r.stdout).toMatch(/2 encontrada/)
    expect(cuenta).toMatch(/1 sin localizar/)
    const sinLocalizar = r.stdout.split('\n').find((l) => /sin localizar:/.test(l)) ?? ''
    expect(sinLocalizar).toContain('no-existe-000-afi-000000')
    expect(sinLocalizar).not.toContain(PARCIAL_DEL_CURADOR)
    const retractadas = r.stdout.split('\n').find((l) => /retractadas:/.test(l)) ?? ''
    expect(retractadas, r.stdout).toContain(PARCIAL_DEL_CURADOR)
  })
})

describe('verify:pleno-claims:nli --claimIds, todas retractadas', () => {
  let r: Corrida
  beforeAll(() => {
    r = correr(lista([PARCIAL_DEL_CURADOR, DEL_CURADOR]))
  })

  it('no le pregunta nada al NLI y sale con error: no ha hecho lo que se le pidió', () => {
    expect(r.preguntadas).toEqual([])
    // Con la cola vacía, la guarda de «ninguna juzgada» no salta: se pidieron
    // filas concretas y no se hizo nada con ninguna, que no es un «ya está».
    expect(r.status, r.stdout).toBe(1)
    expect(r.stderr).toMatch(/retract/)
  })
})
