/**
 * Unit tests for the LLM client layer. We intercept global fetch so we can
 * exercise Ollama + OpenAI transports without a live server. Cache directory
 * is redirected to a per-test tmpdir so tests never collide with each other
 * or with real cached entries from manual runs.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { z } from 'zod'
import {
  callLLM,
  describeClaudeFailure,
  gatherCacheStats,
  loadConfigFromEnv,
  resetBudget,
  getCircuitState,
  __resetCircuitForTest,
  __notifyResultForTest,
  isReasoningModel,
  extractJsonPayload,
  claudeEnvelopeToRaw,
} from '../../src/llm/client'

const TestSchema = z.object({ reply: z.string() })

let cacheDir = ''
let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  cacheDir = mkdtempSync(resolve(tmpdir(), 'civicpulse-llm-'))
  fetchSpy = vi.fn()
  // @ts-expect-error — override global fetch for tests
  globalThis.fetch = fetchSpy
  resetBudget(1_000_000)
  // Point GEMINI_BIN at a non-existent path so tests isolate from any real
  // local gemini-cli install on the developer's machine (fallback chain
  // adds gemini only when its binary exists on disk).
  process.env.GEMINI_BIN = '/nonexistent/gemini'
})

afterEach(() => {
  rmSync(cacheDir, { recursive: true, force: true })
  vi.restoreAllMocks()
  delete process.env.GEMINI_BIN
})

function ollamaSuccess(content: string, tokens = 50) {
  return Promise.resolve({
    ok: true,
    status: 200,
    text: async () => '',
    json: async () => ({
      message: { content },
      prompt_eval_count: Math.floor(tokens / 2),
      eval_count: Math.ceil(tokens / 2),
    }),
  })
}

function openaiSuccess(content: string, tokens = 50) {
  return Promise.resolve({
    ok: true,
    status: 200,
    text: async () => '',
    json: async () => ({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: Math.floor(tokens / 2), completion_tokens: Math.ceil(tokens / 2) },
    }),
  })
}

describe('LLM client · caching', () => {
  it('caches a successful call; second invocation does not hit fetch', async () => {
    fetchSpy.mockReturnValueOnce(ollamaSuccess(JSON.stringify({ reply: 'pong' })))

    const common = {
      systemPrompt: 'sys',
      userPrompt: 'ping',
      promptVersion: 'test-v1',
      schema: TestSchema,
      input: { probe: 1 },
      config: { ...loadConfigFromEnv(), backend: 'ollama' as const, cacheDir },
    }

    const first = await callLLM(common)
    const second = await callLLM(common)

    expect(first).toEqual({ reply: 'pong' })
    expect(second).toEqual({ reply: 'pong' })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('writes telemetry into the cache entry', async () => {
    fetchSpy.mockReturnValueOnce(ollamaSuccess(JSON.stringify({ reply: 'hello' }), 120))

    await callLLM({
      systemPrompt: 'sys',
      userPrompt: 'ping',
      promptVersion: 'test-v1',
      schema: TestSchema,
      input: { probe: 2 },
      config: { ...loadConfigFromEnv(), backend: 'ollama' as const, cacheDir },
    })

    const files = readdirSync(cacheDir).filter((f) => f.endsWith('.json'))
    expect(files).toHaveLength(1)
    const stats = gatherCacheStats(cacheDir)
    expect(stats.entries).toBe(1)
    expect(stats.totalTokens).toBe(120)
  })

  it('uses a different cache key when promptVersion changes', async () => {
    fetchSpy
      .mockReturnValueOnce(ollamaSuccess(JSON.stringify({ reply: 'v1' })))
      .mockReturnValueOnce(ollamaSuccess(JSON.stringify({ reply: 'v2' })))

    const base = {
      systemPrompt: 'sys',
      userPrompt: 'same',
      schema: TestSchema,
      input: { x: 1 },
      config: { ...loadConfigFromEnv(), backend: 'ollama' as const, cacheDir },
    }

    const a = await callLLM({ ...base, promptVersion: 'v1' })
    const b = await callLLM({ ...base, promptVersion: 'v2' })

    expect(a).toEqual({ reply: 'v1' })
    expect(b).toEqual({ reply: 'v2' })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})

describe('LLM client · retry on invalid JSON', () => {
  it('retries up to maxRetries when output fails schema', async () => {
    fetchSpy
      .mockReturnValueOnce(ollamaSuccess('not json'))
      .mockReturnValueOnce(ollamaSuccess(JSON.stringify({ wrong: 'shape' })))
      .mockReturnValueOnce(ollamaSuccess(JSON.stringify({ reply: 'finally' })))

    const result = await callLLM({
      systemPrompt: 's',
      userPrompt: 'u',
      promptVersion: 'retry-v1',
      schema: TestSchema,
      input: { x: 1 },
      config: { ...loadConfigFromEnv(), backend: 'ollama' as const, cacheDir },
      maxRetries: 2,
    })
    expect(result).toEqual({ reply: 'finally' })
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it('returns null when all attempts fail', async () => {
    fetchSpy
      .mockReturnValueOnce(ollamaSuccess('bad'))
      .mockReturnValueOnce(ollamaSuccess('worse'))
      .mockReturnValueOnce(ollamaSuccess('terrible'))

    const result = await callLLM({
      systemPrompt: 's',
      userPrompt: 'u',
      promptVersion: 'retry-v1',
      schema: TestSchema,
      input: { x: 2 },
      config: { ...loadConfigFromEnv(), backend: 'ollama' as const, cacheDir },
      maxRetries: 2,
    })
    expect(result).toBeNull()
  })
})

describe('LLM client · OpenAI backend', () => {
  it('sends structured output request with strict schema', async () => {
    fetchSpy.mockReturnValueOnce(openaiSuccess(JSON.stringify({ reply: 'hello' }), 80))

    const result = await callLLM({
      systemPrompt: 's',
      userPrompt: 'u',
      promptVersion: 'oa-v1',
      schema: TestSchema,
      input: { x: 1 },
      config: {
        ...loadConfigFromEnv(),
        backend: 'openai' as const,
        openaiApiKey: 'sk-test',
        cacheDir,
      },
    })

    expect(result).toEqual({ reply: 'hello' })
    const call = fetchSpy.mock.calls[0]
    expect(call[0]).toContain('api.openai.com')
    const body = JSON.parse((call[1] as RequestInit).body as string)
    expect(body.response_format.type).toBe('json_schema')
    expect(body.response_format.json_schema.strict).toBe(true)
    expect(body.temperature).toBe(0)
    expect(body.seed).toBe(42)
  })

  it('computes cost for gpt-4o-mini', async () => {
    fetchSpy.mockReturnValueOnce(openaiSuccess(JSON.stringify({ reply: 'ok' }), 1000))

    await callLLM({
      systemPrompt: 's',
      userPrompt: 'u',
      promptVersion: 'oa-cost-v1',
      schema: TestSchema,
      input: { x: 1 },
      config: {
        ...loadConfigFromEnv(),
        backend: 'openai' as const,
        openaiApiKey: 'sk-test',
        cacheDir,
        openaiModel: 'gpt-4o-mini',
      },
    })

    const stats = gatherCacheStats(cacheDir)
    // 500 in @ 0.15/1M + 500 out @ 0.60/1M = ~$0.000375
    expect(stats.totalCostUSD).toBeGreaterThan(0)
    expect(stats.totalCostUSD).toBeLessThan(0.001)
  })
})

describe('LLM client · token budget', () => {
  it('short-circuits further calls when budget is breached', async () => {
    resetBudget(200) // tiny budget
    fetchSpy.mockReturnValueOnce(ollamaSuccess(JSON.stringify({ reply: 'a' }), 300))

    // First call consumes 300 tokens, exceeds the 200 budget.
    await callLLM({
      systemPrompt: 'A'.repeat(200),
      userPrompt: 'u',
      promptVersion: 'budget-v1',
      schema: TestSchema,
      input: { x: 1 },
      config: { ...loadConfigFromEnv(), backend: 'ollama' as const, cacheDir },
    })

    // Second call should short-circuit before fetch.
    const second = await callLLM({
      systemPrompt: 'A'.repeat(200),
      userPrompt: 'different',
      promptVersion: 'budget-v1',
      schema: TestSchema,
      input: { x: 2 },
      config: { ...loadConfigFromEnv(), backend: 'ollama' as const, cacheDir },
    })
    expect(second).toBeNull()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

describe('LLM client · resilience', () => {
  function openaiSuccess(content: string, tokens = 50) {
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => '',
      json: async () => ({
        choices: [{ message: { content } }],
        usage: { prompt_tokens: Math.floor(tokens / 2), completion_tokens: Math.ceil(tokens / 2) },
      }),
    })
  }
  function anthropicSuccess(input: object, tokens = 50) {
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => '',
      json: async () => ({
        content: [{ type: 'tool_use', name: 'emit_structured_output', input }],
        usage: { input_tokens: Math.floor(tokens / 2), output_tokens: Math.ceil(tokens / 2) },
      }),
    })
  }
  function httpError(status: number, body = '', retryAfter?: string) {
    const headers = new Headers()
    if (retryAfter) headers.set('retry-after', retryAfter)
    return Promise.resolve({
      ok: false,
      status,
      headers,
      text: async () => body,
      json: async () => ({}),
    })
  }

  it('retries on 429 with Retry-After-honoring backoff', async () => {
    // 429 with 1-second wait, then success. The real sleep is minified in tests;
    // we just assert the retry path didn't give up immediately.
    fetchSpy
      .mockReturnValueOnce(httpError(429, 'slow down', '1'))
      .mockReturnValueOnce(openaiSuccess(JSON.stringify({ reply: 'finally' })))

    const result = await callLLM({
      systemPrompt: 's',
      userPrompt: 'u',
      promptVersion: 'rate-v1',
      schema: TestSchema,
      input: { x: 1 },
      config: {
        ...loadConfigFromEnv(),
        backend: 'openai' as const,
        openaiApiKey: 'sk-test',
        cacheDir,
      },
    })
    expect(result).toEqual({ reply: 'finally' })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  }, 8000)

  it('falls back to anthropic when openai exhausts retries', async () => {
    // OpenAI: three 429s (exhausts maxRetries=2 = 3 attempts)
    // Anthropic: success on first try
    fetchSpy
      .mockReturnValueOnce(httpError(429))
      .mockReturnValueOnce(httpError(429))
      .mockReturnValueOnce(httpError(429))
      .mockReturnValueOnce(anthropicSuccess({ reply: 'claude rescue' }))

    const result = await callLLM({
      systemPrompt: 's',
      userPrompt: 'u',
      promptVersion: 'fb-v1',
      schema: TestSchema,
      input: { x: 1 },
      config: {
        ...loadConfigFromEnv(),
        backend: 'openai' as const,
        openaiApiKey: 'sk-test',
        anthropicApiKey: 'sk-ant-test',
        cacheDir,
      },
    })
    expect(result).toEqual({ reply: 'claude rescue' })
    expect(fetchSpy).toHaveBeenCalledTimes(4)
    const lastCall = fetchSpy.mock.calls[3]
    expect(lastCall[0]).toContain('api.anthropic.com')
  }, 10000)

  it('does not sleep between retries on permanent (4xx non-429) errors', async () => {
    // All calls return 400 (permanent error). The loop still does per-backend
    // retries + falls through to other backends, but every attempt must
    // complete quickly — no backoff sleep. Time-bound assertion.
    fetchSpy.mockImplementation(() => httpError(400, 'bad schema'))

    const t0 = Date.now()
    const result = await callLLM({
      systemPrompt: 's',
      userPrompt: 'u',
      promptVersion: 'perm-v1',
      schema: TestSchema,
      input: { x: 1 },
      config: {
        ...loadConfigFromEnv(),
        backend: 'openai' as const,
        openaiApiKey: 'sk-test',
        cacheDir,
      },
    })
    const elapsed = Date.now() - t0

    expect(result).toBeNull()
    // Permanent errors should NOT trigger retry backoff. Stays well under 1s
    // across the attempted backends × 3 attempts each.
    expect(elapsed).toBeLessThan(1000)
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]))
    expect(urls.some((u) => u.includes('openai.com'))).toBe(true)
    // ollama is no longer auto-chained (2026-07-07): a permanent openai
    // failure must NOT leak to local inference.
    expect(urls.some((u) => u.includes('localhost:11434'))).toBe(false)
  })

  it('circuit breaker trips after sustained failures and short-circuits subsequent calls', async () => {
    // All backends fail permanently. After enough failing calls the circuit
    // trips; subsequent callLLM returns null WITHOUT hitting fetch.
    fetchSpy.mockImplementation(() => httpError(400))

    resetBudget(1_000_000) // also resets the circuit with default threshold 10
    const config = {
      ...loadConfigFromEnv(),
      backend: 'openai' as const,
      openaiApiKey: 'sk-test',
      cacheDir,
    }

    // Issue enough failing calls to push consecutiveFailures past the threshold.
    for (let i = 0; i < 11; i++) {
      await callLLM({
        systemPrompt: 's',
        userPrompt: `u-${i}`,
        promptVersion: 'cb-v1',
        schema: TestSchema,
        input: { i },
        config,
      })
    }
    const callsAfterTrip = fetchSpy.mock.calls.length

    // One more call — should short-circuit entirely, no fetch.
    const result = await callLLM({
      systemPrompt: 's',
      userPrompt: 'u-last',
      promptVersion: 'cb-v1',
      schema: TestSchema,
      input: { i: 99 },
      config,
    })
    expect(result).toBeNull()
    expect(fetchSpy).toHaveBeenCalledTimes(callsAfterTrip)
  })
})

describe('isReasoningModel (gpt-5.x / o-series reject sampling params)', () => {
  it('flags gpt-5.x and o-series reasoning models', () => {
    for (const m of [
      'gpt-5',
      'gpt-5.4-mini',
      'gpt-5.4-mini-2026-03-17',
      'gpt-5.2',
      'gpt-5-pro',
      'o1',
      'o3-mini',
      'o4',
    ]) {
      expect(isReasoningModel(m), m).toBe(true)
    }
  })
  it('leaves classic chat models alone (they keep temperature + seed)', () => {
    for (const m of ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4-turbo']) {
      expect(isReasoningModel(m), m).toBe(false)
    }
  })
})

describe('LLM client · agy backend config', () => {
  // agy is opt-in (LLM_BACKEND=agy) and reads AGY_BIN / AGY_MODEL, with
  // agyModel falling back to GEMINI_MODEL then gemini-2.5-pro. Save/restore the
  // env keys we mutate so these tests never leak into the rest of the suite.
  const ENV_KEYS = ['LLM_BACKEND', 'AGY_BIN', 'AGY_MODEL', 'GEMINI_MODEL'] as const
  let savedEnv: Record<string, string | undefined>

  beforeEach(() => {
    savedEnv = {}
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k]
  })
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k]
      else process.env[k] = savedEnv[k]
    }
  })

  it('selects the agy backend when LLM_BACKEND=agy', () => {
    process.env.LLM_BACKEND = 'agy'
    expect(loadConfigFromEnv().backend).toBe('agy')
  })

  /**
   * The default has to be a model `agy` still recognises, and `gemini-2.5-pro`
   * is not one. Measured 2026-08-11:
   *
   *   $ agy -p … --model gemini-2.5-pro --sandbox
   *   Error: invalid model selection … not recognized as a known model
   *   exit 1
   *
   * So every agy call that did not set AGY_MODEL explicitly failed on argv,
   * before the prompt was ever sent. `hallazgos-pipeline.sh` and
   * `auto-curate-weekly.sh` were unaffected only because they happen to export
   * `gemini-3.5-flash-medium` themselves — agy takes the effort baked into the
   * model string, which is why no `--effort` flag is needed here.
   *
   * The old assertion pinned the broken value and stayed green, which is the
   * failure mode DATA_INTEGRITY.md rule 1 is about: a test restating a constant
   * cannot notice that the constant stopped being true upstream.
   */
  it('defaults agyBin to "agy" and agyModel to a model agy recognises', () => {
    delete process.env.AGY_BIN
    delete process.env.AGY_MODEL
    delete process.env.GEMINI_MODEL
    const config = loadConfigFromEnv()
    expect(config.agyBin).toBe('agy')
    expect(config.agyModel).toBe('gemini-3.5-flash-medium')
  })

  it('honors AGY_BIN and AGY_MODEL overrides', () => {
    process.env.AGY_BIN = '/Users/x/.local/bin/agy'
    process.env.AGY_MODEL = 'gemini-3.0-pro'
    const config = loadConfigFromEnv()
    expect(config.agyBin).toBe('/Users/x/.local/bin/agy')
    expect(config.agyModel).toBe('gemini-3.0-pro')
  })

  /**
   * GEMINI_MODEL used to stand in for AGY_MODEL so one env var could steer
   * both CLIs. With the gemini CLI retired there is no "both" left — all the
   * variable can still do is let a stale value for a dead backend silently
   * pick the model of a live one. `auto-curate-weekly.sh` exported
   * GEMINI_MODEL=gemini-2.5-pro for exactly that reason, and gemini-2.5-pro is
   * a model agy now rejects outright. AGY_MODEL is the only knob.
   */
  it('ignores GEMINI_MODEL — a retired backend cannot pick agy’s model', () => {
    delete process.env.AGY_MODEL
    process.env.GEMINI_MODEL = 'gemini-2.5-pro'
    expect(loadConfigFromEnv().agyModel).toBe('gemini-3.5-flash-medium')
  })
})

