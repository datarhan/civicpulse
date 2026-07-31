/**
 * Embedding client for the verifier corpus.
 *
 * Used only by Node-only paths (scripts/embed-verifier-corpus.ts and the
 * verifier when `VERIFIER_SHORTLIST=semantic|hybrid`). Never imported by
 * browser code — API keys are server-side secrets.
 *
 * Three backends are supported, selected by `EMBED_BACKEND` env or by
 * auto-detection (Ollama running locally → ollama; else by API-key
 * presence):
 *   · ollama (default if `ollama serve` is reachable) — local model,
 *                        zero cost, zero quota, zero secrets.
 *                        `nomic-embed-text` is the recommended small model
 *                        (768 dims, ~275 MB on disk).
 *   · openai            — `text-embedding-3-small`, 1536 dims, paid tier.
 *   · gemini            — Google `text-embedding-004`, 768 dims, free tier
 *                        REST API (separate from the gemini-CLI OAuth
 *                        token). Requires GEMINI_API_KEY.
 *
 * Anthropic / Claude Code is NOT supported here — Anthropic does not
 * publish an embeddings API. The Gemini CLI's OAuth token also doesn't
 * cover embeddings. Use the chat backends (gemini-cli / claude-code) for
 * the LLM second pass and pair them with one of the three embeddings
 * backends above.
 *
 * The corpus cache (`.embed-cache/verifier-corpus.jsonl`) is dimensional —
 * mixing 1536-dim OpenAI vectors with 768-dim Gemini vectors corrupts
 * cosine similarity. Whenever the backend changes, rebuild the cache from
 * scratch (`npm run embed:verifier-corpus -- --rebuild`).
 *
 * Both backends share the resilience contract:
 *   · Token-counts each input pre-flight and rejects rows over ctx with
 *     a clear error rather than silently truncating.
 *   · Retries 429 (rate limit) and 5xx with exponential backoff +
 *     Retry-After honoring.
 *   · Surfaces permanent quota errors (`insufficient_quota`,
 *     `RESOURCE_EXHAUSTED`) immediately so the caller bails fast.
 */

export type EmbedBackend = 'openai' | 'gemini' | 'ollama'

// Process-wide latch: once OpenAI reports insufficient_quota (a permanent
// condition until the account is topped up), every later env/auto-selected
// openai call in this process re-routes to gemini instead of failing —
// 2026-07-31 operator directive after a journalist run lost semantic recall
// to a dead OpenAI key. Never auto-falls to ollama (local-model policy).
// Explicit `opts.backend`/`opts.apiKey` callers (tests, deliberate pins
// with their own key) are NOT redirected.
let openaiQuotaExhausted = false

/** Test hook: clear the quota latch between test cases. */
export function _resetEmbedQuotaStateForTests(): void {
  openaiQuotaExhausted = false
}

const OPENAI_MODEL = 'text-embedding-3-small'
const OPENAI_DIM = 1536
// text-embedding-004 was retired by Google (404 as of 2026-07); the stable
// replacement is gemini-embedding-001, whose native dim is 3072 — we request
// outputDimensionality=768 to keep the corpus contract, and L2-normalize
// in-client because truncated-dim vectors come back UN-normalized
// (measured L2≈0.57 at 768).
const GEMINI_MODEL = 'gemini-embedding-001'
const GEMINI_DIM = 768
const OLLAMA_MODEL = 'nomic-embed-text'
const OLLAMA_DEFAULT_HOST = 'http://localhost:11434'
const MAX_TOKENS_PER_INPUT = 8000 // text-embedding-3-* hard limit is 8192
const OPENAI_MAX_INPUTS = 2048
const GEMINI_MAX_INPUTS = 100 // batchEmbedContents soft limit
const OLLAMA_MAX_INPUTS = 64 // batch via /api/embed; conservative default
const MAX_RETRIES = 5

// Back-compat: scripts that imported these names keep working.
const DEFAULT_MODEL = OPENAI_MODEL
const DEFAULT_DIM = OPENAI_DIM
const MAX_INPUTS_PER_CALL = OPENAI_MAX_INPUTS

export class EmbedError extends Error {
  permanent: boolean
  constructor(msg: string, opts: { permanent?: boolean } = {}) {
    super(msg)
    this.name = 'EmbedError'
    this.permanent = opts.permanent ?? false
  }
}

