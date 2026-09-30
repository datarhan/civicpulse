import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { mergeVerified, type Overlay } from '../src/scraper/verified-merge'

/**
 * Lo que escribe `verify:pleno-claims:engine` de una declaración que el modelo
 * nunca vio, y de una que sí juzgó.
 *
 * El 24-06-2026 la pasada escribió como «verdict-engine re-judged
 * verificado→sin-datos» declaraciones sin un solo candidato: el verificador las
 * devolvía con el veredicto del determinista (`sin-datos`), y la rama de
 * retractar iba antes que la de `skippedIds`. La tarjeta dice desde entonces
 * «Veredicto: verificador LLM» sobre algo que ningún modelo leyó (regla 2 de
 * docs/DATA_INTEGRITY.md). Y las que el modelo SÍ juzgó salieron con la frase del
 * determinista, «No se encontró registro en tenders / BDNS / presupuesto…», en
 * vez de su razonamiento: en el modo por defecto el verificador devolvía el
 * veredicto determinista cuando el motor decía `sin-datos`.
 *
 * Es de punta a punta a propósito: los dos defectos viven en la costura entre el
 * verificador, el bucle del guion y lo que acaba en el overlay y en el parte. Las
 * filas son de verdad (tests/fixtures/motor-de-veredictos_2026-09-29.json): la
 * promesa de VOX sobre el cheque escolar se retractó así el 24-06 sin llamada al
 * modelo; la frase del PSOE sobre la carta de servicios la juzgó gpt-5.4-mini y
 * guardó la frase del determinista. Lo único falso es el modelo, un `gemini`
 * que contesta al instante y apunta qué declaración le llegó.
 *
 * `RUN_MANIFEST_DIR` apunta a la caja de arena: `.run-manifests/` es toda la
 * entrada de `check:runs`, y un parte de prueba allí sería un rojo de verdad.
 */

const SCRIPT = resolve('scripts/verify-pleno-claims-engine.ts')
// tsx por su ruta: `npx` desde una caja de arena sin node_modules lo bajaría de
// la red.
const TSX = resolve('node_modules/.bin/tsx')
const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/motor-de-veredictos_2026-09-29.json'), 'utf8'),
)

const SIN_CANDIDATOS = 'k4olcs-050-pro-f60a00'
const JUZGADA = 'k4olcs-008-afi-843b2a'
const SIN_DECLARACION = 'rx4hb4-446-cit-317f4b'

/** Lo que el modelo falso razona sobre la única declaración con candidatos. */
const RAZONAMIENTO =
  'El único candidato es un contrato menor de 2018 para redactar la «Carta de servicios ' +
  'municipal»; no dice nada de que la carta se adapte por cambios en sus indicadores, así que ' +
  'no respalda la afirmación.'

/**
 * Un `gemini` que contesta sin red. La extracción se reconoce por la última
 * línea de su prompt («Emite el JSON {verdict, cites}.»); todo lo demás es el
 * paso de razonar. Apunta cada llamada con el literal de la declaración, para
 * poder decir cuál llegó al modelo y cuál no.
 */
const GEMINI_FALSO = `#!/usr/bin/env node
const { appendFileSync } = require('node:fs')
const prompt = process.argv[3] || ''
const extraccion = prompt.includes('Emite el JSON {verdict, cites}')
const literal = (prompt.match(/verbatim: "([^"]*)"/) || [])[1] || '?'
appendFileSync(process.env.CALL_LOG, (extraccion ? 'extract' : 'reason') + '\\t' + literal + '\\n')
const respuesta = extraccion
  ? { verdict: 'sin-datos', cites: [] }
  : { reasoning: ${JSON.stringify(RAZONAMIENTO)} }
process.stdout.write(JSON.stringify({
  response: JSON.stringify(respuesta),
  stats: { models: { prueba: { tokens: { input: 120, candidates: 40 } } } },
}))
`

// Arranca el guion de verdad (~3 s con tsx); el tope de 5 s de vitest no da.
vi.setConfig({ testTimeout: 60_000 })

let caja: string
let res: ReturnType<typeof spawnSync>
let overlay: Overlay
let parte: Record<string, any>
let llamadas: string[]

