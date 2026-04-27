/**
 * Thin wrapper over the OpenAI Embeddings API for the verifier corpus.
 *
 * Used only by Node-only paths (scripts/embed-verifier-corpus.ts and the
 * verifier when `VERIFIER_SHORTLIST=semantic|hybrid`). Never imported by
 * browser code — the API key is a server-side secret.
 *
 *   · Token-counts each input pre-flight and rejects rows over the model's
 *     ctx window with a clear error rather than silently truncating.
 *   · Batches up to 2048 inputs per call (OpenAI's API limit).
 *   · Retries 429 (rate limit) and 5xx with exponential backoff +
 *     Retry-After honoring.
 *   · Surfaces `insufficient_quota` immediately so the caller bails out
 *     fast instead of spinning on a permanently-dead key.
 */

const DEFAULT_MODEL = 'text-embedding-3-small'
const DEFAULT_DIM = 1536
const MAX_TOKENS_PER_INPUT = 8000 // text-embedding-3-* hard limit is 8192
const MAX_INPUTS_PER_CALL = 2048
const MAX_RETRIES = 5

export class EmbedError extends Error {
  permanent: boolean
  constructor(msg: string, opts: { permanent?: boolean } = {}) {
    super(msg)
    this.name = 'EmbedError'
    this.permanent = opts.permanent ?? false
  }
}

export interface EmbedOptions {
  apiKey?: string
  model?: string
  dim?: number
  /** Override fetch (for tests). */
  fetchImpl?: typeof fetch
  /** Override sleep (for tests). */
  sleep?: (ms: number) => Promise<void>
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

  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new EmbedError('OPENAI_API_KEY not set', { permanent: true })
  }
  const model = opts.model ?? DEFAULT_MODEL
  const dim = opts.dim ?? DEFAULT_DIM
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch
  const sleep = opts.sleep ?? defaultSleep

  // Pre-flight token check.
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i]
    if (typeof t !== 'string' || t.length === 0) {
      throw new EmbedError(`embedTexts[${i}]: empty or non-string input`, { permanent: true })
    }
    const tokens = estimateTokens(t)
    if (tokens > MAX_TOKENS_PER_INPUT) {
      throw new EmbedError(
        `embedTexts[${i}]: ${tokens} tokens exceeds ${MAX_TOKENS_PER_INPUT} (model ${model}). Split or truncate the source row.`,
        { permanent: true },
      )
    }
  }

  // Batch into ≤2048 input chunks.
  const out: number[][] = []
  for (let start = 0; start < texts.length; start += MAX_INPUTS_PER_CALL) {
    const slice = texts.slice(start, start + MAX_INPUTS_PER_CALL)
    const batchEmbeds = await callEmbeddings(slice, { apiKey, model, dim, fetchImpl, sleep })
    for (const e of batchEmbeds) out.push(e)
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
