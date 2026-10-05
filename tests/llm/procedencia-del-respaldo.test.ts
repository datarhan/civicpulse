/**
 * La respuesta de un respaldo no se hace pasar por la del primario.
 *
 * El 02-08-2026 el motor de veredictos corrió con `LLM_BACKEND=claude-code` y el
 * `.env` cargado. Cuando `claude -p` fallaba, `buildBackendChain` caía a openai
 * (sin OPENAI_MODEL, gpt-4o-mini) y `callLLM` guardaba esa respuesta bajo la
 * clave del PRIMARIO: sólo los campos `backend`/`model` de la entrada decían
 * quién había contestado. Toda lectura posterior con claude-code de primario
 * servía lo de gpt-4o-mini como si fuera de Claude, y el guion rotulaba la
 * retractación con lo configurado, no con lo que contestó. Medido el 05-10-2026
 * contra una copia de la caché: 457 retractaciones publicadas como de
 * `verdict-engine:claude-code` las escribió gpt-4o-mini.
 *
 * El modelo falso es lo único falso: un `claude` de verdad en disco (un guion)
 * y `fetch` interceptado para openai. La clave la deriva siempre el cliente
 * (`llmCacheHas`, `llmCacheGet`), nunca esta prueba.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  appendFileSync,
  chmodSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import * as cliente from '../../src/llm/client'
import {
  callLLM,
  getRunStats,
  llmCacheGet,
  llmCacheHas,
  loadConfigFromEnv,
  resetBudget,
  resetRunStats,
  type ClientConfig,
} from '../../src/llm/client'

const Schema = z.object({ reply: z.string() })
const PREGUNTA = { promptVersion: 'procedencia-v1', schema: Schema, input: { claimId: 'x-001' } }

let caja = ''
let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  caja = mkdtempSync(join(tmpdir(), 'procedencia-'))
  fetchSpy = vi.fn()
  // @ts-expect-error — sólo openai pasa por fetch; nada sale a la red.
  globalThis.fetch = fetchSpy
  resetBudget(1_000_000)
})

afterEach(() => {
  rmSync(caja, { recursive: true, force: true })
  vi.restoreAllMocks()
})

/** Un `claude` en disco: contesta con `reply`, o sale con 1 si no se le da. Apunta cada llamada. */
function claudeFalso(reply?: string): string {
  const bin = join(caja, 'claude')
  const log = join(caja, 'claude.log')
  const cuerpo =
    reply === undefined
      ? 'echo "claude falso caído" >&2\nexit 1'
      : `cat <<'EOF'\n${JSON.stringify({ is_error: false, structured_output: { reply }, total_cost_usd: 0, usage: { input_tokens: 10, output_tokens: 5 } })}\nEOF`
  writeFileSync(bin, `#!/bin/sh\necho llamada >> "${log}"\n${cuerpo}\n`)
  chmodSync(bin, 0o755)
  return bin
}
const llamadasAClaude = () => {
  try {
    return readFileSync(join(caja, 'claude.log'), 'utf8').trim().split('\n').length
  } catch {
    return 0
  }
}

function openaiContesta(reply: string) {
  fetchSpy.mockImplementation(async (url: string) => {
    appendFileSync(join(caja, 'fetch.log'), `${url}\n`)
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => '',
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ reply }) } }],
        usage: { prompt_tokens: 20, completion_tokens: 5 },
      }),
    }
  })
}

/** Claude de primario y openai detrás, como corrió el motor el 02-08 con el `.env` cargado. */
function primarioClaude(bin: string): ClientConfig {
  return {
    ...loadConfigFromEnv(),
    backend: 'claude-code',
    claudeCodeBin: bin,
    claudeCodeModel: 'sonnet',
    openaiApiKey: 'sk-de-prueba',
    openaiModel: 'gpt-4o-mini',
    anthropicApiKey: undefined,
    zeroCostOnly: false,
    cacheDir: join(caja, 'cache'),
  }
}
const comoOpenai = (c: ClientConfig): ClientConfig => ({ ...c, backend: 'openai' })

const llamar = (config: ClientConfig) =>
  callLLM({ systemPrompt: 's', userPrompt: 'u', maxRetries: 0, config, ...PREGUNTA })