/**
 * The legacy `gemini` CLI is retired — `agy` is Google's CLI now, and the
 * comment on callAgy has said so since it was written. What kept gemini alive
 * was `existsSync(geminiBinPath)` in the auto-select cascade, a check that
 * proves the file is on disk and nothing about whether it can answer.
 *
 * Measured 2026-08-11, both the PATH copy and the sandboxed one this repo
 * points at: `gemini -p … -o json` prints «Opening authentication page in your
 * browser» and waits on an OAuth callback that never arrives, because stdin is
 * `ignore` and nothing opens a browser. Three minutes per call, then the
 * watchdog. GEMINI_API_KEY does not change it.
 *
 * Note the outer beforeEach points GEMINI_BIN at a nonexistent path so the rest
 * of the suite is isolated from a real install — which is exactly why nothing
 * here ever noticed. These tests point it at a file that DOES exist.
 */
describe('LLM client · the retired gemini CLI is never auto-selected', () => {
  const ENV_KEYS = [
    'LLM_BACKEND',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GEMINI_BIN',
    'AGY_BIN',
    'CLAUDE_CODE_BIN',
  ] as const
  let savedEnv: Record<string, string | undefined>

  beforeEach(() => {
    savedEnv = {}
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k]
    delete process.env.LLM_BACKEND
    delete process.env.OPENAI_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    // A gemini binary that really is on disk — the situation on this machine,
    // and the one the rest of the suite deliberately hides from itself.
    process.env.GEMINI_BIN = '/usr/bin/env'
  })
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k]
      else process.env[k] = savedEnv[k]
    }
  })

  it('falls through an installed gemini binary to agy, its replacement', () => {
    process.env.AGY_BIN = '/bin/sh'
    process.env.CLAUDE_CODE_BIN = '/bin/sh'
    expect(loadConfigFromEnv().backend).toBe('agy')
  })

  it('falls through to claude-code when agy is absent too', () => {
    process.env.AGY_BIN = '/nonexistent/agy'
    process.env.CLAUDE_CODE_BIN = '/bin/sh'
    expect(loadConfigFromEnv().backend).toBe('claude-code')
  })

  it('still honours an explicit LLM_BACKEND=gemini', () => {
    // Retiring the auto-path is not the same as removing the transport. An
    // operator who names the backend gets it, and the watchdog reports what
    // happened — same rule the metered backends get.
    process.env.LLM_BACKEND = 'gemini'
    expect(loadConfigFromEnv().backend).toBe('gemini')
  })
})

