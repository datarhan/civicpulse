import { describe, it, expect } from 'vitest'
import { usageFromSse } from '../src/scraper/speaker-map'

/**
 * What a chunk costs — the number a twenty-night sweep is going to be sized on.
 *
 * The manifest of the one good night read `15 calls · 3.688 tokens · $0,2074`.
 * Those 3,688 were the text adjudication calls alone: the transcription goes
 * out over `curl` on `streamGenerateContent`, where `src/llm/client`'s
 * accounting cannot reach it, while a single 20-minute chunk is ~30k input
 * tokens by itself. So the figure the budget would have been built on was low
 * by two orders of magnitude, and low in the direction that says yes.
 *
 * ## The trap this file exists for
 *
 * Gemini repeats the RUNNING totals on every SSE event, not a delta. Summing
 * them multiplies the bill by the number of events — a 30k-token chunk read as
 * 300k, and a sweep priced out of existence on arithmetic. Last-wins is the
 * rule, and the first test below is the one that catches its inverse.
 *
 * ## What these fixtures are, honestly
 *
 * SYNTHETIC. The captured fixtures in `tests/fixtures/` hold the model's
 * extracted text, not the raw stream, so there is no recorded SSE body to
 * assert against. These reproduce the documented envelope shape and guard the
 * FOLDING RULE, which is where the arithmetic error lives. They cannot prove
 * the field names are the ones the live API sends — only a metered run can, and
 * that run reports its per-chunk tokens on stdout precisely so a zero is
 * visible rather than silently averaged into a budget.
 */

const event = (usage: Record<string, number> | null, text = 'x') =>
  `data: ${JSON.stringify({
    candidates: [{ content: { parts: [{ text }] } }],
    ...(usage ? { usageMetadata: usage } : {}),
  })}`

describe('usageFromSse', () => {
  it('takes the LAST totals, never the sum of the events', () => {
    // Three events of a stream that ends at 30,600 in / 4,800 out. Summed, the
    // same stream reads 61,300 / 9,700 — and every budget built on it doubles.
    const sse = [
      event({ promptTokenCount: 30_600, candidatesTokenCount: 1_200 }),
      event({ promptTokenCount: 30_600, candidatesTokenCount: 3_700 }),
      event({ promptTokenCount: 30_600, candidatesTokenCount: 4_800, thoughtsTokenCount: 26_000 }),
    ].join('\n')
    const u = usageFromSse(sse)
    expect(u.inputTokens).toBe(30_600)
    expect(u.outputTokens).toBe(4_800)
  })

  it('counts thinking tokens, which are billed and reported apart', () => {
    // Measured 2026-08-10 on a 60-minute request: 16.7k output beside 35.9k of
    // thinking. Dropping the second more than triples the error on output.
    const u = usageFromSse(
      event({ promptTokenCount: 90_600, candidatesTokenCount: 16_700, thoughtsTokenCount: 35_900 }),
    )
    expect(u.thinkingTokens).toBe(35_900)
  })

  it('keeps the last totals when later events carry no usage block', () => {
    const sse = [
      event({ promptTokenCount: 1_000, candidatesTokenCount: 50 }),
      event(null),
      event(null),
    ].join('\n')
    expect(usageFromSse(sse).inputTokens).toBe(1_000)
  })

  it('survives a stream it cannot parse rather than costing a map', () => {
    // Mid-transcription. Losing a cost figure must never lose a chunk.
    expect(() => usageFromSse('data: {not json\ndata: \n\n')).not.toThrow()
    expect(usageFromSse('')).toEqual({ inputTokens: 0, outputTokens: 0, thinkingTokens: 0 })
  })

  it('reports zero for a stream with no usage at all, rather than guessing', () => {
    // A zero here is a signal, not a default to be smoothed over: it means the
    // envelope changed and the sweep is being sized on nothing.
    expect(usageFromSse([event(null), event(null)].join('\n')).inputTokens).toBe(0)
  })
})
