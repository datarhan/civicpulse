/**
 * LLM client abstraction.
 *
 * Six backends, same call signature:
 *   - Ollama       (local, free)                 — POST /api/chat
 *   - OpenAI       (cloud, pay-per-token)        — /v1/chat/completions (json_schema)
 *   - Anthropic    (cloud, pay-per-token)        — /v1/messages (tool_use)
 *   - gemini       (Pro subscription, $0)        — spawns `gemini -p` CLI (prompt-engineered JSON)
 *   - agy          (Google subscription, $0)     — spawns `agy -p` CLI (plain-text reply, prompt-engineered JSON)
 *   - claude-code  (Max plan, rate-limited, $0)  — spawns `claude -p` CLI with --json-schema
 *
 * Default auto-select + fallback chain (when LLM_BACKEND is unset or the
 * primary exhausts retries):
 *   openai → anthropic → gemini   (auto-select also tries agy → claude-code
 *                                  before conceding to ollama)
 * Each step is skipped when its key/binary isn't available. ollama is NEVER
 * part of the runtime fallback chain (user directive 2026-07-07 — local
 * inference pins the machine); it runs only as an explicit primary
 * (LLM_BACKEND=ollama) or when no other backend is installed at all.
 * claude-code is auto-chained only as agy's first fallback.
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

// ─── Resilience primitives ─────────────────────────────────────────────────

/**
 * Network ceiling per metered-API HTTP call. Node's fetch has NO default
 * timeout, so without this a single stalled TLS connection can deadlock an
 * entire extract batch (every concurrency worker waiting forever). 120 s is
 * generous for the largest windows; override via LLM_FETCH_TIMEOUT_MS.
 * Deliberately NOT applied to Ollama — local CPU generation on big prompts
 * can legitimately exceed any sane HTTP ceiling.
 */
const FETCH_TIMEOUT_MS = Number(process.env.LLM_FETCH_TIMEOUT_MS || 120_000)

/**
 * Typed retryable error thrown by backend-specific callers when the server
 * is rate-limiting or overloaded. callLLM's retry loop honors `retryAfterMs`
 * by sleeping before the next attempt, and treats these as the signal to
 * fall through to the next backend in the auto-select chain once per-backend
 * retries exhaust.
 */
class RetryableError extends Error {
  retryAfterMs: number
  status: number
  constructor(message: string, opts: { retryAfterMs?: number; status?: number } = {}) {
    super(message)
    this.name = 'RetryableError'
    this.retryAfterMs = opts.retryAfterMs ?? 0
    this.status = opts.status ?? 0
  }
}

/**
 * Parse a Retry-After header. HTTP spec allows two forms:
 *   · delta seconds as an integer (e.g. "60")
 *   · HTTP-date (e.g. "Wed, 21 Oct 2015 07:28:00 GMT")
 */
function parseRetryAfter(header: string | null | undefined): number {
  if (!header) return 0
  const trimmed = header.trim()
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000
  const t = Date.parse(trimmed)
  if (Number.isFinite(t)) return Math.max(0, t - Date.now())
  return 0
}

/**
 * Circuit breaker — trips when too many calls in a row return null (all
 * retries + fallbacks exhausted). Prevents a long extract from grinding
 * through hundreds of windows against a dead backend. Reset on any success
 * or on resetBudget().
 */
interface CircuitBreakerState {
  consecutiveFailures: number
  threshold: number
  tripped: boolean
}
let currentCircuit: CircuitBreakerState | null = null
function resetCircuit(threshold = 10) {
  currentCircuit = { consecutiveFailures: 0, threshold, tripped: false }
}
function notifyResult(ok: boolean): void {
  if (!currentCircuit) return
  if (ok) {
    currentCircuit.consecutiveFailures = 0
  } else {
    currentCircuit.consecutiveFailures += 1
    if (currentCircuit.consecutiveFailures >= currentCircuit.threshold) {
      currentCircuit.tripped = true
    }
  }
}
export function getCircuitState(): CircuitBreakerState | null {
  return currentCircuit
}