describe('extractJsonPayload (shared gemini/agy JSON slicer)', () => {
  it('returns plain JSON untouched', () => {
    const json = '{"reply":"ok"}'
    expect(extractJsonPayload(json)).toBe(json)
    expect(JSON.parse(extractJsonPayload(json))).toEqual({ reply: 'ok' })
  })

  it('strips ```json fences', () => {
    const fenced = '```json\n{"reply":"fenced"}\n```'
    expect(JSON.parse(extractJsonPayload(fenced))).toEqual({ reply: 'fenced' })
  })

  it('strips bare ``` fences', () => {
    const fenced = '```\n{"reply":"bare"}\n```'
    expect(JSON.parse(extractJsonPayload(fenced))).toEqual({ reply: 'bare' })
  })

  it('slices past leading preamble text', () => {
    const preamble = 'Here is your JSON:\n{"reply":"after preamble"}'
    expect(JSON.parse(extractJsonPayload(preamble))).toEqual({ reply: 'after preamble' })
  })

  it('handles a JSON array payload after preamble', () => {
    expect(JSON.parse(extractJsonPayload('sure: [1,2,3]'))).toEqual([1, 2, 3])
  })
})

describe('claudeEnvelopeToRaw (salvage result when structured_output is absent)', () => {
  it('uses structured_output when present', () => {
    expect(claudeEnvelopeToRaw({ structured_output: { correlation: null } })).toBe(
      '{"correlation":null}',
    )
  })
  it('salvages schema-conforming JSON from result (the nullable-answer case)', () => {
    // Observed: claude -p --json-schema puts the answer in `result` not
    // `structured_output` when the model returns e.g. {"correlation": null}.
    expect(JSON.parse(claudeEnvelopeToRaw({ result: '{"correlation": null}' })!)).toEqual({
      correlation: null,
    })
  })
  it('salvages fenced JSON from result', () => {
    expect(JSON.parse(claudeEnvelopeToRaw({ result: '```json\n{"reply":"ok"}\n```' })!)).toEqual({
      reply: 'ok',
    })
  })
  it('returns null when result is not JSON', () => {
    expect(claudeEnvelopeToRaw({ result: 'sorry, no match found' })).toBeNull()
  })
  it('returns null when neither field is usable', () => {
    expect(claudeEnvelopeToRaw({})).toBeNull()
    expect(claudeEnvelopeToRaw({ result: '' })).toBeNull()
  })

  describe('circuit breaker is armed by default', () => {
    it('trips without anyone calling resetBudget first', async () => {
      // The regression. resetCircuit was reachable only through resetBudget, so a
      // script that never called it ran with NO breaker: the verdict engine made
      // 190 consecutive calls to a dead backend, each reporting zero tokens and
      // zero cost, and nothing stopped it. A guard that must be opted into is not
      // a guard. Simulate a cold module: no resetBudget, all calls failing.
      __resetCircuitForTest()
      expect(getCircuitState()).toBeNull()
      for (let i = 0; i < 10; i += 1) __notifyResultForTest(false)
      const st = getCircuitState()
      expect(st).not.toBeNull()
      expect(st?.tripped).toBe(true)
    })

    it('a success resets the streak', () => {
      __resetCircuitForTest()
      for (let i = 0; i < 9; i += 1) __notifyResultForTest(false)
      __notifyResultForTest(true)
      expect(getCircuitState()?.tripped).toBe(false)
      for (let i = 0; i < 9; i += 1) __notifyResultForTest(false)
      expect(getCircuitState()?.tripped).toBe(false)
    })
  })
})

