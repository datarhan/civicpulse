import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { shortlistCandidates, type VerifierInputs } from '../src/scraper/claim-verifier'
import { shouldSkipLlmVerification } from '../src/scraper/claim-verifier-llm'
import { verifyClaimWithNli } from '../src/scraper/claim-verifier-nli'
import {
  actualizarCola,
  sugerenciaDelAnclaje,
  COLA_SUGERENCIAS_NLI,
  type ColaDeSugerencias,
} from '../src/scraper/entrada-de-pasada'
import type { PlenoClaim } from '../src/scraper/pleno-claim'

/**
 * Lo que hace `verify:pleno-claims:nli` con las puntuaciones que le devuelve el
 * modelo.
 *
 * Hasta el 30-09-2026 no le llegaba ninguna al verificador. El runner puntúa en
 * un solo proceso los pares de todo un tramo, con el id global `<claim>#<i>`; el
 * `lookup` de cada declaración las encontraba, pero las devolvía guardadas con
 * ESE id, y `verifyClaimWithNli` las pide por el índice (`<i>`). Toda fila salía
 * «sin respaldo» —un juicio que nadie hizo—, la corrida terminaba bien y el
 * anclaje no subió ni propuso nada nunca (desde 325a1c62, 23-06-2026). Con la
 * cola humana de #201, además, cada una de esas filas «re-juzgadas» habría
 * sacado de la cola la propuesta que tuviera.
 *
 * El arnés de evaluación no lo veía: `makeNliVerifier` llama a `scoreNliPairs`
 * con los ids locales, así que la precisión medida en la fase 2 es la de un
 * camino que el runner no usa. Por eso aquí corre el GUION, con filas de verdad
 * (tests/fixtures/anclaje-nli-puntuaciones_2026-09-30.json). Lo único falso es
 * el modelo: un `python` en el sitio del venv que contesta como
 * scripts/nli/nli_score.py —una línea por par, con el id que recibió— y puntúa
 * por el CONTENIDO del par, como puntuaría un modelo.
 *
 * Y el parte tiene que demostrar que leyó (regla 2 de docs/DATA_INTEGRITY.md):
 * una fila es «sin respaldo» sólo si se leyeron todas sus puntuaciones. Si
 * alguna no volvió, la fila no se juzga, su propuesta en la cola se queda como
 * estaba y la corrida sale con error.
 */

const SCRIPT = resolve('scripts/verify-pleno-claims-nli.ts')
// tsx por su ruta: `npx` desde una caja de arena sin node_modules lo bajaría de
// la red.
const TSX = resolve('node_modules/.bin/tsx')
const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/anclaje-nli-puntuaciones_2026-09-30.json'), 'utf8'),
)
const CLAIM = FIXTURE.item.claim as PlenoClaim
const LICITACIONES = FIXTURE.tenders.tenders as { title: string; permalink: string }[]
/**
 * La licitación que el modelo falso respalda: la SEGUNDA de la lista corta, para
 * que una puntuación casada con el candidato equivocado no acierte por azar.
 */
const RESPALDADA = LICITACIONES[1]

/**
 * El `python` del venv, falso. `nli-client.ts` le pasa los pares en JSONL por la
 * entrada y lee las puntuaciones por la salida. Apunta el id de cada par en
 * `CALL_LOG`. Puntúa alto el par cuya premisa contiene `NLI_ALTO` y bajo el
 * resto; con `NLI_OTRO_ID` contesta con ids que nadie le mandó.
 */
const NLI_FALSO = `#!/usr/bin/env node
const { appendFileSync } = require('node:fs')
let entrada = ''
process.stdin.on('data', (d) => (entrada += d))
process.stdin.on('end', () => {
  for (const linea of entrada.split('\\n')) {
    if (!linea.trim()) continue
    const par = JSON.parse(linea)
    appendFileSync(process.env.CALL_LOG, par.id + '\\n')
    const alto = Boolean(process.env.NLI_ALTO) && par.premise.includes(process.env.NLI_ALTO)
    const puntos = alto
      ? { entailment: 0.95, neutral: 0.03, contradiction: 0.02, label: 'entailment' }
      : { entailment: 0.05, neutral: 0.9, contradiction: 0.05, label: 'neutral' }
    const id = process.env.NLI_OTRO_ID ? 'otro:' + par.id : par.id
    process.stdout.write(JSON.stringify({ id, ...puntos }) + '\\n')
  }
})
`

// Arranca el guion de verdad (~3 s con tsx).
const TOPE = 120_000

const inputsDe = (claim: PlenoClaim): VerifierInputs => ({
  claim,
  tenders: FIXTURE.tenders,
  tendersTed: null,
  bdns: null,
  budget: null,
  promises: null,
  priorClaims: [],
})