export interface EmbedOptions {
  /** Override the auto-detected backend. Defaults to `EMBED_BACKEND` env,
   *  else openai when OPENAI_API_KEY is set, else gemini when
   *  GEMINI_API_KEY is set, else throws. */
  backend?: EmbedBackend
  apiKey?: string
  model?: string
  dim?: number
  /** Override fetch (for tests). */
  fetchImpl?: typeof fetch
  /** Override sleep (for tests). */
  sleep?: (ms: number) => Promise<void>
}

/** Pick the active backend from explicit opts → env → API-key/local auto-detect.
 *
 * Auto-detect order: ollama (if local server reachable per OLLAMA_HOST or
 * default localhost:11434 — implicit assumption, the actual reachability
 * check happens at call time) > openai > gemini > ollama (fallback).
 * The runtime probes Ollama lazily, so the auto-detect here is heuristic;
 * the actual call falls back to "ollama not reachable" with a clear
 * permanent error if the local server isn't running.
 */
export function selectBackend(opts: EmbedOptions = {}): EmbedBackend {
  if (opts.backend) return opts.backend
  const envBackend = process.env.EMBED_BACKEND as EmbedBackend | undefined
  if (envBackend === 'openai' || envBackend === 'gemini' || envBackend === 'ollama') {
    // The env pin's job is stopping accidental local-model (ollama) mixing,
    // not refusing a working paid→free fallback: a quota-dead openai pin
    // re-routes to gemini too.
    if (envBackend === 'openai' && openaiQuotaExhausted && process.env.GEMINI_API_KEY)
      return 'gemini'
    return envBackend
  }
  // Back-compat: callers (and tests) that pass `opts.apiKey` directly
  // were written for the OpenAI-only era. Treat `apiKey` without an
  // explicit backend as openai. This keeps the test suite + existing
  // scripts happy without forcing every callsite to add `backend:'openai'`.
  if (opts.apiKey) return 'openai'
  if (process.env.OPENAI_API_KEY) {
    // Quota latch: a dead OpenAI key re-routes to gemini when available.
    if (openaiQuotaExhausted && process.env.GEMINI_API_KEY) return 'gemini'
    return 'openai'
  }
  if (process.env.GEMINI_API_KEY) return 'gemini'
  return 'ollama' // no key, no env override — assume local Ollama; the
  // call will throw a clear "ollama unreachable" if the daemon is down.
}

/**
 * Estimate the token count for an input. The Embeddings API uses cl100k_base
 * tokenization. 4 chars/token is the canonical OpenAI estimate for English
 * and over-estimates for Spanish (which has more short tokens). We add a
 * 25 % safety margin so a borderline row is rejected pre-flight rather than
 * by the API after we've already paid the round-trip.
 */
export function estimateTokens(text: string): number {
  return Math.ceil((text.length / 4) * 1.25)
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function parseRetryAfter(header: string | null | undefined): number {
  if (!header) return 0
  const trimmed = header.trim()
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000
  const t = Date.parse(trimmed)
  if (Number.isFinite(t)) return Math.max(0, t - Date.now())
  return 0
}

interface OpenAIEmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>
  usage?: { prompt_tokens: number; total_tokens: number }
  model?: string
}

/**
 * Embed up to N strings in a single batch. Returns embeddings in the same
 * order as the input. Any input exceeding `MAX_TOKENS_PER_INPUT` triggers
 * an `EmbedError` with `permanent: true` — the caller should fix the
 * source row, not retry.
 */
