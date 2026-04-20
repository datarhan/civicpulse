/**
 * LLM client abstraction.
 *
 * Two backends, same call signature:
 *   - Ollama (default, local, free) — POST http://localhost:11434/api/chat
 *   - OpenAI (fallback, cloud, paid) — direct fetch to the chat-completions API
 *
 * The public entrypoint `callLLM<T>` does:
 *   1. Compute a content-addressed cache key (model + promptVersion + schema + input)
 *   2. Check `.llm-cache/<hash>.json` — hit? return it. Miss? call the backend.
 *   3. Enforce per-run token budget (fails closed when breached)
 *   4. Retry up to 2× on schema-invalid output (temp=0, seed=42 on OpenAI)
 *   5. Record telemetry ({tokenCount, latencyMs, retryCount, cost}) alongside the cached output
 *
 * Any failure returns `null`; callers must treat that as "no suggestion for
 * this input" and continue. We never throw on LLM errors — the batch should
 * finish even if the model is briefly flaky.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import type { ZodTypeAny, z } from 'zod'
import { zodToJsonSchema } from './schemas'

// ─── Config ────────────────────────────────────────────────────────────────

export type Backend = 'ollama' | 'openai'

export interface ClientConfig {
  backend: Backend
  ollamaUrl: string
  ollamaModel: string
  openaiModel: string
  openaiApiKey?: string
  cacheDir: string
  maxTokensPerRun: number
}

export function loadConfigFromEnv(): ClientConfig {
  return {
    backend: (process.env.LLM_BACKEND as Backend) || 'ollama',
    ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'qwen2.5:14b-instruct',
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    openaiApiKey: process.env.OPENAI_API_KEY,
    cacheDir: resolve('.llm-cache'),
    maxTokensPerRun: Number(process.env.LLM_MAX_TOKENS_PER_RUN || 500_000),
  }
}

// ─── Telemetry + token budget ───────────────────────────────────────────────

interface RunBudget {
  tokensUsed: number
  limit: number
}

let currentBudget: RunBudget | null = null

/** Reset the per-run budget. Called at the top of every CLI script that uses
 *  the LLM — prevents a runaway from carrying across batch boundaries. */
export function resetBudget(limit?: number) {
  currentBudget = { tokensUsed: 0, limit: limit ?? Number(process.env.LLM_MAX_TOKENS_PER_RUN || 500_000) }
}

function chargeBudget(tokens: number): boolean {
  if (!currentBudget) return true  // unbounded when explicitly unused
  currentBudget.tokensUsed += tokens
  return currentBudget.tokensUsed <= currentBudget.limit
}

export function getBudget(): RunBudget | null {
  return currentBudget
}

// ─── Cache ──────────────────────────────────────────────────────────────────

export interface CacheEntry<T> {
  // Contract:
  result: T | null
  // Telemetry:
  backend: Backend
  model: string
  promptVersion: string
  tokenCount: number
  latencyMs: number
  retryCount: number
  costUSD: number
  createdAt: string
}

export interface CacheStats {
  entries: number
  totalTokens: number
  totalCostUSD: number
  totalBytes: number
}

function cacheKey(opts: {
  backend: Backend
  model: string
  promptVersion: string
  schema: ZodTypeAny
  input: unknown
}): string {
  const schemaJson = JSON.stringify(zodToJsonSchema(opts.schema))
  const payload = JSON.stringify({
    backend: opts.backend,
    model: opts.model,
    promptVersion: opts.promptVersion,
    schemaJson,
    input: opts.input,
  })
  return createHash('sha256').update(payload).digest('hex')
}

function readCache<T>(cacheDir: string, key: string): CacheEntry<T> | null {
  const path = resolve(cacheDir, `${key}.json`)
  if (!existsSync(path)) return null
  try { return JSON.parse(readFileSync(path, 'utf8')) as CacheEntry<T> } catch { return null }
}

function writeCache<T>(cacheDir: string, key: string, entry: CacheEntry<T>): void {
  mkdirSync(cacheDir, { recursive: true })
  writeFileSync(resolve(cacheDir, `${key}.json`), JSON.stringify(entry, null, 2))
}

export function gatherCacheStats(cacheDir: string): CacheStats {
  if (!existsSync(cacheDir)) return { entries: 0, totalTokens: 0, totalCostUSD: 0, totalBytes: 0 }
  let entries = 0, totalTokens = 0, totalCost = 0, totalBytes = 0
  for (const name of readdirSync(cacheDir)) {
    if (!name.endsWith('.json')) continue
    const p = resolve(cacheDir, name)
    try {
      totalBytes += statSync(p).size
      const e = JSON.parse(readFileSync(p, 'utf8')) as CacheEntry<unknown>
      entries += 1
      totalTokens += e.tokenCount ?? 0
      totalCost += e.costUSD ?? 0
    } catch { /* ignore corrupt cache entry */ }
  }
  return { entries, totalTokens, totalCostUSD: totalCost, totalBytes }
}

// ─── Backend implementations ────────────────────────────────────────────────

interface RawCall {
  systemPrompt: string
  userPrompt: string
  schema: ZodTypeAny
  config: ClientConfig
}

interface RawResult {
  raw: string
  tokenCount: number
  costUSD: number
}