describe('callLLM · lo que contesta un respaldo no se guarda como del primario', () => {
  it('se guarda bajo la clave de quien contestó', async () => {
    const config = primarioClaude(claudeFalso())
    openaiContesta('de gpt-4o-mini')

    expect(await llamar(config)).toEqual({ reply: 'de gpt-4o-mini' })
    // El control: claude se intentó y openai contestó.
    expect(llamadasAClaude()).toBe(1)
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    expect(
      llmCacheHas({ ...PREGUNTA, config }),
      'la respuesta de openai quedó a nombre de claude',
    ).toBe(false)
    expect(llmCacheHas({ ...PREGUNTA, config: comoOpenai(config) })).toBe(true)
  })

  it('callLLMConProcedencia dice qué backend y qué modelo contestaron', async () => {
    const config = primarioClaude(claudeFalso())
    openaiContesta('de gpt-4o-mini')

    const r = await cliente.callLLMConProcedencia({
      systemPrompt: 's',
      userPrompt: 'u',
      maxRetries: 0,
      config,
      ...PREGUNTA,
    })
    expect(r.result).toEqual({ reply: 'de gpt-4o-mini' })
    expect(r.procedencia).toEqual({ backend: 'openai', model: 'gpt-4o-mini', deCache: false })
  })

  it('con el primario aún caído, el respaldo se lee de SU caché: no se paga dos veces', async () => {
    const config = primarioClaude(claudeFalso())
    openaiContesta('de gpt-4o-mini')
    await llamar(config)

    const r = await cliente.callLLMConProcedencia({
      systemPrompt: 's',
      userPrompt: 'u',
      maxRetries: 0,
      config,
      ...PREGUNTA,
    })
    expect(r.result).toEqual({ reply: 'de gpt-4o-mini' })
    expect(r.procedencia).toEqual({ backend: 'openai', model: 'gpt-4o-mini', deCache: true })
    // El primario va primero cada vez: si ya contestara, su respuesta mandaría.
    expect(llamadasAClaude()).toBe(2)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

describe('callLLM · una entrada vieja del respaldo bajo la clave del primario no se sirve', () => {
  /**
   * La caché de antes de este arreglo: la entrada está bajo la clave de claude
   * y la escribió openai. Se siembra con una llamada de verdad —la clave la
   * deriva el cliente— y se le cambia la procedencia, que es lo único en que
   * difiere de las 457 de agosto.
   */
  async function envenenada(config: ClientConfig) {
    await llamar(config)
    const dir = config.cacheDir
    const [fichero, ...otros] = readdirSync(dir)
    expect(otros, 'la siembra dejó una sola entrada').toEqual([])
    const e = JSON.parse(readFileSync(join(dir, fichero), 'utf8'))
    expect(e.backend).toBe('claude-code')
    writeFileSync(
      join(dir, fichero),
      JSON.stringify({
        ...e,
        backend: 'openai',
        model: 'gpt-4o-mini',
        result: { reply: 'de gpt-4o-mini' },
      }),
    )
  }

  it('ni la sonda ni la lectura la dan por buena', async () => {
    const config = primarioClaude(claudeFalso('de claude'))
    await envenenada(config)
    resetRunStats()

    expect(llmCacheHas({ ...PREGUNTA, config })).toBe(false)
    expect(llmCacheGet({ ...PREGUNTA, config })).toBeNull()
    expect(getRunStats().cacheHits).toBe(0)
  })

  it('callLLM pregunta al primario en vez de servirla, y lo cuenta', async () => {
    const config = primarioClaude(claudeFalso('de claude'))
    await envenenada(config)
    resetRunStats()

    expect(await llamar(config), 'sirvió lo de gpt-4o-mini como de claude').toEqual({
      reply: 'de claude',
    })
    expect(llamadasAClaude()).toBe(2)
    expect(getRunStats()).toMatchObject({ cacheHits: 0, cacheDeOtroBackend: 1 })
    // Y lo que contestó claude ocupa su clave, ahora con su procedencia.
    expect(llmCacheGet({ ...PREGUNTA, config })).toEqual({ reply: 'de claude' })
  })

  it('el control: lo que contestó el propio primario se sigue sirviendo de la caché', async () => {
    const config = primarioClaude(claudeFalso('de claude'))
    await llamar(config)
    resetRunStats()

    const r = await cliente.callLLMConProcedencia({
      systemPrompt: 's',
      userPrompt: 'u',
      maxRetries: 0,
      config,
      ...PREGUNTA,
    })
    expect(r.result).toEqual({ reply: 'de claude' })
    expect(r.procedencia).toEqual({
      backend: 'claude-code',
      model: 'claude-code:sonnet',
      deCache: true,
    })
    expect(llamadasAClaude()).toBe(1)
    expect(llmCacheHas({ ...PREGUNTA, config })).toBe(true)
    expect(getRunStats()).toMatchObject({ cacheHits: 1, cacheDeOtroBackend: 0 })
  })
})