// ─── Config ────────────────────────────────────────────────────────────────

export type Backend = 'ollama' | 'openai' | 'anthropic' | 'claude-code' | 'gemini' | 'agy'

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
  /**
   * gemini backend: which model alias to pass via `gemini -m`.
   * Requires the user to be OAuth-logged-in via `GOOGLE_GENAI_USE_GCA=1
   * gemini` (uses Google AI Pro subscription, $0 billing).
   * No `--json-schema` flag exists on gemini CLI, so we prompt-engineer
   * JSON output and parse the response text — stricter retry policy
   * than backends with schema-enforced output.
   */
  geminiModel: string
  geminiBin: string
  /**
   * agy backend: Google's agentic CLI that replaces the legacy `gemini` CLI.
   * `agyModel` is passed via `agy --model <name>` (NOT `-m`); `agyBin` is the
   * executable (default `agy` on PATH). Like gemini it has no --json-schema
   * flag so JSON output is prompt-engineered, but `agy -p` prints the reply as
   * PLAIN TEXT with no `{session_id, response, stats}` envelope, and bills $0
   * (Google subscription — no token stats reported). Opt-in only via
   * LLM_BACKEND=agy; never auto-selected, never in the fallback chain.
   */
  agyModel: string
  agyBin: string
  cacheDir: string
  maxTokensPerRun: number
}

export function loadConfigFromEnv(): ClientConfig {
  // Backend auto-selection hierarchy when LLM_BACKEND is unset. Matches the
  // cross-backend fallback order in callLLM.
  //   1. openai       — if OPENAI_API_KEY is set (metered, fastest)
  //   2. anthropic    — if ANTHROPIC_API_KEY is set (metered)
  //   3. gemini       — if gemini CLI is installed (Pro subscription, $0)
  //   4. agy          — if the agy CLI is installed ($0, Google subscription)
  //   5. claude-code  — if the claude CLI is installed ($0, Max plan)
  //   6. ollama       — local, last resort only (user directive 2026-07-07:
  //                     local qwen inference must never run unless nothing
  //                     else is even installed, or LLM_BACKEND=ollama is set)
  const binOnPath = (bin: string): boolean =>
    bin.includes('/')
      ? existsSync(bin)
      : (process.env.PATH || '').split(':').some((d) => d && existsSync(`${d}/${bin}`))
  const envBackend = process.env.LLM_BACKEND as Backend | undefined
  const geminiBinPath =
    process.env.GEMINI_BIN ||
    (process.env.HOME || '') + '/.local/civicpulse-gemini/node_modules/.bin/gemini'
  let backend: Backend
  if (envBackend) {
    backend = envBackend
  } else if (process.env.OPENAI_API_KEY) {
    backend = 'openai'
  } else if (process.env.ANTHROPIC_API_KEY) {
    backend = 'anthropic'
  } else if (existsSync(geminiBinPath)) {
    backend = 'gemini'
  } else if (binOnPath(process.env.AGY_BIN || 'agy')) {
    backend = 'agy'
  } else if (binOnPath(process.env.CLAUDE_CODE_BIN || 'claude')) {
    backend = 'claude-code'
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
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-pro',
    geminiBin:
      process.env.GEMINI_BIN ||
      (process.env.HOME || '') + '/.local/civicpulse-gemini/node_modules/.bin/gemini',
    // agy CLI (Google's agentic CLI · replaces the legacy gemini CLI). Binary
    // defaults to `agy` on PATH. Model falls back to GEMINI_MODEL then
    // gemini-2.5-pro so a single env var can steer both gemini and agy. Never
    // affects auto-selection above — reached only via LLM_BACKEND=agy.
    agyBin: process.env.AGY_BIN || 'agy',
    agyModel: process.env.AGY_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-pro',
    cacheDir: resolve('.llm-cache'),
    maxTokensPerRun: Number(process.env.LLM_MAX_TOKENS_PER_RUN || 500_000),
  }
}