export async function embedTexts(texts: string[], opts: EmbedOptions = {}): Promise<number[][]> {
  if (texts.length === 0) return []

  const backend = selectBackend(opts)
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch
  const sleep = opts.sleep ?? defaultSleep

  // Pre-flight token check (same ceiling for both backends — the Gemini
  // ctx is 2048 tokens but our 8000 cap is way under either limit only if
  // the source corpus stays below ~2k tokens; tighten if Gemini rejects).
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i]
    if (typeof t !== 'string' || t.length === 0) {
      throw new EmbedError(`embedTexts[${i}]: empty or non-string input`, { permanent: true })
    }
    const tokens = estimateTokens(t)
    if (tokens > MAX_TOKENS_PER_INPUT) {
      throw new EmbedError(
        `embedTexts[${i}]: ${tokens} tokens exceeds ${MAX_TOKENS_PER_INPUT}. Split or truncate the source row.`,
        { permanent: true },
      )
    }
  }

  if (backend === 'gemini') {
    const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY
    if (!apiKey) {
      throw new EmbedError('GEMINI_API_KEY not set (EMBED_BACKEND=gemini)', { permanent: true })
    }
    const model = opts.model ?? GEMINI_MODEL
    const dim = opts.dim ?? GEMINI_DIM
    const out: number[][] = []
    for (let start = 0; start < texts.length; start += GEMINI_MAX_INPUTS) {
      const slice = texts.slice(start, start + GEMINI_MAX_INPUTS)
      const batch = await callGeminiEmbeddings(slice, { apiKey, model, dim, fetchImpl, sleep })
      for (const e of batch) out.push(e)
    }
    return out
  }

  if (backend === 'ollama') {
    // No API key needed; Ollama runs locally. Dim is auto-discovered from
    // the first response (different models return different dims), so we
    // don't pin it from opts.dim.
    const host = process.env.OLLAMA_HOST ?? OLLAMA_DEFAULT_HOST
    const model = opts.model ?? process.env.OLLAMA_EMBED_MODEL ?? OLLAMA_MODEL
    const out: number[][] = []
    for (let start = 0; start < texts.length; start += OLLAMA_MAX_INPUTS) {
      const slice = texts.slice(start, start + OLLAMA_MAX_INPUTS)
      const batch = await callOllamaEmbeddings(slice, { host, model, fetchImpl, sleep })
      for (const e of batch) out.push(e)
    }
    return out
  }

  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new EmbedError('OPENAI_API_KEY not set', { permanent: true })
  }
  const model = opts.model ?? DEFAULT_MODEL
  const dim = opts.dim ?? DEFAULT_DIM
  const out: number[][] = []
  try {
    for (let start = 0; start < texts.length; start += MAX_INPUTS_PER_CALL) {
      const slice = texts.slice(start, start + MAX_INPUTS_PER_CALL)
      const batchEmbeds = await callEmbeddings(slice, { apiKey, model, dim, fetchImpl, sleep })
      for (const e of batchEmbeds) out.push(e)
    }
  } catch (err) {
    // Quota fallback: insufficient_quota is permanent for this key, so
    // retrying openai is pointless. When gemini is available (and the
    // caller didn't pin its own key/backend), latch the process onto
    // gemini and re-embed the WHOLE input there — never partially, so a
    // single call can't return mixed-dimension vectors.
    if (
      err instanceof EmbedError &&
      err.permanent &&
      /insufficient_quota/i.test(err.message) &&
      !opts.apiKey &&
      !opts.backend &&
      process.env.GEMINI_API_KEY
    ) {
      openaiQuotaExhausted = true
      console.warn(
        '[embed-client] OpenAI quota exhausted → falling back to gemini (768 dims) for the rest of this process. ' +
          'Caches built with openai (1536 dims) must be rebuilt before semantic search works again.',
      )
      return embedTexts(texts, { backend: 'gemini', fetchImpl: opts.fetchImpl, sleep: opts.sleep })
    }
    throw err
  }
  return out
}

async function callEmbeddings(
  inputs: string[],
  opts: {
    apiKey: string
    model: string
    dim: number
    fetchImpl: typeof fetch
    sleep: (ms: number) => Promise<void>
  },
): Promise<number[][]> {
  let attempt = 0
  let lastErr: Error | null = null
  while (attempt < MAX_RETRIES) {
    attempt += 1
    try {
      const res = await opts.fetchImpl('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify({
          model: opts.model,
          input: inputs,
          // text-embedding-3-* supports configurable dimensions ≤ default;
          // we keep the default (1536) so cosine math stays simple.
        }),
      })

      if (res.ok) {
        const data = (await res.json()) as OpenAIEmbeddingResponse
        if (!Array.isArray(data.data) || data.data.length !== inputs.length) {
          throw new EmbedError(
            `OpenAI returned ${data.data?.length ?? 0} embeddings for ${inputs.length} inputs`,
            { permanent: true },
          )
        }
        const ordered: number[][] = new Array(inputs.length)
        for (const e of data.data) {
          if (e.index < 0 || e.index >= inputs.length) {
            throw new EmbedError(`OpenAI returned out-of-range index ${e.index}`, {
              permanent: true,
            })
          }
          if (e.embedding.length !== opts.dim) {
            throw new EmbedError(
              `OpenAI returned embedding of length ${e.embedding.length}, expected ${opts.dim}`,
              { permanent: true },
            )
          }
          ordered[e.index] = e.embedding
        }
        return ordered
      }

      const body = await res.text()
      // insufficient_quota is permanent; bubble up immediately so the caller
      // doesn't waste backoff time on a dead key.
      if (res.status === 429 && body.includes('insufficient_quota')) {
        throw new EmbedError(`OpenAI 429 insufficient_quota: ${body.slice(0, 200)}`, {
          permanent: true,
        })
      }
      // Transient: 429 (rate limit) and 5xx.
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = parseRetryAfter(res.headers.get('retry-after'))
        const backoff = Math.min(retryAfter || 1000 * Math.pow(2, attempt - 1), 60_000)
        lastErr = new EmbedError(`OpenAI ${res.status}: ${body.slice(0, 200)}`)
        await opts.sleep(backoff)
        continue
      }
      // Permanent: 4xx other than 429. Schema, auth, etc.
      throw new EmbedError(`OpenAI ${res.status}: ${body.slice(0, 200)}`, { permanent: true })
    } catch (err) {
      if (err instanceof EmbedError && err.permanent) throw err
      lastErr = err instanceof Error ? err : new Error(String(err))
      const backoff = Math.min(1000 * Math.pow(2, attempt - 1), 60_000)
      await opts.sleep(backoff)
    }
  }
  throw lastErr ?? new EmbedError('OpenAI embeddings: retries exhausted')
}

