/**
 * `summarize:press` had the shape 621872a fixed in `extract:press-claims`, and
 * none of the guard: no `llmUnavailable` counter, no write gate, and an
 * unconditional whole-file overwrite of public/data/press-summaries.json. With
 * a dead backend it printed "0 summaries (of 1 requested)" and exited 0 — a
 * green tick for a run that did nothing. It survived the 2026-08-09 incident
 * only because the file was already `items: []`.
 *
 * Two distinct things are pinned here, because the summariser has TWO ways to
 * produce nothing and they must never be conflated:
 *
 *   · skippedNoBody  — never attempted. press.json carries no article bodies,
 *                      so the fail-closed gate from 8b149d0 short-circuits
 *                      before any LLM call. This is currently every article.
 *   · llmUnavailable — attempted and failed. The call was made and the model
 *                      returned nothing usable.
 *
 * Only the second is a backend failure and only it exits non-zero. Both block a
 * shrink: neither is evidence that a published summary should be deleted.
 */
import { describe, expect, it, vi } from 'vitest'

import {
  MIN_BODY_CHARS,
  summarizePressBatch,
  unresolvedSummaries,
  type PressSummaryInput,
} from '../src/scraper/press-summary-llm'
import { decideSnapshotWrite } from '../src/scraper/snapshot-write'

/** A body comfortably over the MIN_BODY_CHARS floor. */
const REAL_BODY = 'texto real del artículo publicado por el medio. '.repeat(20)

function article(n: number, body?: string): PressSummaryInput {
  return {
    articleId: `a${n}`,
    fingerprint: `f${n}`,
    source: 'Levante-EMV',
    title: `Titular ${n} sobre Riba-roja de Túria`,
    date: '2026-08-05',
    ...(body ? { body } : {}),
  }
}

/** Build an on-disk snapshot with `n` summary-shaped rows. Only length matters. */
function snapshotWith(n: number): string {
  return JSON.stringify({
    generatedAt: '2026-08-05T08:45:37.607Z',
    source: { description: 'x', contract: 'src/scraper/press-summary-llm.ts' },
    stats: { total: n, requested: n },
    items: Array.from({ length: n }, (_, i) => ({ articleId: `a${i}`, summary: 'x'.repeat(160) })),
  })
}

/** How the CLI calls the shared gate: BOTH unfinished categories are unresolved. */
const asSummaries = (args: {
  incomingCount: number
  llmUnavailable: number
  skippedNoBody: number
  existingRaw: string | null
}) =>
  decideSnapshotWrite({
    incomingCount: args.incomingCount,
    unresolvedCount: unresolvedSummaries({
      total: args.incomingCount + args.llmUnavailable + args.skippedNoBody,
      summarized: args.incomingCount,
      skippedNoBody: args.skippedNoBody,
      llmUnavailable: args.llmUnavailable,
    }),
    existingRaw: args.existingRaw,
    itemNoun: 'summary',
  })

describe('summarizePressBatch · attempted / done / never attempted, counted apart', () => {
  it('counts a body-less article as NEVER ATTEMPTED and does not reach the model', async () => {
    const caller = vi.fn()
    const { summaries, stats } = await summarizePressBatch([article(1), article(2)], { caller })

    expect(summaries).toHaveLength(0)
    // The load-bearing assertion: no call was made, so this cannot be a backend
    // failure. Without it, "0 summaries" is indistinguishable from a dead run.
    expect(caller).not.toHaveBeenCalled()
    expect(stats).toEqual({ total: 2, summarized: 0, skippedNoBody: 2, llmUnavailable: 0 })
  })

  it('counts a null answer to a REAL attempt as llmUnavailable — the dead-backend case', async () => {
    const caller = vi.fn().mockResolvedValue(null)
    const { summaries, stats } = await summarizePressBatch(
      [article(1, REAL_BODY), article(2, REAL_BODY)],
      { caller },
    )

    expect(summaries).toHaveLength(0)
    // Prove the run actually tried: two nulls with zero calls would mean the
    // counter was measuring the fail-closed gate, not the backend.
    expect(caller).toHaveBeenCalledTimes(2)
    expect(stats).toEqual({ total: 2, summarized: 0, skippedNoBody: 0, llmUnavailable: 2 })
  })

  it('separates all three outcomes inside one mixed batch', async () => {
    const caller = vi
      .fn()
      .mockResolvedValueOnce({ summary: 'x'.repeat(160) })
      .mockResolvedValueOnce(null)
    const { summaries, stats } = await summarizePressBatch(
      [article(1, REAL_BODY), article(2, REAL_BODY), article(3)],
      { caller },
    )

    expect(summaries).toHaveLength(1)
    expect(summaries[0].articleId).toBe('a1')
    // Two attempts for the two bodies; the third never got that far.
    expect(caller).toHaveBeenCalledTimes(2)
    expect(stats).toEqual({ total: 3, summarized: 1, skippedNoBody: 1, llmUnavailable: 1 })
  })

  it('accounts for every requested article, so no outcome can go unreported', async () => {
    const caller = vi.fn().mockResolvedValueOnce({ summary: 'x'.repeat(160) }).mockResolvedValue(null)
    const inputs = [
      article(1, REAL_BODY),
      article(2, REAL_BODY),
      article(3),
      article(4, 'corto'),
      article(5, REAL_BODY),
    ]
    const { stats } = await summarizePressBatch(inputs, { caller })

    expect(stats.total).toBe(inputs.length)
    expect(stats.summarized + stats.skippedNoBody + stats.llmUnavailable).toBe(inputs.length)
    // And the split is not degenerate — every bucket was exercised.
    expect(stats.summarized).toBeGreaterThan(0)
    expect(stats.skippedNoBody).toBeGreaterThan(0)
    expect(stats.llmUnavailable).toBeGreaterThan(0)
  })

  it('treats a body under the MIN_BODY_CHARS floor as never attempted, not as a failure', async () => {
    const caller = vi.fn()
    const { stats } = await summarizePressBatch([article(1, 'x'.repeat(MIN_BODY_CHARS - 1))], {
      caller,
    })

    expect(caller).not.toHaveBeenCalled()
    expect(stats.skippedNoBody).toBe(1)
    expect(stats.llmUnavailable).toBe(0)
  })
})