function backendModel(config: ClientConfig): string {
  if (config.backend === 'ollama') return config.ollamaModel
  if (config.backend === 'openai') return config.openaiModel
  if (config.backend === 'claude-code') return `claude-code:${config.claudeCodeModel}`
  if (config.backend === 'gemini') return `gemini:${config.geminiModel}`
  if (config.backend === 'agy') return `agy:${config.agyModel}`
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
    backend === 'claude-code' || backend === 'gemini' || backend === 'agy'
      ? 4_000_000
      : backend === 'openai' || backend === 'anthropic'
        ? 2_000_000
        : 500_000
  currentBudget = {
    tokensUsed: 0,
    limit: limit ?? (envLimit > 0 ? envLimit : defaultLimit),
  }
  // Also reset the circuit breaker so a stuck state from the previous run
  // doesn't bleed into a fresh extract. Threshold tuneable via env.
  resetCircuit(Number(process.env.LLM_CIRCUIT_THRESHOLD || 10))
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
  if (!res.ok) {
    const text = await res.text()
    // A local daemon overloaded by parallel extraction (429/5xx) deserves
    // the same backoff-and-retry treatment the metered backends get —
    // a plain Error here would burn all retries instantly with no sleep.
    if (res.status === 429 || res.status >= 500) {
      throw new RetryableError(`Ollama ${res.status}: ${text.slice(0, 200)}`, {
        retryAfterMs: parseRetryAfter(res.headers.get('retry-after')),
        status: res.status,
      })
    }
    throw new Error(`Ollama ${res.status}: ${text.slice(0, 200)}`)
  }
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
    // Node fetch has NO default timeout — a stalled connection would hang
    // the whole batch (all concurrency workers can deadlock on one stall).
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) {
    const body = await res.text()
    if (res.status === 429 || res.status >= 500) {
      const retryAfterMs = Math.min(parseRetryAfter(res.headers.get('retry-after')), 120_000)
      throw new RetryableError(`Anthropic ${res.status}: ${body.slice(0, 200)}`, {
        retryAfterMs,
        status: res.status,
      })
    }
    throw new Error(`Anthropic ${res.status}: ${body.slice(0, 200)}`)
  }
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
 * `--system-prompt`, `--strict-mcp-config` (headless MCP isolation), and a
 * one-tool surface (`--allowedTools StructuredOutput`) so structured extraction
 * runs at the lowest cost floor without hanging.
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
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const schemaJson = JSON.stringify(zodToJsonSchema(req.schema))

  // Spawn from a freshly-minted temp directory so the claude CLI does
  // NOT auto-discover this project's CLAUDE.md and other workspace
  // state. Without this, every invocation cache-creates ~63 KB of
  // project context — both expensive (in API-equivalent tokens) and
  // a likely cause of `api_error_status` cascades when the Max plan's
  // burst-rate limit trips. With cwd in /tmp, the CLI's per-call
  // cache write drops to ~24 KB. Probed empirically 2026-04-27.
  const cwd = mkdtempSync(join(tmpdir(), 'cp-claude-cwd-'))

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
      // Headless isolation (probed 2026-07-04). Without --strict-mcp-config,
      // each `claude -p` tries to init the user's GLOBAL MCP servers
      // (Figma/Gmail/…) and HANGS indefinitely — the root cause of the
      // "claude-code stalls headlessly" folklore. --bare fixes the hang but
      // also skips keychain reads → "Not logged in"; --strict-mcp-config drops
      // MCP while keeping Max OAuth. Structured output is delivered via the
      // internal StructuredOutput tool, so allow ONLY that: a blanket
      // --disallowedTools '*' denies it and the model loops on permission
      // denials until it gives up.
      '--strict-mcp-config',
      '--allowedTools',
      'StructuredOutput',
    ]
    const child = spawn(req.config.claudeCodeBin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd,
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
        const raw = claudeEnvelopeToRaw(envelope)
        if (raw === null) {
          return rejectPromise(
            new Error(
              `claude CLI returned no usable JSON (result: ${String(envelope.result).slice(0, 200)})`,
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
          raw,
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

/**
 * Extract a JSON payload from a CLI backend's free-text reply. Both the
 * `gemini` and `agy` CLIs surface the model's prose response — optionally
 * wrapping the JSON in ```json … ``` fences, optionally after some preamble.
 * Strip the fence if present, then slice from the first `{` or `[` so any
 * leading commentary is tolerated. Deliberately lenient — the real Zod
 * validation happens in the callLLM wrapper.
 */
export function extractJsonPayload(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenceMatch ? fenceMatch[1].trim() : text
  const positions = [candidate.indexOf('{'), candidate.indexOf('[')].filter((i) => i >= 0)
  const firstBrace = positions.length > 0 ? Math.min(...positions) : -1
  return firstBrace >= 0 ? candidate.slice(firstBrace) : candidate
}

/**
 * Normalise a `claude -p --json-schema` envelope to a raw JSON string, or null.
 *
 * Prefers the `structured_output` field. When it's absent, the claude CLI
 * sometimes still emits schema-conforming JSON in `result` (observed with
 * nullable schemas — the model answers directly, e.g. `{"correlation": null}`,
 * instead of via the emit tool). We salvage that through the same lenient
 * extractor the gemini/agy backends use; the callLLM wrapper still validates the
 * result against the Zod schema, so this only rescues VALID answers that would
 * otherwise be hard-rejected — it never lets a non-conforming payload through.
 */
export function claudeEnvelopeToRaw(envelope: {
  structured_output?: unknown
  result?: unknown
}): string | null {
  if (envelope.structured_output !== undefined) return JSON.stringify(envelope.structured_output)
  if (typeof envelope.result === 'string' && envelope.result.trim()) {
    try {
      const slice = extractJsonPayload(envelope.result)
      JSON.parse(slice)
      return slice
    } catch {
      return null
    }
  }
  return null
}

/**
 * Gemini CLI backend.
 *
 * Spawns `gemini -p <prompt> -m <model> -o json --yolo` and parses the
 * `{session_id, response}` envelope. Uses Google AI Pro subscription (no
 * per-token billing) when the user has authenticated via
 * `GOOGLE_GENAI_USE_GCA=true gemini` (one-time OAuth flow opens browser).
 * Alternative: set GEMINI_API_KEY for pay-per-token API access.
 *
 * Unlike claude-code, gemini CLI has no --json-schema flag, so we prompt-
 * engineer the JSON output: merge system + user prompts and append a
 * strict "reply only in JSON matching this schema" instruction. Response
 * parsing is lenient — we extract the first {…} or [...] JSON block from
 * the model's text (handles optional ```json fenced blocks) and let the
 * callLLM wrapper do the real Zod validation. Schema-mismatch retries in
 * callLLM absorb the extra failure rate vs backends with enforced output.
 */
async function callGemini(req: RawCall): Promise<RawResult> {
  const { spawn } = await import('node:child_process')
  const schemaJson = JSON.stringify(zodToJsonSchema(req.schema), null, 2)
  // Merged single prompt. gemini CLI doesn't have --system-prompt; stitch
  // them together explicitly and force JSON-only output.
  const mergedPrompt =
    req.systemPrompt +
    '\n\n---\n\n' +
    req.userPrompt +
    '\n\n---\n\n' +
    'REPLY WITH A SINGLE VALID JSON OBJECT that conforms to this schema. ' +
    'No markdown fences. No commentary. No explanation. Just the JSON object.\n\n' +
    'Schema:\n' +
    schemaJson

  return await new Promise<RawResult>((resolvePromise, rejectPromise) => {
    // SECURITY: no `--yolo` (auto-approve all tool actions). The prompt carries
    // untrusted scraped content and gemini is agentic, so auto-approving tools
    // would be an injection→RCE path (same class as the agy backend). `-o json`
    // is the output-envelope format, not a permission flag — keep it. Our use is
    // pure text-gen; an unapproved tool request fails safe rather than auto-runs.
    const args = ['-p', mergedPrompt, '-m', req.config.geminiModel, '-o', 'json']
    const child = spawn(req.config.geminiBin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
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
          new Error(`gemini exit ${code}: ${stderr.slice(0, 400) || stdout.slice(0, 400)}`),
        )
      }
      try {
        const envelope = JSON.parse(stdout) as {
          session_id?: string
          response?: string
          error?: { type?: string; message?: string; code?: number }
          stats?: {
            models?: Record<
              string,
              { tokens?: { input?: number; candidates?: number; total?: number } }
            >
          }
        }
        if (envelope.error) {
          return rejectPromise(
            new Error(`gemini CLI error: ${envelope.error.message || 'unknown'}`),
          )
        }
        const text = (envelope.response ?? '').trim()
        if (!text) {
          return rejectPromise(new Error('gemini CLI returned empty response'))
        }
        // Extract the JSON payload from the model's reply text (shared with
        // callAgy). Gemini often wraps it in ```json … ``` fences and may
        // prepend preamble; extractJsonPayload strips both.
        const jsonSlice = extractJsonPayload(text)
        // Token count: sum input + candidates (output) from the first model
        // entry. gemini CLI reports per-model; in single-shot mode there's
        // only one entry. Omit 'cached' and 'thoughts' — they duplicate
        // the input bucket.
        let tokenCount = 0
        const models = envelope.stats?.models ?? {}
        for (const m of Object.values(models)) {
          tokenCount += (m.tokens?.input ?? 0) + (m.tokens?.candidates ?? 0)
        }
        resolvePromise({
          raw: jsonSlice,
          tokenCount,
          costUSD: 0, // Google AI Pro subscription: $0 billed (quota-rated)
        })
      } catch (err) {
        rejectPromise(new Error(`gemini CLI output not JSON: ${String(err).slice(0, 200)}`))
      }
    })
  })
}

/**
 * agy CLI backend — Google's agentic CLI that replaces the legacy `gemini` CLI
 * and is the user's preferred way to reach Gemini.
 *
 * NOT flag-compatible with the old gemini CLI: spawns
 *   `agy -p <prompt> --model <model> --sandbox`
 * where `-p`/`--print` runs a single non-interactive prompt and prints the
 * model's reply as PLAIN TEXT (there is NO `{session_id, response, stats}`
 * JSON envelope — the stdout IS the response) and `--model` replaces `-m`.
 *
 * SECURITY: we deliberately do NOT pass `--dangerously-skip-permissions`.
 * The prompt embeds untrusted scraped content (press headlines/snippets), and
 * agy is an AGENTIC CLI — auto-approving tool use would turn a prompt-injection
 * in a scraped headline into arbitrary command execution with the user's shell
 * permissions. Our use is pure text generation (no tool is needed), so we run
 * with `--sandbox` (terminal restrictions) and let any tool request go
 * unapproved rather than auto-run. Verified `agy -p … --sandbox` returns the
 * reply cleanly.
 *
 * Same prompt-engineered JSON strategy as callGemini (no --json-schema flag):
 * merge system + user prompts, append the strict "reply only in JSON" block +
 * schema, then extract the JSON payload from the plain-text stdout via the
 * shared extractJsonPayload helper. `agy -p` reports no token stats and bills
 * $0 (Google subscription). Opt-in only (LLM_BACKEND=agy) — never in the
 * auto-fallback chain, so metered backends are never silently reached.
 */
async function callAgy(req: RawCall): Promise<RawResult> {
  const { spawn } = await import('node:child_process')
  const schemaJson = JSON.stringify(zodToJsonSchema(req.schema), null, 2)
  // Merged single prompt — identical to callGemini (agy has no --system-prompt
  // flag either); stitch system + user together and force JSON-only output.
  const mergedPrompt =
    req.systemPrompt +
    '\n\n---\n\n' +
    req.userPrompt +
    '\n\n---\n\n' +
    'REPLY WITH A SINGLE VALID JSON OBJECT that conforms to this schema. ' +
    'No markdown fences. No commentary. No explanation. Just the JSON object.\n\n' +
    'Schema:\n' +
    schemaJson

  return await new Promise<RawResult>((resolvePromise, rejectPromise) => {
    const args = [
      '-p',
      mergedPrompt,
      '--model',
      req.config.agyModel,
      // See the SECURITY note in the function doc: never
      // --dangerously-skip-permissions here (untrusted scraped content in the
      // prompt + agentic CLI = injection→RCE). --sandbox = terminal restrictions.
      '--sandbox',
    ]
    const child = spawn(req.config.agyBin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
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
          new Error(`agy exit ${code}: ${stderr.slice(0, 400) || stdout.slice(0, 400)}`),
        )
      }
      // agy -p prints the model's reply as plain text — there is NO JSON
      // envelope to parse. The stdout IS the response; do NOT JSON.parse it.
      const text = stdout.trim()
      if (!text) {
        return rejectPromise(new Error('agy CLI returned empty response'))
      }
      // Same fence/first-brace extraction as callGemini (shared helper).
      const jsonSlice = extractJsonPayload(text)
      resolvePromise({
        raw: jsonSlice,
        tokenCount: 0, // agy -p reports no token stats
        costUSD: 0, // Google subscription: $0 billed
      })
    })
  })
}