/**
 * Por qué cuatro noches de fallos no se pueden diagnosticar.
 *
 * Del 18 al 22-ago-2026 el nocturno acumuló 10 hallazgos `backend-refusing`:
 * `claude -p` salía 1 habiendo gastado 0 tokens y $0. El mensaje que quedó en el
 * log —y de ahí en el manifiesto y en el parte— era éste:
 *
 *     claude exit 1: {"is_error":true,"duration_api_ms":0,"num_turns":1,
 *     "stop_reason":"stop_sequence","session_id":"…","total_cost_usd":0,
 *     "usage":{…ceros…},"service_tier":"standard","cach
 *
 * Todo cabecera. El motivo vive en `result`, y en el envelope REAL capturado el
 * 23-ago está en el **índice 1007**, mientras `client.ts` cortaba en **400**:
 * era inalcanzable por construcción, no por mala suerte.
 *
 * El camino de al lado ya lo hacía bien —cuando el CLI sale 0 con
 * `is_error:true`, el código lee `envelope.result`—; sólo la rama de salida !=0
 * tiraba el envelope entero y recortaba texto en crudo.
 *
 * El fixture es una respuesta REAL del CLI 2.1.241, provocada con un modelo
 * inexistente, que reproduce la firma exacta del fallo de producción
 * (`is_error:true`, `duration_api_ms:0`, `num_turns:1`, usage a cero).
 */
