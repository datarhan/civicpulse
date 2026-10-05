import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { callLLM, loadConfigFromEnv, type ClientConfig } from '../src/llm/client'
import { EngineExtractSchema, EngineReasoningSchema } from '../src/llm/schemas'
import { validateOverlay, type Overlay } from '../src/scraper/verified-merge'

/**
 * `npm run corregir-rotulo-motor`, de punta a punta.
 *
 * El 02-08-2026 el motor de veredictos escribió como `verdict-engine:claude-code`
 * 457 retractaciones que había contestado gpt-4o-mini, el respaldo de pago de la
 * cadena (la causa la cerró la PR #248). Esta CLI corrige ese rótulo con lo que
 * prueba la caché, sin llamar a nadie, y deja constancia en la entrada.
 *
 * Cuatro filas reales (tests/fixtures/rotulo-del-motor_2026-10-05.json): una que
 * razonó y decidió gpt-4o-mini, la mixta, una de claude-code y la única sin nada
 * en caché. La caché se siembra como la dejó agosto: con `callLLM` y un `claude`
 * falso —la clave la deriva el cliente, no esta prueba— y luego se le pone a cada
 * entrada la procedencia medida, que es lo único en que difiere de las de verdad.
 *
 * La CLI corre con un `claude` trampa que apunta si lo llaman y con `fetch`
 * cambiado por uno que apunta y lanza: la promesa de cero llamadas se mide.
 */

const SCRIPT = resolve('scripts/corregir-rotulo-motor.ts')
const TSX = resolve('node_modules/.bin/tsx')
const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/rotulo-del-motor_2026-10-05.json'), 'utf8'),
)
const GPT = '19gax3o-142-afi-f3d4db'
const MIXTA = '19gax3o-132-acu-a3b10d'
const CLAUDE = '1237hbp-030-cit-eea251'
const SIN_CACHE = 'c8kr44-143-cit-9576bc'
const MOTIVO =
  'La pasada del 02-08-2026 cayó al respaldo de pago y el guion rotulaba con lo configurado (PR #248).'

const SIN_RED = `import { appendFileSync } from 'node:fs'
globalThis.fetch = async (url) => {
  appendFileSync(process.env.FETCH_LOG, String(url) + '\\n')
  throw new Error('sin red en la prueba')
}
`

let caja = ''
let overlayPath = ''
let antes: Buffer
const res: Record<string, ReturnType<typeof spawnSync>> = {}
let trasDryRun: Buffer
let trasHueco: Buffer
let corregido: Overlay