// ─── Gemini backend ─────────────────────────────────────────────────────────
//
// Google's batchEmbedContents endpoint. Free tier covers ~1.5k requests/min
// and 100 req/batch with no PAYG required; the ribarroja corpus (~2.5k
// rows) embeds in a single sub-second pass.
//
// Endpoint:    https://generativelanguage.googleapis.com/v1beta/models/<model>:batchEmbedContents
// Auth:        x-goog-api-key header (preferred over ?key= query string)
// Request:     { requests: [ { model: 'models/<model>', content: { parts: [{text: ...}] } }, ... ] }
// Response:    { embeddings: [ { values: [...float...] }, ... ] } in INPUT order.
//
// Permanent errors:
//   · 401/403 (invalid key) — surface immediately.
//   · 400 (invalid model / oversized input) — surface immediately.
//   · 429 RESOURCE_EXHAUSTED with quotaFailure — permanent for the day.
// Transient: 429 without quotaFailure (rate limit) and 5xx.
interface GeminiEmbedResponse {
  embeddings?: Array<{ values?: number[] }>
}

async function callGeminiEmbeddings(
  inputs: string[],
  opts: {
    apiKey: string
    model: string
    dim: number
    fetchImpl: typeof fetch
    sleep: (ms: number) => Promise<void>
  },
): Promise<number[][]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:batchEmbedContents`
  const body = JSON.stringify({
    requests: inputs.map((text) => ({
      model: `models/${opts.model}`,
      content: { parts: [{ text }] },
      outputDimensionality: opts.dim,
    })),
  })

  let attempt = 0
  let lastErr: Error | null = null
  while (attempt < MAX_RETRIES) {
    attempt += 1
    try {
      const res = await opts.fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': opts.apiKey,
        },
        body,
      })

      if (res.ok) {
        const data = (await res.json()) as GeminiEmbedResponse
        if (!Array.isArray(data.embeddings) || data.embeddings.length !== inputs.length) {
          throw new EmbedError(
            `Gemini returned ${data.embeddings?.length ?? 0} embeddings for ${inputs.length} inputs`,
            { permanent: true },
          )
        }
        const ordered: number[][] = []
        for (let i = 0; i < inputs.length; i++) {
          const v = data.embeddings[i]?.values
          if (!Array.isArray(v) || v.length !== opts.dim) {
            throw new EmbedError(
              `Gemini returned embedding[${i}] of length ${v?.length ?? 0}, expected ${opts.dim}`,
              { permanent: true },
            )
          }
          // gemini-embedding-001 returns UN-normalized vectors at truncated
          // dims; normalize so cosine/dot behave identically across
          // backends and consumers.
          const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0))
          ordered.push(norm > 0 ? v.map((x) => x / norm) : v)
        }
        return ordered
      }

      const text = await res.text()
      // Permanent quota / auth / schema errors.
      if (res.status === 429 && /RESOURCE_EXHAUSTED|quotaFailure/i.test(text)) {
        throw new EmbedError(`Gemini 429 RESOURCE_EXHAUSTED: ${text.slice(0, 200)}`, {
          permanent: true,
        })
      }
      if (res.status === 401 || res.status === 403) {
        throw new EmbedError(`Gemini ${res.status}: ${text.slice(0, 200)}`, { permanent: true })
      }
      // Transient: rate-limit 429 and 5xx.
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = parseRetryAfter(res.headers.get('retry-after'))
        const backoff = Math.min(retryAfter || 1000 * Math.pow(2, attempt - 1), 60_000)
        lastErr = new EmbedError(`Gemini ${res.status}: ${text.slice(0, 200)}`)
        await opts.sleep(backoff)
        continue
      }
      throw new EmbedError(`Gemini ${res.status}: ${text.slice(0, 200)}`, { permanent: true })
    } catch (err) {
      if (err instanceof EmbedError && err.permanent) throw err
      lastErr = err instanceof Error ? err : new Error(String(err))
      const backoff = Math.min(1000 * Math.pow(2, attempt - 1), 60_000)
      await opts.sleep(backoff)
    }
  }
  throw lastErr ?? new EmbedError('Gemini embeddings: retries exhausted')
}

// ─── Ollama backend ─────────────────────────────────────────────────────────
//
// Local-first path. Talks to `ollama serve` (default localhost:11434).
// Zero quota, zero secrets, zero round-trip cost beyond local network.
// Uses /api/embed with the `input: string[]` form so a whole batch is
// embedded in one HTTP call.
//
// Permanent errors:
//   · model not pulled — surface immediately with the exact `ollama pull`
//     command the user should run.
//   · server unreachable (ECONNREFUSED) — usually means `ollama serve`
//     isn't running. We surface that as permanent because retrying won't
//     help; the user has to start the daemon.
// Transient: 5xx and ECONNRESET — retried with backoff.
interface OllamaEmbedResponse {
  embeddings?: number[][]
  /** Older Ollama versions return a single `embedding` field. */
  embedding?: number[]
  /** Error path: server returns {"error": "model 'X' not found"}. */
  error?: string
}

async function callOllamaEmbeddings(
  inputs: string[],
  opts: {
    host: string
    model: string
    fetchImpl: typeof fetch
    sleep: (ms: number) => Promise<void>
  },
): Promise<number[][]> {
  const url = `${opts.host.replace(/\/+$/, '')}/api/embed`
  const body = JSON.stringify({ model: opts.model, input: inputs })
  let attempt = 0
  let lastErr: Error | null = null
  while (attempt < MAX_RETRIES) {
    attempt += 1
    try {
      const res = await opts.fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      })
      if (res.ok) {
        const data = (await res.json()) as OllamaEmbedResponse
        if (data.error) {
          // model-not-found and similar — permanent until the user fixes it.
          const hint = /not found|pull/i.test(data.error)
            ? ` (run \`ollama pull ${opts.model}\` to install it)`
            : ''
          throw new EmbedError(`Ollama: ${data.error}${hint}`, { permanent: true })
        }
        const embs = data.embeddings ?? (data.embedding ? [data.embedding] : null)
        if (!Array.isArray(embs) || embs.length !== inputs.length) {
          throw new EmbedError(
            `Ollama returned ${embs?.length ?? 0} embeddings for ${inputs.length} inputs`,
            { permanent: true },
          )
        }
        for (let i = 0; i < embs.length; i++) {
          if (!Array.isArray(embs[i]) || embs[i].length === 0) {
            throw new EmbedError(`Ollama returned empty embedding at [${i}]`, { permanent: true })
          }
        }
        return embs
      }
      const text = await res.text()
      // 404 typically means the model isn't pulled.
      if (res.status === 404) {
        throw new EmbedError(
          `Ollama 404 for model "${opts.model}" — run \`ollama pull ${opts.model}\`. Body: ${text.slice(0, 200)}`,
          { permanent: true },
        )
      }
      if (res.status >= 500) {
        const backoff = Math.min(1000 * Math.pow(2, attempt - 1), 30_000)
        lastErr = new EmbedError(`Ollama ${res.status}: ${text.slice(0, 200)}`)
        await opts.sleep(backoff)
        continue
      }
      throw new EmbedError(`Ollama ${res.status}: ${text.slice(0, 200)}`, { permanent: true })
    } catch (err) {
      if (err instanceof EmbedError && err.permanent) throw err
      // Connection-refused class: the daemon isn't running. No point in
      // retrying within a single CLI call.
      const msg = err instanceof Error ? err.message : String(err)
      if (/ECONNREFUSED|fetch failed|ENOTFOUND/i.test(msg)) {
        throw new EmbedError(
          `Ollama unreachable at ${opts.host} (start \`ollama serve\` or set OLLAMA_HOST). ${msg}`,
          { permanent: true },
        )
      }
      lastErr = err instanceof Error ? err : new Error(String(err))
      const backoff = Math.min(1000 * Math.pow(2, attempt - 1), 30_000)
      await opts.sleep(backoff)
    }
  }
  throw lastErr ?? new EmbedError('Ollama embeddings: retries exhausted')
}