beforeAll(() => {
  caja = mkdtempSync(join(tmpdir(), 'motor-sin-juicio-'))
  const data = join(caja, 'public/data')
  mkdirSync(join(data, 'pleno-claims'), { recursive: true })
  mkdirSync(join(data, 'pleno-transcripts'), { recursive: true })
  mkdirSync(join(caja, 'bin'))
  mkdirSync(join(caja, 'partes'))

  const escribir = (ruta: string, valor: unknown) =>
    writeFileSync(join(data, ruta), JSON.stringify(valor, null, 2) + '\n')
  escribir('pleno-claims-verified-base.json', FIXTURE.base)
  escribir('pleno-claims-overlay.json', FIXTURE.overlay)
  // Lo publicado es base ⊕ overlay, como lo compone `rebuildVerified`.
  escribir('pleno-claims-verified.json', {
    generatedAt: FIXTURE.base.generatedAt,
    items: mergeVerified(FIXTURE.base.items, FIXTURE.overlay),
  })
  escribir('tenders.json', FIXTURE.tenders)
  for (const [pleno, texto] of Object.entries(FIXTURE.transcripciones)) {
    writeFileSync(join(data, 'pleno-transcripts', `${pleno}.txt`), texto as string)
  }
  writeFileSync(join(caja, 'bin/gemini'), GEMINI_FALSO, { mode: 0o755 })

  res = spawnSync(TSX, [SCRIPT], {
    cwd: caja,
    encoding: 'utf8',
    // Un entorno limpio, no una copia del de quien corre la prueba: una clave de
    // OpenAI exportada en su shell pondría un backend de pago detrás del falso.
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      LLM_BACKEND: 'gemini',
      GEMINI_BIN: join(caja, 'bin/gemini'),
      GEMINI_MODEL: 'modelo-de-prueba',
      CLAUDE_CODE_BIN: join(caja, 'bin/no-existe'),
      LLM_ZERO_COST_ONLY: '1',
      VERIFIER_SHORTLIST: 'lexical',
      RUN_MANIFEST_DIR: join(caja, 'partes'),
      CALL_LOG: join(caja, 'llamadas.log'),
    },
    timeout: 120_000,
  })
  overlay = JSON.parse(readFileSync(join(data, 'pleno-claims-overlay.json'), 'utf8'))
  const partes = readdirSync(join(caja, 'partes')).filter((f) => f.endsWith('.json'))
  parte = partes.length
    ? JSON.parse(readFileSync(join(caja, 'partes', partes.sort().at(-1)!), 'utf8'))
    : {}
  try {
    llamadas = readFileSync(join(caja, 'llamadas.log'), 'utf8').trim().split('\n')
  } catch {
    llamadas = []
  }
})

afterAll(() => rmSync(caja, { recursive: true, force: true }))

const literal = (id: string) =>
  FIXTURE.base.items.find((it: { claim: { id: string } }) => it.claim.id === id).claim.verbatim

describe('verify:pleno-claims:engine, modo por defecto', () => {
  it('termina bien, y el modelo falso contestó', () => {
    expect(res.status, `${res.stderr}`).toBe(0)
    // El control: sin esto, todo lo de abajo podría cumplirse con un modelo que
    // nunca respondió.
    expect(llamadas.filter((l) => l.endsWith(literal(JUZGADA))).length).toBe(2)
  })

  it('una declaración sin candidatos no llega al modelo', () => {
    expect(llamadas.some((l) => l.endsWith(literal(SIN_CANDIDATOS)))).toBe(false)
  })

  it('y por eso no se escribe como retractación del motor', () => {
    const e = overlay.entries[SIN_CANDIDATOS]
    expect(e.source, 'lo que el modelo no juzgó salió firmado por él').toBe('llm')
    expect(e.verification.verdict).toBe('verificado')
  })

  it('la que el modelo juzgó se retracta con SU razonamiento, no con la frase del determinista', () => {
    const e = overlay.entries[JUZGADA]
    expect(e.source).toBe('verdict-engine')
    expect(e.verification.verdict).toBe('sin-datos')
    expect(e.verification.summary).toBe(RAZONAMIENTO)
    expect(e.verification.derivedBy).toEqual(['verdict-engine'])
  })

  it('el parte cuenta cada declaración en un solo cubo', () => {
    expect(parte.attempted).toBe(3)
    expect(parte.judged).toBe(1)
    expect(parte.neverAttempted).toBe(1)
    expect(parte.skipped).toEqual({ 'claim not in snapshot': 1 })
    expect(parte.outcome).toEqual({ retracted: 1 })
    expect(overlay.entries[SIN_DECLARACION].source).toBe('llm')
  })

  it('y la línea final dice cuántas no se preguntaron', () => {
    expect(res.stderr).toMatch(/JUDGED 1 \(retracted 1 → sin-datos · kept 0\)/)
    expect(res.stderr).toMatch(/never asked 1/)
  })
})
