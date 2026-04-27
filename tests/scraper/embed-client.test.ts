/**
 * Tests for the OpenAI embeddings wrapper. We stub fetch so these tests
 * don't make network calls or require an API key — the goal is to lock
 * in retry / backoff / token-count / quota-detection behaviour, not to
 * call OpenAI for real.
 */
import { describe, expect, it } from 'vitest'
import { EmbedError, embedTexts, estimateTokens } from '../../src/scraper/embed-client'

function fakeOk(embeddings: number[][]): typeof fetch {
  return (async () => {
    return new Response(
      JSON.stringify({
        data: embeddings.map((e, i) => ({ embedding: e, index: i })),
        model: 'text-embedding-3-small',
        usage: { prompt_tokens: 10, total_tokens: 10 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }) as unknown as typeof fetch
}

function fakeStatus(
  status: number,
  body: string,
  headers: Record<string, string> = {},
): typeof fetch {
  return (async () => new Response(body, { status, headers })) as unknown as typeof fetch
}

describe('estimateTokens', () => {
  it('over-estimates short strings (with a 25% safety margin)', () => {
    // 4 chars / 4 chars-per-token = 1, × 1.25 safety = 1.25, ceil = 2.
    expect(estimateTokens('abcd')).toBe(2)
  })

  it('scales linearly with length', () => {
    const a = estimateTokens('a'.repeat(400))
    const b = estimateTokens('a'.repeat(800))
    expect(b).toBeGreaterThan(a)
    expect(b).toBeLessThanOrEqual(a * 2 + 1)
  })
})

describe('embedTexts', () => {
  it('returns embeddings ordered by input index', async () => {
    const fetchImpl = fakeOk([
      [1, 0, 0, 0],
      [0, 1, 0, 0],
    ]) // dim=4 to match
    const out = await embedTexts(['a', 'b'], {
      apiKey: 'sk-test',
      fetchImpl,
      dim: 4,
    })
    expect(out).toEqual([
      [1, 0, 0, 0],
      [0, 1, 0, 0],
    ])
  })

  it('throws permanently when OPENAI_API_KEY is missing', async () => {
    const original = process.env.OPENAI_API_KEY
    delete process.env.OPENAI_API_KEY
    try {
      await expect(embedTexts(['a'], { fetchImpl: fakeOk([[0]]) })).rejects.toMatchObject({
        permanent: true,
      })
    } finally {
      if (original) process.env.OPENAI_API_KEY = original
    }
  })

  it('rejects rows over the token limit pre-flight', async () => {
    const giant = 'x'.repeat(40_000) // ~12k tokens > 8k limit
    await expect(
      embedTexts([giant], { apiKey: 'sk-test', fetchImpl: fakeOk([[0]]) }),
    ).rejects.toThrow(/exceeds 8000/)
  })

  it('rejects empty strings', async () => {
    await expect(embedTexts([''], { apiKey: 'sk-test', fetchImpl: fakeOk([[0]]) })).rejects.toThrow(
      /empty/,
    )
  })

  it('returns [] for empty input array without calling fetch', async () => {
    let called = false
    const fetchImpl = (async () => {
      called = true
      return new Response('', { status: 200 })
    }) as unknown as typeof fetch
    const out = await embedTexts([], { apiKey: 'sk-test', fetchImpl })
    expect(out).toEqual([])
    expect(called).toBe(false)
  })

  it('bails fast on insufficient_quota (no retry)', async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls += 1
      return new Response(JSON.stringify({ error: { code: 'insufficient_quota' } }), {
        status: 429,
      })
    }) as unknown as typeof fetch
    await expect(
      embedTexts(['a'], { apiKey: 'sk-test', fetchImpl, sleep: async () => {} }),
    ).rejects.toMatchObject({ permanent: true })
    expect(calls).toBe(1)
  })

  it('retries 429 (transient) up to MAX_RETRIES', async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls += 1
      return new Response('rate limited', { status: 429 })
    }) as unknown as typeof fetch
    await expect(
      embedTexts(['a'], { apiKey: 'sk-test', fetchImpl, sleep: async () => {} }),
    ).rejects.toBeInstanceOf(EmbedError)
    expect(calls).toBeGreaterThanOrEqual(2)
  })

  it('retries 5xx and succeeds eventually', async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls += 1
      if (calls < 3) return new Response('server', { status: 503 })
      return new Response(JSON.stringify({ data: [{ embedding: [1], index: 0 }] }), { status: 200 })
    }) as unknown as typeof fetch
    const out = await embedTexts(['a'], {
      apiKey: 'sk-test',
      fetchImpl,
      sleep: async () => {},
      dim: 1,
    })
    expect(out).toEqual([[1]])
    expect(calls).toBe(3)
  })

  it('does not retry 4xx other than 429', async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls += 1
      return new Response('schema error', { status: 400 })
    }) as unknown as typeof fetch
    await expect(
      embedTexts(['a'], { apiKey: 'sk-test', fetchImpl, sleep: async () => {} }),
    ).rejects.toMatchObject({ permanent: true })
    expect(calls).toBe(1)
  })

  it('rejects when API returns wrong embedding dimension', async () => {
    const fetchImpl = fakeOk([[1, 2]]) // 2 dims, expected 1536 by default
    await expect(embedTexts(['a'], { apiKey: 'sk-test', fetchImpl })).rejects.toThrow(/length 2/)
  })

  it('rejects when API returns count mismatch', async () => {
    const fetchImpl = fakeOk([[1]]) // 1 embedding, but we asked for 2
    await expect(embedTexts(['a', 'b'], { apiKey: 'sk-test', fetchImpl, dim: 1 })).rejects.toThrow(
      /returned 1 embeddings/,
    )
  })
})
