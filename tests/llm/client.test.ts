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
})

afterEach(() => {
  rmSync(cacheDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

function ollamaSuccess(content: string, tokens = 50) {
  return Promise.resolve({
    ok: true,
    status: 200,
    text: async () => '',
    json: async () => ({ message: { content }, prompt_eval_count: Math.floor(tokens / 2), eval_count: Math.ceil(tokens / 2) }),
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
      systemPrompt: 'sys', userPrompt: 'same', schema: TestSchema, input: { x: 1 },
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
      config: { ...loadConfigFromEnv(), backend: 'openai' as const, openaiApiKey: 'sk-test', cacheDir },
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
      systemPrompt: 's', userPrompt: 'u', promptVersion: 'oa-cost-v1',
      schema: TestSchema, input: { x: 1 },
      config: { ...loadConfigFromEnv(), backend: 'openai' as const, openaiApiKey: 'sk-test', cacheDir, openaiModel: 'gpt-4o-mini' },
    })

    const stats = gatherCacheStats(cacheDir)
    // 500 in @ 0.15/1M + 500 out @ 0.60/1M = ~$0.000375
    expect(stats.totalCostUSD).toBeGreaterThan(0)
    expect(stats.totalCostUSD).toBeLessThan(0.001)
  })
})

describe('LLM client · token budget', () => {
  it('short-circuits further calls when budget is breached', async () => {
    resetBudget(200)  // tiny budget
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