/**
 * Una cola que ya propone subir la declaración, construida con las funciones
 * del runner y no escrita a mano: la del verificador puntuado por el camino de
 * los ids locales, que siempre funcionó.
 */
async function colaQueLaPropone(): Promise<ColaDeSugerencias> {
  const r = await verifyClaimWithNli(
    { claim: CLAIM, candidates: shortlistCandidates(inputsDe(CLAIM), 8) },
    async (pares) =>
      new Map(
        pares.map((p) => [
          p.id,
          {
            id: p.id,
            entailment: 0.95,
            neutral: 0.03,
            contradiction: 0.02,
            label: 'entailment' as const,
          },
        ]),
      ),
  )
  const s = sugerenciaDelAnclaje({ r, desde: 'sin-datos' })
  if (!s) throw new Error('la cola de partida no propone la declaración')
  return actualizarCola(null, [CLAIM.id], [s], '2026-09-29T00:00:00.000Z')
}

const cajas: string[] = []
afterAll(() => {
  for (const c of cajas) rmSync(c, { recursive: true, force: true })
})

interface Corrida {
  status: number | null
  stdout: string
  stderr: string
  /** Los ids de los pares que le llegaron al modelo. */
  pares: string[]
  /** La cola tras la corrida, en texto; `null` si no existe. */
  cola: string | null
  /** La cola antes de la corrida, en texto; `null` si no había. */
  colaAntes: string | null
  verificadoAntes: string
  verificadoDespues: string
  overlayCreado: boolean
}

function correr(opts: { env?: Record<string, string>; cola?: ColaDeSugerencias }): Corrida {
  const caja = mkdtempSync(join(tmpdir(), 'anclaje-nli-puntuaciones-'))
  cajas.push(caja)
  const data = join(caja, 'public/data')
  mkdirSync(data, { recursive: true })
  const venv = join(caja, '.local/civicpulse-nli/venv/bin')
  mkdirSync(venv, { recursive: true })

  const verificado = join(data, 'pleno-claims-verified.json')
  const verificadoAntes =
    JSON.stringify({ generatedAt: '2026-09-30T00:00:00.000Z', items: [FIXTURE.item] }, null, 2) +
    '\n'
  writeFileSync(verificado, verificadoAntes)
  writeFileSync(join(data, 'tenders.json'), JSON.stringify(FIXTURE.tenders, null, 2) + '\n')
  writeFileSync(join(venv, 'python'), NLI_FALSO, { mode: 0o755 })

  const rutaCola = join(caja, COLA_SUGERENCIAS_NLI)
  let colaAntes: string | null = null
  if (opts.cola) {
    mkdirSync(dirname(rutaCola), { recursive: true })
    colaAntes = JSON.stringify(opts.cola, null, 2) + '\n'
    writeFileSync(rutaCola, colaAntes)
  }

  const log = join(caja, 'pares.log')
  const res = spawnSync(TSX, [SCRIPT], {
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
      ...opts.env,
    },
    timeout: TOPE,
  })
  const leer = (ruta: string) => (existsSync(ruta) ? readFileSync(ruta, 'utf8') : null)
  return {
    status: res.status,
    stdout: res.stdout,
    stderr: res.stderr,
    pares: (leer(log) ?? '').split('\n').filter(Boolean),
    cola: leer(rutaCola),
    colaAntes,
    verificadoAntes,
    verificadoDespues: readFileSync(verificado, 'utf8'),
    overlayCreado: existsSync(join(data, 'pleno-claims-overlay.json')),
  }
}

/** La línea final del parte, la que cuenta cada fila. */
const hecho = (r: Corrida) => r.stdout.split('\n').find((l) => l.includes('done.')) ?? ''
/** La línea que dice cuántas puntuaciones se leyeron de las que se pidieron. */
const leidas = (r: Corrida) => r.stdout.split('\n').find((l) => /puntuaciones leídas/.test(l)) ?? ''

describe('la fixture', () => {
  it('la declaración entra en la pasada y su lista corta son las dos licitaciones, en orden', () => {
    // Sin esto, «no se propuso» podría ser «no se eligió» o «no tuvo
    // candidatos» (el modo 13 de docs/DATA_INTEGRITY.md), no la puntuación.
    expect(FIXTURE.item.verification.verdict).toBe('sin-datos')
    expect(shouldSkipLlmVerification(CLAIM)).toBe(false)
    const candidatos = shortlistCandidates(inputsDe(CLAIM), 8)
    expect(candidatos.map((c) => c.ref)).toEqual(LICITACIONES.map((t) => t.permalink))
  })

  it('el modelo falso respalda sólo la segunda', () => {
    const candidatos = shortlistCandidates(inputsDe(CLAIM), 8)
    const respaldados = candidatos.filter((c) => c.snippet.includes(RESPALDADA.title))
    expect(respaldados.map((c) => c.ref)).toEqual([RESPALDADA.permalink])
  })
})