describe('unresolvedSummaries · both unfinished categories block a shrink', () => {
  it('counts the dead-backend items', () => {
    expect(
      unresolvedSummaries({ total: 5, summarized: 2, skippedNoBody: 0, llmUnavailable: 3 }),
    ).toBe(3)
  })

  it('counts the never-attempted items too — a missing body is not a licence to delete', () => {
    expect(
      unresolvedSummaries({ total: 5, summarized: 2, skippedNoBody: 3, llmUnavailable: 0 }),
    ).toBe(3)
  })

  it('is zero only when every requested article was resolved', () => {
    expect(
      unresolvedSummaries({ total: 4, summarized: 4, skippedNoBody: 0, llmUnavailable: 0 }),
    ).toBe(0)
  })
})

describe('decideSnapshotWrite · as summarize:press calls it', () => {
  it('refuses to erase published summaries when the backend was dead', () => {
    const d = asSummaries({
      incomingCount: 0,
      llmUnavailable: 7,
      skippedNoBody: 0,
      existingRaw: snapshotWith(7),
    })
    expect(d.write).toBe(false)
    // Assert the decision measured both sides, not merely that it said no.
    expect(d.existingCount).toBe(7)
    expect(d.incomingCount).toBe(0)
    expect(d.complete).toBe(false)
    expect(d.reason).toMatch(/refusing to overwrite 7 summary\(s\) with 0/)
  })

  it('refuses to erase them when every article was skipped for want of a body', () => {
    // The live shape today: llmUnavailable is 0 because nothing was attempted.
    // Gating on the backend counter alone would let this one through.
    const d = asSummaries({
      incomingCount: 0,
      llmUnavailable: 0,
      skippedNoBody: 7,
      existingRaw: snapshotWith(7),
    })
    expect(d.write).toBe(false)
    expect(d.existingCount).toBe(7)
    expect(d.complete).toBe(false)
    expect(d.reason).toMatch(/refusing to overwrite 7 summary\(s\) with 0/)
  })

  it('refuses any shrink, not just a shrink to zero', () => {
    const d = asSummaries({
      incomingCount: 3,
      llmUnavailable: 2,
      skippedNoBody: 1,
      existingRaw: snapshotWith(9),
    })
    expect(d.write).toBe(false)
    expect(d.reason).toMatch(/refusing to overwrite 9 summary\(s\) with 3/)
  })

  it("writes on today's real shape — nothing on disk, nothing produced, one skipped", () => {
    const d = asSummaries({
      incomingCount: 0,
      llmUnavailable: 0,
      skippedNoBody: 1,
      existingRaw: snapshotWith(0),
    })
    // An empty corpus cannot shrink, so the guard must not wedge the step shut.
    expect(d.write).toBe(true)
    expect(d.existingCount).toBe(0)
    expect(d.incomingCount).toBe(0)
    expect(d.complete).toBe(false)
  })

  it('allows growth from an incomplete run — that is real partial progress', () => {
    const d = asSummaries({
      incomingCount: 6,
      llmUnavailable: 4,
      skippedNoBody: 2,
      existingRaw: snapshotWith(3),
    })
    expect(d.write).toBe(true)
    expect(d.reason).toMatch(/did not shrink the corpus \(3 → 6\)/)
  })

  it('lets a COMPLETE run shrink the corpus — it is authoritative', () => {
    const d = asSummaries({
      incomingCount: 2,
      llmUnavailable: 0,
      skippedNoBody: 0,
      existingRaw: snapshotWith(9),
    })
    // If the allow-list genuinely narrowed, the snapshot must be free to say so.
    expect(d.write).toBe(true)
    expect(d.complete).toBe(true)
    expect(d.existingCount).toBe(9)
    expect(d.reason).toMatch(/complete run \(unresolved=0\)/)
  })

  it('allows a first-ever write when no file exists on disk', () => {
    const d = asSummaries({
      incomingCount: 0,
      llmUnavailable: 15,
      skippedNoBody: 0,
      existingRaw: null,
    })
    expect(d.write).toBe(true)
    expect(d.existingCount).toBe(0)
  })

  it('treats a corrupt existing file as 0 on disk rather than blocking forever', () => {
    const d = asSummaries({
      incomingCount: 0,
      llmUnavailable: 15,
      skippedNoBody: 0,
      existingRaw: '{ this is not json',
    })
    expect(d.write).toBe(true)
    expect(d.existingCount).toBe(0)
  })

  it('names summaries, not claims, in what it refused to delete', () => {
    // The gate is shared with extract:press-claims. If the noun were hard-coded
    // there, this run's log would report the wrong corpus.
    const d = asSummaries({
      incomingCount: 0,
      llmUnavailable: 3,
      skippedNoBody: 0,
      existingRaw: snapshotWith(3),
    })
    expect(d.reason).toContain('summary(s)')
    expect(d.reason).not.toContain('claim(s)')
  })
})