/**
 * gpt-5.x and o-series are reasoning models: the chat-completions API rejects
 * sampling params (temperature, seed, top_p, …) for them — only the default is
 * allowed. We drop those params for these model ids so requests don't 400.
 * (The `-chat` variants do accept them, but dropping is harmless there.)
 */
export function isReasoningModel(model: string): boolean {
  return /^(o\d|gpt-5)/i.test(model)
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
    // Reasoning models (gpt-5.x / o-series) reject sampling params (temperature,
    // seed, …) — only the default is allowed, and sending them 400s (which then
    // burns the retry budget and falls back to a slower backend). Classic chat
    // models keep the determinism params.
    ...(isReasoningModel(req.config.openaiModel) ? {} : { temperature: 0, seed: 42 }),
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${req.config.openaiApiKey}`,
    },
    body: JSON.stringify(body),
    // See FETCH_TIMEOUT_MS — a stalled connection must not hang the batch.
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) {
    const body = await res.text()
    // OpenAI uses HTTP 429 for both transient rate-limiting AND permanent
    // quota exhaustion (code "insufficient_quota"). The former clears in
    // seconds; the latter requires the user to top up their billing.
    // Don't retry or backoff on insufficient_quota — bubble up immediately
    // so the fallback chain can try anthropic/ollama without wasting 12s
    // of sleep per call against a permanently-dead backend.
    const isQuotaExhausted = res.status === 429 && body.includes('insufficient_quota')
    if ((res.status === 429 && !isQuotaExhausted) || res.status >= 500) {
      const retryAfterMs = Math.min(parseRetryAfter(res.headers.get('retry-after')), 120_000)
      throw new RetryableError(`OpenAI ${res.status}: ${body.slice(0, 200)}`, {
        retryAfterMs,
        status: res.status,
      })
    }
    // Permanent: insufficient_quota, 400 (schema), 401 (auth), 404, etc.
    // Bubble up plain Error so the per-backend retry loop gives up instantly
    // and the cross-backend fallback takes over.
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 200)}`)
  }
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

  // Circuit breaker short-circuit — once tripped, stop making API calls and
  // let the run finish writing its checkpoint cleanly. One log line, then
  // silent skip for the rest of the run.
  if (currentCircuit?.tripped) return null

  // Budget check before making the call — estimate by prompt length.
  const approxTokens = Math.ceil((opts.systemPrompt.length + opts.userPrompt.length) / 4)
  if (!chargeBudget(approxTokens)) {
    process.stderr.write(
      `[llm] run token budget exceeded (${currentBudget?.tokensUsed}/${currentBudget?.limit}); skipping call\n`,
    )
    return null
  }

  // Build the ordered list of backends to try. Primary is whatever the
  // config says; fallbacks are the other configured backends in priority
  // order:
  //   openai (metered) → anthropic (metered) → gemini (Pro subscription)
  // gemini is auto-used as a fallback when its CLI binary exists on disk —
  // assumed to mean the user has opted in by installing it.
  //
  // ollama is NEVER auto-chained (user directive 2026-07-07): local qwen
  // inference pinned the machine for an hour when both $0 CLIs failed. It
  // remains reachable only as an explicit primary (LLM_BACKEND=ollama).
  //
  // claude-code is auto-chained ONLY as agy's FIRST fallback ("if agy hits its
  // Google quota, use the claude CLI" — user directive 2026-07-06): agy is $0
  // (Google subscription) but daily-capped, and when it's exhausted `agy -p`
  // returns empty, so we prefer claude-code (also $0, on a SEPARATE Max quota)
  // over the metered openai/anthropic path. It is NOT chained off any other
  // primary — an errant heavy extract on e.g. openai must not silently drain
  // the Max quota that interactive Claude sessions share. Gated on the binary
  // being resolvable (default `claude` on PATH; override via CLAUDE_CODE_BIN).
  const commandExists = (bin: string): boolean =>
    bin.includes('/')
      ? existsSync(bin)
      : (process.env.PATH || '').split(':').some((d) => d && existsSync(`${d}/${bin}`))
  const attemptedBackends: Backend[] = [config.backend]
  const fallbackOrder: Backend[] =
    config.backend === 'agy'
      ? ['claude-code', 'openai', 'anthropic', 'gemini']
      : ['openai', 'anthropic', 'gemini']
  for (const b of fallbackOrder) {
    if (b === config.backend) continue
    if (b === 'claude-code' && !commandExists(config.claudeCodeBin)) continue
    if (b === 'openai' && !config.openaiApiKey) continue
    if (b === 'anthropic' && !config.anthropicApiKey) continue
    if (b === 'gemini' && !existsSync(config.geminiBin)) continue
    attemptedBackends.push(b)
  }

  const t0 = Date.now()
  let result: z.infer<TSchema> | null = null
  let tokenCount = 0
  let costUSD = 0
  let attempt = 0
  let lastErr = ''
  let usedBackend = config.backend

  outer: for (let bi = 0; bi < attemptedBackends.length; bi++) {
    const backend = attemptedBackends[bi]
    const backendConfig: ClientConfig = { ...config, backend }
    usedBackend = backend
    let perBackendAttempt = 0
    while (perBackendAttempt <= maxRetries) {
      try {
        const call =
          backend === 'ollama'
            ? callOllama
            : backend === 'anthropic'
              ? callAnthropic
              : backend === 'claude-code'
                ? callClaudeCode
                : backend === 'gemini'
                  ? callGemini
                  : backend === 'agy'
                    ? callAgy
                    : callOpenAI
        const raw: RawResult = await call({ ...opts, config: backendConfig })
        tokenCount += raw.tokenCount
        costUSD += raw.costUSD
        chargeBudget(Math.max(0, raw.tokenCount - (attempt === 0 ? approxTokens : 0)))

        // Parse + validate. Malformed JSON or a schema miss is an OUTPUT-level
        // failure — the backend answered, the answer was just bad — so retry the
        // SAME backend (LLM nondeterminism often yields valid output next try).
        // Handle the parse error HERE so it never reaches the catch below, whose
        // fail-fast breaks to the next backend (that path is reserved for
        // backend-level hard failures: agy's quota-empty stdout, ENOENT, a 4xx).
        let parsedJson: unknown
        try {
          parsedJson = JSON.parse(raw.raw)
        } catch {
          lastErr = `invalid JSON from ${backend}`
          attempt += 1
          perBackendAttempt += 1
          continue
        }
        const parsed = opts.schema.safeParse(parsedJson)
        if (parsed.success) {
          result = parsed.data as z.infer<TSchema>
          break outer
        }
        // Schema mismatch — retry same backend (non-retryable-error path).
        lastErr = parsed.error.toString().slice(0, 200)
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err)
        if (
          err instanceof RetryableError &&
          err.retryAfterMs > 0 &&
          perBackendAttempt < maxRetries
        ) {
          // Server asked us to wait — sleep, then stay on same backend.
          process.stderr.write(
            `[llm] ${backend} ${err.status} → backoff ${err.retryAfterMs}ms (attempt ${perBackendAttempt + 1}/${maxRetries + 1})\n`,
          )
          await new Promise((r) => setTimeout(r, err.retryAfterMs))
        } else if (err instanceof RetryableError && perBackendAttempt < maxRetries) {
          // Retryable but no Retry-After — exponential backoff capped at 30s.
          const backoffMs = Math.min(1000 * 2 ** perBackendAttempt, 30_000)
          await new Promise((r) => setTimeout(r, backoffMs))
        } else {
          // Non-retryable, or retries exhausted: a deterministic backend failure
          // (agy's quota-exhausted empty stdout, ENOENT, a 4xx) won't change on a
          // repeat — don't burn the remaining same-backend attempts. Fall to the
          // next backend now. This is what keeps agy → claude-code cheap when agy
          // is fully capped: one empty agy call, then straight to the claude CLI
          // instead of 3 × (empty agy call) per LLM request across a batch.
          attempt += 1
          perBackendAttempt += 1
          break
        }
      }
      attempt += 1
      perBackendAttempt += 1
    }
    // This backend's retries exhausted. If there's another backend to try,
    // log the fallback so the user sees what happened.
    if (bi + 1 < attemptedBackends.length) {
      process.stderr.write(
        `[llm] ${backend} exhausted ${maxRetries + 1} attempts (${lastErr.slice(0, 80)}); falling back to ${attemptedBackends[bi + 1]}\n`,
      )
    }
  }

  // Only cache successful (non-null) results. A null means the call failed
  // — rate limit, transient network error, parse failure, CLI crash. Caching
  // those makes the failure permanent: every re-run replays null instantly,
  // defeating the whole point of re-running. Successful results are stable
  // given the content-addressed key, so caching them is always safe.
  if (result !== null) {
    const usedConfig: ClientConfig = { ...config, backend: usedBackend }
    const entry: CacheEntry<z.infer<TSchema>> = {
      result,
      backend: usedBackend,
      model: backendModel(usedConfig),
      promptVersion: opts.promptVersion,
      tokenCount,
      latencyMs: Date.now() - t0,
      retryCount: attempt,
      costUSD,
      createdAt: new Date().toISOString(),
    }
    writeCache(config.cacheDir, key, entry)
    notifyResult(true)
  } else {
    notifyResult(false)
    const trippedNow = currentCircuit?.tripped === true
    process.stderr.write(
      `[llm] all backends exhausted (${attemptedBackends.join('→')}) after ${attempt} total attempts: ${lastErr}${trippedNow ? ' · CIRCUIT TRIPPED, subsequent calls will short-circuit to null' : ''}\n`,
    )
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
