/**
 * LLM client abstraction.
 *
 * Four backends, same call signature:
 *   - Ollama       (local, free)                 — POST /api/chat
 *   - OpenAI       (cloud, pay-per-token)        — /v1/chat/completions (json_schema)
 *   - Anthropic    (cloud, pay-per-token)        — /v1/messages (tool_use)
 *   - claude-code  (Max plan, rate-limited, $0)  — spawns `claude -p` CLI with --json-schema
 *
 * Anthropic is the recommended backend for the vote-extraction pipeline:
 * it handles noisy Spanish/Valencian Whisper transcripts better than a
 * local quant, and its prompt-cache feature means the (long, identical)
 * pleno-vote system prompt is re-used at 0.10× cost across every segment
 * of a given pleno.
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

export type Backend = 'ollama' | 'openai' | 'anthropic' | 'claude-code'

export interface ClientConfig {
  backend: Backend
  ollamaUrl: string
  ollamaModel: string
  openaiModel: string
  openaiApiKey?: string
  anthropicModel: string
  anthropicApiKey?: string
  /**
   * claude-code backend: which model alias to pass via `claude --model`.
   * Accepts 'haiku' | 'sonnet' | 'opus' | full model IDs.
   * Max plan covers this at $0 billing — API-equivalent cost is reported
   * in telemetry as an informational number (envelope.total_cost_usd).
   */
  claudeCodeModel: string
  claudeCodeBin: string
  cacheDir: string
  maxTokensPerRun: number
}

export function loadConfigFromEnv(): ClientConfig {
  // Backend auto-selection hierarchy when LLM_BACKEND is unset:
  //   1. openai       — if OPENAI_API_KEY is exported (metered, no subscription burn)
  //   2. anthropic    — if ANTHROPIC_API_KEY is exported (metered, no subscription burn)
  //   3. ollama       — local fallback
  // Explicitly NOT auto-selecting `claude-code` — that backend burns the user's
  // Max-plan quota (the same quota powering interactive Claude Code sessions)
  // and one full-pleno extract can torch a 5-hour window. It must be opted
  // into via LLM_BACKEND=claude-code.
  const envBackend = process.env.LLM_BACKEND as Backend | undefined
  let backend: Backend
  if (envBackend) {
    backend = envBackend
  } else if (process.env.OPENAI_API_KEY) {
    backend = 'openai'
  } else if (process.env.ANTHROPIC_API_KEY) {
    backend = 'anthropic'
  } else {
    backend = 'ollama'
  }
  return {
    backend,
    ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'qwen2.5:14b-instruct',
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    openaiApiKey: process.env.OPENAI_API_KEY,
    // Haiku 4.5 — fast, cheap, excellent for structured extraction. Upgrade
    // to claude-sonnet-4-6 if precision on noisy Whisper transcripts proves
    // inadequate; drop back to claude-haiku-4-5-20251001 once stable.
    anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    // Default sonnet — Haiku tends to return null on noisy Whisper transcripts
    // (WER ~5-10% on Spanish proper nouns). Sonnet reasons through the
    // garbled tokens and still extracts votes at moderate confidence.
    claudeCodeModel: process.env.CLAUDE_CODE_MODEL || 'sonnet',
    claudeCodeBin: process.env.CLAUDE_CODE_BIN || 'claude',
    cacheDir: resolve('.llm-cache'),
    maxTokensPerRun: Number(process.env.LLM_MAX_TOKENS_PER_RUN || 500_000),
  }
}

function backendModel(config: ClientConfig): string {
  if (config.backend === 'ollama') return config.ollamaModel
  if (config.backend === 'openai') return config.openaiModel
  if (config.backend === 'claude-code') return `claude-code:${config.claudeCodeModel}`
  return config.anthropicModel
}

// ─── Telemetry + token budget ───────────────────────────────────────────────

interface RunBudget {
  tokensUsed: number
  limit: number
}

let currentBudget: RunBudget | null = null

/** Reset the per-run budget. Called at the top of every CLI script that uses
 *  the LLM — prevents a runaway from carrying across batch boundaries.
 *
 *  Defaults:
 *    500K tokens for ollama (local, no billing; conservative loop-guard)
 *    2M tokens for metered backends (openai/anthropic) — a full pleno
 *      (~400 windows × ~4K tokens) needs ~1.5M. At gpt-5.4-mini rates
 *      this is ~$3 worst-case per run, down to ~$0.40 with prompt caching.
 *    4M tokens for claude-code (Max plan, $0 billed) — the CLI's own
 *      rate-limit is the real ceiling.
 *  Override via env LLM_MAX_TOKENS_PER_RUN or the function arg. */