describe('describeClaudeFailure · un fallo del CLI tiene que decir por qué', () => {
  const envelope = readFileSync(
    resolve(__dirname, '../fixtures/claude-code-error-envelope_2026-08-23.json'),
    'utf8',
  )

  // Prueba de que el fixture reproduce el caso, no uno parecido: si el motivo
  // cupiera en los primeros 400 caracteres no habría defecto que arreglar.
  it('el fixture reproduce el caso: `result` cae más allá del recorte viejo', () => {
    expect(envelope.indexOf('"result"')).toBeGreaterThan(400)
    expect(envelope.slice(0, 400)).not.toMatch(/access to it/)
  })

  it('nombra el motivo cuando stderr viene vacío — el caso de producción', () => {
    const msg = describeClaudeFailure(1, envelope, '')
    expect(msg).toMatch(/may not have access to it|no exista|issue with the selected model/i)
  })

  // El tag de stderr es el código legible por máquina y no siempre está; cuando
  // está, no debe desplazar a la frase que explica.
  it('conserva el tag de stderr Y la frase del envelope', () => {
    const msg = describeClaudeFailure(
      1,
      envelope,
      '[claude-code:unrecognized_model] {"model":"no-such-model-xyz"}',
    )
    expect(msg).toMatch(/unrecognized_model/)
    expect(msg).toMatch(/issue with the selected model/i)
  })

  it('sigue diciendo el código de salida', () => {
    expect(describeClaudeFailure(1, envelope, '')).toMatch(/exit 1/)
  })

  // Falla abierto: si stdout no es JSON no se inventa nada y se enseña lo que hay.
  it('cae a la salida en crudo cuando no hay envelope que leer', () => {
    const msg = describeClaudeFailure(127, '', 'claude: command not found')
    expect(msg).toMatch(/command not found/)
    expect(msg).toMatch(/exit 127/)
  })

  it('no se queda mudo cuando no hay ni envelope ni stderr', () => {
    expect(describeClaudeFailure(1, '', '').trim().length).toBeGreaterThan(0)
  })
})
