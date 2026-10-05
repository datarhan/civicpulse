import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mergeVerified, type Overlay } from '../src/scraper/verified-merge'
import { AGY_MODEL_DEFAULT, llmCacheHas, loadConfigFromEnv } from '../src/llm/client'
import { EngineReasoningSchema } from '../src/llm/schemas'
import { ENGINE_REASON_VERSION } from '../src/llm/prompts'

/**
 * A nombre de quién escribe `verify:pleno-claims:engine`, de punta a punta.
 *
 * El 02-08-2026 corrió con `LLM_BACKEND=claude-code` y el `.env` cargado:
 * cuando `claude -p` fallaba, la cadena caía a openai (gpt-4o-mini), el cliente
 * guardaba la respuesta bajo la clave de claude y el guion la rotulaba
 * `verdict-engine:claude-code`. Así se publicaron 457 retractaciones de
 * gpt-4o-mini (medido el 05-10-2026). Tres corridas del guion de verdad sobre
 * las filas de tests/fixtures/motor-de-veredictos_2026-09-29.json:
 *
 *   1. las condiciones de agosto: claude caído y la clave de OpenAI en el entorno;
 *   2. OPENAI_MODEL en el entorno con claude de primario, que rotulaba al revés;
 *   3. un respaldo GRATUITO contesta (agy cae, claude responde): ni así se
 *      escribe a nombre del primario.
 *
 * Lo único falso son los modelos —`claude` y `agy` en disco— y la red: una
 * precarga cambia `fetch` por una que apunta la URL y lanza, así que ninguna
 * corrida puede llegar a OpenAI, y si lo intenta queda escrito.
 */

const SCRIPT = resolve('scripts/verify-pleno-claims-engine.ts')
const TSX = resolve('node_modules/.bin/tsx')
const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/motor-de-veredictos_2026-09-29.json'), 'utf8'),
)
const JUZGADA = 'k4olcs-008-afi-843b2a'
const RAZONAMIENTO =
  'El único candidato es un contrato menor de 2018 para redactar la «Carta de servicios ' +
  'municipal»; no dice nada de que la carta se adapte por cambios en sus indicadores, así que ' +
  'no respalda la afirmación.'

/** `claude -p … --json-schema <esquema>`: la extracción es la que pide `verdict`. */
const CLAUDE_FALSO = `#!/usr/bin/env node
const { appendFileSync } = require('node:fs')
const args = process.argv.slice(2)
const esquema = args[args.indexOf('--json-schema') + 1] || ''
const extraccion = esquema.includes('"verdict"')
appendFileSync(process.env.CALL_LOG, 'claude\\t' + (extraccion ? 'extract' : 'reason') + '\\n')
const salida = extraccion ? { verdict: 'sin-datos', cites: [] } : { reasoning: ${JSON.stringify(RAZONAMIENTO)} }
process.stdout.write(JSON.stringify({ is_error: false, structured_output: salida, total_cost_usd: 0, usage: { input_tokens: 100, output_tokens: 30 } }))
`
const CAIDO = (quien: string) =>
  `#!/bin/sh\nprintf '${quien}\\tcaído\\n' >> "$CALL_LOG"\necho "${quien} falso caído" >&2\nexit 1\n`
const SIN_RED = `import { appendFileSync } from 'node:fs'
globalThis.fetch = async (url) => {
  appendFileSync(process.env.FETCH_LOG, String(url) + '\\n')
  throw new Error('sin red en la prueba')
}
`

interface Corrida {
  caja: string
  status: number | null
  stderr: string
  overlay: Overlay
  parte: Record<string, any>
  llamadas: string[]
  red: string[]
}

const cajas: string[] = []
afterAll(() => {
  for (const c of cajas) rmSync(c, { recursive: true, force: true })
})

