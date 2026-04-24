/**
 * Unit tests for the LLM client layer. We intercept global fetch so we can
 * exercise Ollama + OpenAI transports without a live server. Cache directory
 * is redirected to a per-test tmpdir so tests never collide with each other
 * or with real cached entries from manual runs.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { z } from 'zod'
import { callLLM, gatherCacheStats, loadConfigFromEnv, resetBudget } from '../../src/llm/client'

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
    // even with openai→ollama fallback × 3 attempts each.
    expect(elapsed).toBeLessThan(1000)
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]))
    expect(urls.some((u) => u.includes('openai.com'))).toBe(true)
    expect(urls.some((u) => u.includes('localhost:11434'))).toBe(true)
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