export function resetBudget(limit?: number) {
  const envLimit = Number(process.env.LLM_MAX_TOKENS_PER_RUN || 0)
  const backend = process.env.LLM_BACKEND
  const defaultLimit =
    backend === 'claude-code'
      ? 4_000_000
      : backend === 'openai' || backend === 'anthropic'
        ? 2_000_000
        : 500_000
  currentBudget = {
    tokensUsed: 0,
    limit: limit ?? (envLimit > 0 ? envLimit : defaultLimit),
  }
}

function chargeBudget(tokens: number): boolean {
  if (!currentBudget) return true // unbounded when explicitly unused
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
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as CacheEntry<T>
  } catch {
    return null
  }
}

function writeCache<T>(cacheDir: string, key: string, entry: CacheEntry<T>): void {
  mkdirSync(cacheDir, { recursive: true })
  writeFileSync(resolve(cacheDir, `${key}.json`), JSON.stringify(entry, null, 2))
}

export function gatherCacheStats(cacheDir: string): CacheStats {
  if (!existsSync(cacheDir)) return { entries: 0, totalTokens: 0, totalCostUSD: 0, totalBytes: 0 }
  let entries = 0,
    totalTokens = 0,
    totalCost = 0,
    totalBytes = 0
  for (const name of readdirSync(cacheDir)) {
    if (!name.endsWith('.json')) continue
    const p = resolve(cacheDir, name)
    try {
      totalBytes += statSync(p).size
      const e = JSON.parse(readFileSync(p, 'utf8')) as CacheEntry<unknown>
      entries += 1
      totalTokens += e.tokenCount ?? 0
      totalCost += e.costUSD ?? 0
    } catch {
      /* ignore corrupt cache entry */
    }
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
  const data = (await res.json()) as {
    message: { content: string }
    prompt_eval_count?: number
    eval_count?: number
  }
  const tokens = (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0)
  return { raw: data.message.content, tokenCount: tokens, costUSD: 0 }
}

// OpenAI pricing per 1M tokens. `cacheRead` applies to prompt-cache hits
// (OpenAI Prompt Caching · automatic for prompts >1024 tokens), reported in
// the response under `usage.prompt_tokens_details.cached_tokens`.
// openai.com/api/pricing blocks automated fetches (HTTP 403) so these have
// to be pasted in by hand. Unknown models fall back to zero (cost dashboard
// shows $0 for those calls).
const OPENAI_PRICING: Record<string, { in: number; out: number; cacheRead?: number }> = {
  // 4.x family (verified from pricing page snapshots · 2025-06):
  'gpt-4o-mini': { in: 0.15, out: 0.6, cacheRead: 0.075 },
  'gpt-4o': { in: 2.5, out: 10.0, cacheRead: 1.25 },
  'gpt-4.1-mini': { in: 0.4, out: 1.6, cacheRead: 0.1 },
  'gpt-4.1-nano': { in: 0.1, out: 0.4 },
  'gpt-4.1': { in: 2.0, out: 8.0 },
  // 5.x family — verified rows carry cacheRead; placeholders still bracket
  // the 4.x successor tier for unverified variants.
  'gpt-5-nano': { in: 0.05, out: 0.4 },
  'gpt-5-mini': { in: 0.25, out: 2.0 },
  'gpt-5': { in: 1.25, out: 10.0 },
  'gpt-5.1-mini': { in: 0.25, out: 2.0 },
  'gpt-5.1': { in: 1.25, out: 10.0 },
  'gpt-5.2-mini': { in: 0.25, out: 2.0 },
  'gpt-5.2': { in: 1.25, out: 10.0 },
  'gpt-5.4-nano': { in: 0.05, out: 0.4 },
  'gpt-5.4-mini': { in: 0.75, out: 4.5, cacheRead: 0.075 }, // verified 2026-04-24
  'gpt-5.4': { in: 1.25, out: 10.0 },
  'gpt-5.4-pro': { in: 5.0, out: 40.0 },
  // Audio:
  'whisper-1': { in: 0, out: 0 }, // billed per-minute, not per-token
}

// Anthropic pricing per 1M tokens (claude-haiku-4-5 launched Oct-2025).
// input_cache_read is priced at 0.10× base input, input_cache_write at 1.25×.
// Update when Anthropic publishes newer models.
const ANTHROPIC_PRICING: Record<
  string,
  { in: number; out: number; cacheRead: number; cacheWrite: number }
> = {
  'claude-haiku-4-5-20251001': { in: 1.0, out: 5.0, cacheRead: 0.1, cacheWrite: 1.25 },
  'claude-sonnet-4-6': { in: 3.0, out: 15.0, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-opus-4-7': { in: 15.0, out: 75.0, cacheRead: 1.5, cacheWrite: 18.75 },
}

/**
 * Anthropic Messages API via tool_use. The zod schema becomes the forced
 * tool's input_schema, so the model returns structured JSON exactly matching
 * the contract — same guarantee as OpenAI's json_schema mode.
 *
 * Prompt cache: the system block is marked cacheable. Vote-extraction batches
 * reuse the same system prompt for every segment of a pleno (typically 5–20
 * calls within the 5-min cache TTL), so cached reads dominate — the total
 * cost per pleno drops to roughly one full write + N× cheap reads.
 */
async function callAnthropic(req: RawCall): Promise<RawResult> {
  if (!req.config.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY not set')
  const toolInputSchema = zodToJsonSchema(req.schema) as Record<string, unknown>
  const body = {
    model: req.config.anthropicModel,
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: req.systemPrompt,
        // 5-minute ephemeral cache — the API will read it back at 10%
        // cost on every call within the TTL. No-op on the first call of
        // a batch (cache write) but dominant savings after that.
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: req.userPrompt }],
    tools: [
      {
        name: 'emit_structured_output',
        description:
          'Emit the structured output matching the schema. Always call this tool; never respond in prose.',
        input_schema: toolInputSchema,
      },
    ],
    tool_choice: { type: 'tool', name: 'emit_structured_output' },
    temperature: 0,
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': req.config.anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as {
    content: Array<{ type: string; name?: string; input?: unknown; text?: string }>
    usage: {
      input_tokens: number
      output_tokens: number
      cache_creation_input_tokens?: number
      cache_read_input_tokens?: number
    }
  }
  const toolBlock = data.content.find((c) => c.type === 'tool_use')
  if (!toolBlock || !toolBlock.input) {
    throw new Error(
      `Anthropic response missing forced tool_use block (got ${data.content.map((c) => c.type).join(',')})`,
    )
  }
  const raw = JSON.stringify(toolBlock.input)
  const pricing = ANTHROPIC_PRICING[req.config.anthropicModel] ?? {
    in: 0,
    out: 0,
    cacheRead: 0,
    cacheWrite: 0,
  }
  const u = data.usage
  const costUSD =
    (u.input_tokens * pricing.in +
      u.output_tokens * pricing.out +
      (u.cache_creation_input_tokens ?? 0) * pricing.cacheWrite +
      (u.cache_read_input_tokens ?? 0) * pricing.cacheRead) /
    1_000_000
  const tokenCount =
    u.input_tokens +
    u.output_tokens +
    (u.cache_creation_input_tokens ?? 0) +
    (u.cache_read_input_tokens ?? 0)
  return { raw, tokenCount, costUSD }
}

/**
 * Claude Code CLI backend.
 *
 * Spawns `claude -p <user_prompt>` with `--json-schema`, `--output-format json`,
 * `--system-prompt`, and the minimal tool surface (`--disable-slash-commands
 * --disallowedTools "*"`) so the structured-extraction cost floor is as low
 * as possible.
 *
 * Works with Anthropic Max plan out of the box (uses the OAuth login from the
 * `claude` CLI session, no ANTHROPIC_API_KEY required). Each call costs $0 in
 * actual billing on Max — `total_cost_usd` in the envelope reports what an
 * API-equivalent call would have cost, purely for telemetry.
 *
 * The output envelope includes `structured_output` when `--json-schema` is
 * supplied; that field is the schema-validated JSON result. We return its
 * stringified form so the callLLM wrapper can re-validate it via zod.
 */
async function callClaudeCode(req: RawCall): Promise<RawResult> {
  const { spawn } = await import('node:child_process')
  const schemaJson = JSON.stringify(zodToJsonSchema(req.schema))

  return await new Promise<RawResult>((resolvePromise, rejectPromise) => {
    const args = [
      '-p',
      req.userPrompt,
      '--system-prompt',
      req.systemPrompt,
      '--json-schema',
      schemaJson,
      '--output-format',
      'json',
      '--model',
      req.config.claudeCodeModel,
      '--disable-slash-commands',
      '--disallowedTools',
      '*',
    ]
    const child = spawn(req.config.claudeCodeBin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => {
      stdout += d.toString()
    })
    child.stderr.on('data', (d) => {
      stderr += d.toString()
    })
    child.on('error', (err) => rejectPromise(err))
    child.on('close', (code) => {
      if (code !== 0) {
        return rejectPromise(
          new Error(`claude exit ${code}: ${stderr.slice(0, 400) || stdout.slice(0, 400)}`),
        )
      }
      try {
        const envelope = JSON.parse(stdout) as {
          is_error?: boolean
          result?: string
          structured_output?: unknown
          total_cost_usd?: number
          usage?: {
            input_tokens?: number
            output_tokens?: number
            cache_creation_input_tokens?: number
            cache_read_input_tokens?: number
          }
        }
        if (envelope.is_error) {
          return rejectPromise(
            new Error(`claude CLI reported error: ${envelope.result || '(no detail)'}`),
          )
        }
        if (envelope.structured_output === undefined) {
          return rejectPromise(
            new Error(
              `claude CLI returned no structured_output (result: ${String(envelope.result).slice(0, 200)})`,
            ),
          )
        }
        const u = envelope.usage ?? {}
        // Budget-charged tokens: only count the "real work" tokens
        // (input + output). Cache reads + creation are quasi-free on the
        // Max plan — including them would blow the 500K budget after a
        // handful of calls because the Claude Code CLI's own system prompt
        // contributes ~130K cached tokens per invocation.
        const tokenCount = (u.input_tokens ?? 0) + (u.output_tokens ?? 0)
        resolvePromise({
          raw: JSON.stringify(envelope.structured_output),
          tokenCount,
          // On Max plan the actual bill is $0. We keep the API-equivalent
          // number from the envelope for cost-awareness reporting.
          costUSD: envelope.total_cost_usd ?? 0,
        })
      } catch (err) {
        rejectPromise(new Error(`claude CLI output not JSON: ${String(err).slice(0, 200)}`))
      }
    })
  })
}

/**
 * Rewrite a JSON schema for OpenAI's strict mode. In strict:true every key
 * listed in an object's `properties` must also be in its `required` array,
 * and `additionalProperties` must be false. Zod's `.optional()` → JSON
 * schema omits the key from required, which strict mode rejects. We fix
 * that up post-hoc so callers can keep using `.nullable().optional()` in
 * their Zod definitions without special-casing OpenAI.
 */
function toOpenAIStrictSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') return schema
  const obj = schema as Record<string, unknown>
  if (Array.isArray(obj)) return obj.map(toOpenAIStrictSchema)
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) out[k] = toOpenAIStrictSchema(v)
  // Object schemas: force required=all-keys and additionalProperties=false.
  if (out.type === 'object' && out.properties && typeof out.properties === 'object') {
    out.required = Object.keys(out.properties as Record<string, unknown>)
    out.additionalProperties = false
  }
  return out
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
        schema: toOpenAIStrictSchema(zodToJsonSchema(req.schema)),
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
  const data = (await res.json()) as {
    choices: { message: { content: string } }[]
    usage: {
      prompt_tokens: number
      completion_tokens: number
      prompt_tokens_details?: { cached_tokens?: number }
    }
  }
  const pricing = OPENAI_PRICING[req.config.openaiModel] ?? { in: 0, out: 0 }
  // Split prompt_tokens into cached + fresh when the server reports cache hits.
  // Cached tokens bill at ~10× less (cacheRead rate); fresh at the full in rate.
  const cachedTokens = data.usage.prompt_tokens_details?.cached_tokens ?? 0
  const freshInputTokens = data.usage.prompt_tokens - cachedTokens
  const costUSD =
    (freshInputTokens * pricing.in +
      cachedTokens * (pricing.cacheRead ?? pricing.in) +
      data.usage.completion_tokens * pricing.out) /
    1_000_000
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
    model: backendModel(config),
    promptVersion: opts.promptVersion,
    schema: opts.schema,
    input: opts.input,
  })

  const cached = readCache<z.infer<TSchema>>(config.cacheDir, key)
  if (cached) return cached.result

  // Budget check before making the call — estimate by prompt length.
  const approxTokens = Math.ceil((opts.systemPrompt.length + opts.userPrompt.length) / 4)
  if (!chargeBudget(approxTokens)) {
    process.stderr.write(
      `[llm] run token budget exceeded (${currentBudget?.tokensUsed}/${currentBudget?.limit}); skipping call\n`,
    )
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
      const raw: RawResult =
        config.backend === 'ollama'
          ? await callOllama({ ...opts, config })
          : config.backend === 'anthropic'
            ? await callAnthropic({ ...opts, config })
            : config.backend === 'claude-code'
              ? await callClaudeCode({ ...opts, config })
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

  // Only cache successful (non-null) results. A null means the call failed
  // — rate limit, transient network error, parse failure, CLI crash. Caching
  // those makes the failure permanent: every re-run replays null instantly,
  // defeating the whole point of re-running. Successful results are stable
  // given the content-addressed key, so caching them is always safe.
  if (result !== null) {
    const entry: CacheEntry<z.infer<TSchema>> = {
      result,
      backend: config.backend,
      model: backendModel(config),
      promptVersion: opts.promptVersion,
      tokenCount,
      latencyMs: Date.now() - t0,
      retryCount: attempt,
      costUSD,
      createdAt: new Date().toISOString(),
    }
    writeCache(config.cacheDir, key, entry)
  } else {
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