const lineas = (p: string) => {
  try {
    return readFileSync(p, 'utf8').trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

function correr(env: Record<string, string>, binarios: Record<string, string>): Corrida {
  const caja = mkdtempSync(join(tmpdir(), 'motor-procedencia-'))
  cajas.push(caja)
  const data = join(caja, 'public/data')
  mkdirSync(join(data, 'pleno-claims'), { recursive: true })
  mkdirSync(join(data, 'pleno-transcripts'), { recursive: true })
  mkdirSync(join(caja, 'bin'))
  mkdirSync(join(caja, 'partes'))
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
  for (const [nombre, cuerpo] of Object.entries(binarios)) {
    writeFileSync(join(caja, 'bin', nombre), cuerpo, { mode: 0o755 })
  }
  writeFileSync(join(caja, 'sin-red.mjs'), SIN_RED)

  const res = spawnSync(TSX, [SCRIPT], {
    cwd: caja,
    encoding: 'utf8',
    // Entorno limpio: lo que la corrida tenga de backends es lo que dice `env`.
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      TMPDIR: process.env.TMPDIR ?? tmpdir(),
      NODE_OPTIONS: `--import ${pathToFileURL(join(caja, 'sin-red.mjs')).href}`,
      VERIFIER_SHORTLIST: 'lexical',
      RUN_MANIFEST_DIR: join(caja, 'partes'),
      CALL_LOG: join(caja, 'llamadas.log'),
      FETCH_LOG: join(caja, 'red.log'),
      GEMINI_BIN: join(caja, 'bin/no-existe'),
      AGY_BIN: join(caja, 'bin/agy'),
      CLAUDE_CODE_BIN: join(caja, 'bin/claude'),
      ...env,
    },
    timeout: 120_000,
  })
  const partes = readdirSync(join(caja, 'partes')).filter((f) => f.endsWith('.json'))
  return {
    caja,
    status: res.status,
    stderr: res.stderr,
    overlay: JSON.parse(readFileSync(join(data, 'pleno-claims-overlay.json'), 'utf8')),
    parte: partes.length
      ? JSON.parse(readFileSync(join(caja, 'partes', partes.sort().at(-1)!), 'utf8'))
      : {},
    llamadas: lineas(join(caja, 'llamadas.log')),
    red: lineas(join(caja, 'red.log')),
  }
}

describe('1 · las condiciones de agosto: claude caído y la clave de OpenAI cargada', () => {
  let c: Corrida
  beforeAll(() => {
    c = correr(
      { LLM_BACKEND: 'claude-code', OPENAI_API_KEY: 'sk-de-prueba' },
      { claude: CAIDO('claude') },
    )
  }, 120_000)

  it('el control: se le preguntó a claude', () => {
    expect(c.llamadas, c.stderr).toContain('claude\tcaído')
  })

  it('no cae a OpenAI: el motor corre sin respaldo de pago', () => {
    expect(c.red, 'el motor intentó un backend de pago').toEqual([])
  })

  it('y no escribe nada a nombre de nadie', () => {
    expect(c.overlay.entries[JUZGADA].source).toBe('llm')
  })
})

describe('2 · OPENAI_MODEL en el entorno, claude de primario', () => {
  let c: Corrida
  beforeAll(() => {
    c = correr(
      { LLM_BACKEND: 'claude-code', OPENAI_MODEL: 'gpt-5.4-mini' },
      { claude: CLAUDE_FALSO },
    )
  }, 120_000)

  it('el control: claude razonó y extrajo', () => {
    expect(c.status, c.stderr).toBe(0)
    expect(c.llamadas).toEqual(['claude\treason', 'claude\textract'])
  })

  it('la retractación sale a nombre de claude-code, no del modelo de OpenAI', () => {
    const e = c.overlay.entries[JUZGADA]
    expect(e.source).toBe('verdict-engine')
    expect(e.editor).toBe('verdict-engine:claude-code')
    expect(e.reason).toMatch(/^verdict-engine \(claude-code\) re-judged verificado→sin-datos: /)
  })
})

describe('3 · un respaldo gratuito contesta: agy cae y claude responde', () => {
  let c: Corrida
  beforeAll(() => {
    c = correr({ LLM_BACKEND: 'agy' }, { agy: CAIDO('agy'), claude: CLAUDE_FALSO })
  }, 120_000)

  const pregunta = {
    promptVersion: ENGINE_REASON_VERSION,
    schema: EngineReasoningSchema,
    input: { claimId: JUZGADA },
  }
  const config = (backend: 'agy' | 'claude-code') => ({
    ...loadConfigFromEnv(),
    backend,
    agyModel: AGY_MODEL_DEFAULT,
    claudeCodeModel: 'sonnet',
    cacheDir: join(c.caja, '.llm-cache'),
  })

  it('el control: agy cayó y claude contestó los dos pasos', () => {
    expect(c.llamadas, c.stderr).toEqual([
      'agy\tcaído',
      'claude\treason',
      'agy\tcaído',
      'claude\textract',
    ])
  })

  it('lo que contestó claude no se escribe como de agy', () => {
    const e = c.overlay.entries[JUZGADA]
    expect(e.source, `escrita como ${e.editor}`).toBe('llm')
  })

  it('y no cuenta como juzgada: se aparta con su motivo', () => {
    expect(c.parte.judged).toBe(0)
    const motivos = Object.entries(c.parte.skipped ?? {}).filter(([m]) => /otro backend/.test(m))
    expect(motivos).toEqual([[expect.any(String), 1]])
  })

  it('su razonamiento queda en la caché a nombre de claude, no bajo la clave de agy', () => {
    expect(llmCacheHas({ ...pregunta, config: config('agy') })).toBe(false)
    expect(llmCacheHas({ ...pregunta, config: config('claude-code') })).toBe(true)
  })
})