async function callOllama(req: RawCall): Promise<RawResult> {
  const body = {
    model: req.config.ollamaModel,
    messages: [
      { role: 'system', content: req.systemPrompt },
      { role: 'user', content: req.userPrompt },
    ],
    // Ask Ollama for JSON output; most models (qwen2.5, llama3.*) honor this.
    format: zodToJsonSchema(req.schema),
    stream: false,
    options: { temperature: 0, seed: 42 },
  }
  const res = await fetch(`${req.config.ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`)
  const data = await res.json() as {
    message: { content: string }
    prompt_eval_count?: number
    eval_count?: number
  }
  const tokens = (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0)
  return { raw: data.message.content, tokenCount: tokens, costUSD: 0 }
}

// OpenAI pricing per 1M tokens (gpt-4o-mini, 2024-11). Embed both directions so
// cost telemetry is accurate without an env lookup at call time.
const OPENAI_PRICING: Record<string, { in: number; out: number }> = {
  'gpt-4o-mini': { in: 0.15, out: 0.60 },
  'gpt-4o': { in: 2.50, out: 10.00 },
  'gpt-4.1-mini': { in: 0.40, out: 1.60 },
}

async function callOpenAI(req: RawCall): Promise<RawResult> {
  if (!req.config.openaiApiKey) throw new Error('OPENAI_API_KEY not set')
  const body = {
    model: req.config.openaiModel,
    messages: [
      { role: 'system', content: req.systemPrompt },
      { role: 'user', content: req.userPrompt },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'civicpulse_llm_response',
        strict: true,
        schema: zodToJsonSchema(req.schema),
      },
    },
    temperature: 0,
    seed: 42,
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${req.config.openaiApiKey}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`)
  const data = await res.json() as {
    choices: { message: { content: string } }[]
    usage: { prompt_tokens: number; completion_tokens: number }
  }
  const pricing = OPENAI_PRICING[req.config.openaiModel] ?? { in: 0, out: 0 }
  const costUSD = (data.usage.prompt_tokens * pricing.in + data.usage.completion_tokens * pricing.out) / 1_000_000
  return {
    raw: data.choices[0].message.content,
    tokenCount: data.usage.prompt_tokens + data.usage.completion_tokens,
    costUSD,
  }
}

// ─── Public entrypoint ──────────────────────────────────────────────────────

export interface CallLlmOptions<TSchema extends ZodTypeAny> {
  systemPrompt: string
  userPrompt: string
  promptVersion: string
  schema: TSchema
  /** Machine-readable input included in the cache key (not sent to the LLM). */
  input: unknown
  config?: ClientConfig
  maxRetries?: number
}

export async function callLLM<TSchema extends ZodTypeAny>(
  opts: CallLlmOptions<TSchema>,
): Promise<z.infer<TSchema> | null> {
  const config = opts.config ?? loadConfigFromEnv()
  const maxRetries = opts.maxRetries ?? 2

  const key = cacheKey({
    backend: config.backend,
    model: config.backend === 'ollama' ? config.ollamaModel : config.openaiModel,
    promptVersion: opts.promptVersion,
    schema: opts.schema,
    input: opts.input,
  })

  const cached = readCache<z.infer<TSchema>>(config.cacheDir, key)
  if (cached) return cached.result

  // Budget check before making the call — estimate by prompt length.
  const approxTokens = Math.ceil((opts.systemPrompt.length + opts.userPrompt.length) / 4)
  if (!chargeBudget(approxTokens)) {
    process.stderr.write(`[llm] run token budget exceeded (${currentBudget?.tokensUsed}/${currentBudget?.limit}); skipping call\n`)
    return null
  }

  const t0 = Date.now()
  let result: z.infer<TSchema> | null = null
  let tokenCount = 0
  let costUSD = 0
  let attempt = 0
  let lastErr = ''

  while (attempt <= maxRetries) {
    try {
      const raw: RawResult = config.backend === 'ollama'
        ? await callOllama({ ...opts, config })
        : await callOpenAI({ ...opts, config })
      tokenCount += raw.tokenCount
      costUSD += raw.costUSD
      // Charge the real token count (minus the pre-estimate).
      chargeBudget(Math.max(0, raw.tokenCount - (attempt === 0 ? approxTokens : 0)))

      const parsed = opts.schema.safeParse(JSON.parse(raw.raw))
      if (parsed.success) {
        result = parsed.data as z.infer<TSchema>
        break
      }
      lastErr = parsed.error.toString().slice(0, 200)
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err)
    }
    attempt += 1
  }

  const entry: CacheEntry<z.infer<TSchema>> = {
    result,
    backend: config.backend,
    model: config.backend === 'ollama' ? config.ollamaModel : config.openaiModel,
    promptVersion: opts.promptVersion,
    tokenCount,
    latencyMs: Date.now() - t0,
    retryCount: attempt,
    costUSD,
    createdAt: new Date().toISOString(),
  }
  writeCache(config.cacheDir, key, entry)

  if (!result) {
    process.stderr.write(`[llm] all ${maxRetries + 1} attempts failed: ${lastErr}\n`)
  }
  return result
}

// Ensure we create the cache dir only at use-time (tests may override the path).
export function ensureCacheDir(dir: string) {
  mkdirSync(dir, { recursive: true })
}
// Suppress unused-import warning: zod types are re-exported implicitly via z.infer in public API.
export type { z }
void dirname