const lineas = (p: string) => {
  try {
    return readFileSync(p, 'utf8').trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

/** Siembra una entrada con `callLLM` y le pone la procedencia medida. */
async function sembrar(
  config: ClientConfig,
  pregunta: { promptVersion: string; schema: never; input: unknown },
  respuesta: unknown,
  quien: { backend: string; model: string },
) {
  const dir = config.cacheDir
  const antesDe = new Set(lineasDir(dir))
  process.env.RESPUESTA_FALSA = JSON.stringify({
    is_error: false,
    structured_output: respuesta,
    total_cost_usd: 0,
    usage: { input_tokens: 10, output_tokens: 5 },
  })
  const r = await callLLM({
    systemPrompt: 's',
    userPrompt: 'u',
    maxRetries: 0,
    config,
    ...pregunta,
  })
  expect(r, 'la siembra no contestó').not.toBeNull()
  const nuevos = lineasDir(dir).filter((f) => !antesDe.has(f))
  expect(nuevos, 'la siembra dejó una entrada').toHaveLength(1)
  const p = join(dir, nuevos[0])
  const e = JSON.parse(readFileSync(p, 'utf8'))
  writeFileSync(p, JSON.stringify({ ...e, backend: quien.backend, model: quien.model }))
}
const lineasDir = (d: string) => {
  try {
    return readdirSync(d)
  } catch {
    return []
  }
}

function correr(args: string[]) {
  return spawnSync(TSX, [SCRIPT, ...args], {
    cwd: caja,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      TMPDIR: process.env.TMPDIR ?? tmpdir(),
      NODE_OPTIONS: `--import ${pathToFileURL(join(caja, 'sin-red.mjs')).href}`,
      CLAUDE_CODE_BIN: join(caja, 'bin/claude-trampa'),
      AGY_BIN: join(caja, 'bin/no-existe'),
      GEMINI_BIN: join(caja, 'bin/no-existe'),
      CALL_LOG: join(caja, 'trampa.log'),
      FETCH_LOG: join(caja, 'red.log'),
    },
    timeout: 120_000,
  })
}

beforeAll(async () => {
  caja = mkdtempSync(join(tmpdir(), 'corregir-rotulo-'))
  mkdirSync(join(caja, 'public/data'), { recursive: true })
  mkdirSync(join(caja, 'bin'))
  overlayPath = join(caja, 'public/data/pleno-claims-overlay.json')
  writeFileSync(
    overlayPath,
    JSON.stringify(
      { version: 1, generatedAt: '2026-10-05T07:00:00.000Z', entries: FIXTURE.entries },
      null,
      2,
    ) + '\n',
  )
  writeFileSync(join(caja, 'sin-red.mjs'), SIN_RED)
  writeFileSync(join(caja, 'bin/claude-falso'), '#!/bin/sh\nprintf \'%s\' "$RESPUESTA_FALSA"\n', {
    mode: 0o755,
  })
  writeFileSync(
    join(caja, 'bin/claude-trampa'),
    '#!/bin/sh\necho llamada >> "$CALL_LOG"\nexit 1\n',
    { mode: 0o755 },
  )
  writeFileSync(join(caja, 'ids.txt'), `# las cuatro\n${GPT}\n${MIXTA}\n${CLAUDE}\n${SIN_CACHE}\n`)

  // Como en agosto: todo bajo la clave de claude-code (sonnet).
  const config: ClientConfig = {
    ...loadConfigFromEnv(),
    backend: 'claude-code',
    claudeCodeBin: join(caja, 'bin/claude-falso'),
    claudeCodeModel: 'sonnet',
    zeroCostOnly: true,
    openaiApiKey: undefined,
    anthropicApiKey: undefined,
    cacheDir: join(caja, '.llm-cache'),
  }
  for (const id of [GPT, MIXTA, CLAUDE]) {
    const p = FIXTURE.procedencia[id]
    const reasoning = FIXTURE.entries[id].verification.summary
    await sembrar(
      config,
      {
        promptVersion: p.razonar.version,
        schema: EngineReasoningSchema as never,
        input: { claimId: id },
      },
      { reasoning },
      p.razonar,
    )
    await sembrar(
      config,
      {
        promptVersion: 'engine-extract-v1',
        schema: EngineExtractSchema as never,
        input: { claimId: id, reasoning },
      },
      { verdict: 'sin-datos', cites: [] },
      p.extraer,
    )
  }

  const firma = ['--ids', 'ids.txt', '--reason', MOTIVO]
  antes = readFileSync(overlayPath)
  res.dryRun = correr([...firma, '--editor', 'civicpulse-curator', '--dry-run'])
  trasDryRun = readFileSync(overlayPath)
  res.hueco = correr([...firma, '--editor', '<tu nombre>'])
  trasHueco = readFileSync(overlayPath)
  res.deVerdad = correr([...firma, '--editor', 'civicpulse-curator'])
  corregido = JSON.parse(readFileSync(overlayPath, 'utf8'))
}, 180_000)

afterAll(() => {
  if (caja) rmSync(caja, { recursive: true, force: true })
})

describe('--dry-run', () => {
  it('termina bien y deja el fichero idéntico, byte a byte', () => {
    expect(res.dryRun.status, String(res.dryRun.stderr)).toBe(0)
    expect(trasDryRun.equals(antes)).toBe(true)
  })

  it('enseña el antes y el después de cada fila que corregiría', () => {
    const out = String(res.dryRun.stdout)
    expect(out).toMatch(
      new RegExp(`${GPT}\\n\\s+editor: verdict-engine:claude-code → verdict-engine:gpt-4o-mini\\n`),
    )
    expect(out).toMatch(
      new RegExp(
        `${MIXTA}\\n\\s+editor: verdict-engine:claude-code → verdict-engine:claude-code\\+gpt-4o-mini\\n`,
      ),
    )
    expect(out).toContain('verdict-engine (gpt-4o-mini) re-judged verificado→sin-datos: ')
  })
})

describe('lo que no se corrige', () => {
  it('una fila sin prueba en la caché', () => {
    expect(String(res.dryRun.stdout)).toMatch(new RegExp(`dejada ${SIN_CACHE}: sin-procedencia`))
    expect(corregido.entries[SIN_CACHE]).toEqual(FIXTURE.entries[SIN_CACHE])
  })

  it('una fila cuyo rótulo ya nombra a quien contestó', () => {
    expect(String(res.dryRun.stdout)).toMatch(new RegExp(`dejada ${CLAUDE}: ya-es-ese`))
    expect(corregido.entries[CLAUDE]).toEqual(FIXTURE.entries[CLAUDE])
  })

  it('el hueco de una orden sin rellenar como firma: no lee ni escribe nada', () => {
    expect(res.hueco.status).toBe(2)
    expect(String(res.hueco.stderr)).toMatch(/--editor/)
    expect(trasHueco.equals(antes)).toBe(true)
  })
})

describe('de verdad, en la caja', () => {
  it('corrige las dos probadas, con su registro, y el overlay valida', () => {
    expect(res.deVerdad.status, String(res.deVerdad.stderr)).toBe(0)
    expect(corregido.entries[GPT].editor).toBe('verdict-engine:gpt-4o-mini')
    expect(corregido.entries[MIXTA].editor).toBe('verdict-engine:claude-code+gpt-4o-mini')
    expect(corregido.entries[GPT].labelCorrections?.[0]).toMatchObject({
      previous: 'verdict-engine:claude-code',
      editor: 'civicpulse-curator',
    })
    expect(() => validateOverlay(corregido)).not.toThrow()
  })

  it('sin tocar el veredicto ni la explicación', () => {
    // El control: sin esto, un guion que no arrancó también «no toca nada».
    expect(res.deVerdad.status, String(res.deVerdad.stderr)).toBe(0)
    for (const id of [GPT, MIXTA]) {
      expect(corregido.entries[id].verification).toEqual(FIXTURE.entries[id].verification)
      expect(corregido.entries[id].appliedAt).toBe(FIXTURE.entries[id].appliedAt)
    }
  })

  it('y sin una sola llamada a un modelo', () => {
    // El control: sin esto, un guion que no arrancó también «no toca nada».
    expect(res.deVerdad.status, String(res.deVerdad.stderr)).toBe(0)
    expect(lineas(join(caja, 'trampa.log'))).toEqual([])
    expect(lineas(join(caja, 'red.log'))).toEqual([])
  })
})