describe('verify:pleno-claims:nli con un modelo que respalda la segunda licitación', () => {
  let r: Corrida
  beforeAll(() => {
    r = correr({ env: { NLI_ALTO: RESPALDADA.title } })
  }, TOPE)

  it('termina bien, y el modelo puntuó los dos pares', () => {
    expect(r.status, r.stderr).toBe(0)
    expect(r.pares).toHaveLength(2)
  })

  it('deja en la cola humana la propuesta de subirla, citando la licitación respaldada', () => {
    expect(r.cola, r.stdout).not.toBeNull()
    const cola = JSON.parse(r.cola!) as ColaDeSugerencias
    expect(Object.keys(cola.entries)).toEqual([CLAIM.id])
    const fila = cola.entries[CLAIM.id]
    expect(fila.requiresHumanApproval).toBe(true)
    expect(fila.source).toBe('nli')
    expect(fila.desde).toBe('sin-datos')
    expect(fila.verification.verdict).toBe('verificado')
    expect(fila.verification.evidence.map((e) => e.ref)).toEqual([RESPALDADA.permalink])
    // Contra qué se cotejó, derivado de la evidencia; la pasada, en derivedBy.
    expect(fila.verification.checkedAgainst).toEqual(['tenders'])
    expect(fila.verification.derivedBy).toEqual(['nli-grounding'])
  })

  it('el parte dice que leyó las puntuaciones y que la propuso', () => {
    expect(leidas(r), r.stdout).toMatch(/puntuaciones leídas 2 de 2\b/)
    const linea = hecho(r)
    expect(linea, r.stdout).toMatch(/\bjuzgadas 1\b/)
    expect(linea).toMatch(/\bpropuestas 1\b/)
    expect(linea).toMatch(/\bsin respaldo 0\b/)
    expect(linea).toMatch(/\bsin puntuar 0\b/)
  })

  it('no publica nada: ni overlay ni cambio en lo verificado', () => {
    expect(r.overlayCreado).toBe(false)
    expect(r.verificadoDespues).toBe(r.verificadoAntes)
  })
})

describe('verify:pleno-claims:nli con un modelo que no respalda nada', () => {
  let r: Corrida
  beforeAll(async () => {
    r = correr({ cola: await colaQueLaPropone() })
  }, TOPE)

  it('termina bien: la juzgó con sus dos puntuaciones y no la ve respaldada', () => {
    expect(r.status, r.stderr).toBe(0)
    expect(r.pares).toHaveLength(2)
    expect(leidas(r), r.stdout).toMatch(/puntuaciones leídas 2 de 2\b/)
    const linea = hecho(r)
    expect(linea, r.stdout).toMatch(/\bjuzgadas 1\b/)
    expect(linea).toMatch(/\bsin respaldo 1\b/)
    expect(linea).toMatch(/\bsin puntuar 0\b/)
  })

  it('y como la juzgó, su propuesta anterior sale de la cola', () => {
    expect(r.colaAntes).not.toBeNull()
    const cola = JSON.parse(r.cola!) as ColaDeSugerencias
    expect(cola.entries[CLAIM.id]).toBeUndefined()
  })
})

describe('verify:pleno-claims:nli cuando no vuelve ninguna puntuación', () => {
  let r: Corrida
  beforeAll(async () => {
    r = correr({ env: { NLI_OTRO_ID: '1' }, cola: await colaQueLaPropone() })
  }, TOPE)

  it('los pares salieron hacia el modelo', () => {
    // El control: sin esto, lo de abajo se cumpliría con un guion que nunca
    // llegó a preguntar.
    expect(r.pares).toHaveLength(2)
  })

  it('no cuenta la fila como juzgada: sin puntuar, no «sin respaldo»', () => {
    expect(leidas(r), r.stdout).toMatch(/puntuaciones leídas 0 de 2\b/)
    const linea = hecho(r)
    expect(linea, r.stdout).toMatch(/\bjuzgadas 0\b/)
    expect(linea).toMatch(/\bsin respaldo 0\b/)
    expect(linea).toMatch(/\bsin puntuar 1\b/)
  })

  it('deja la cola como estaba', () => {
    expect(r.cola).toBe(r.colaAntes)
  })

  it('y sale con error: no ha hecho lo que se le pidió', () => {
    expect(r.status, r.stdout).toBe(1)
    expect(r.stderr).toMatch(/sin puntuación/)
  })
})
