import { describe, it, expect, vi } from 'vitest'
import { summarizePressArticle, MIN_BODY_CHARS } from '../src/scraper/press-summary-llm'

/**
 * A summary is rendered under the outlet's own name. Anything in it that the
 * article does not say is a fabricated quote attributed to a real newsroom.
 */
describe('press summaries — refuse to summarise a headline', () => {
  const base = {
    articleId: 'a1',
    fingerprint: 'f1',
    source: 'Valencia Plaza',
    title: "El 'Pacadar 360' de Riba-roja: un gran parque urbano de 5 hectáreas",
    date: '2026-07-28',
  }

  it('returns null when there is no body, without calling the model', async () => {
    const caller = vi.fn()
    expect(await summarizePressArticle(base, { caller })).toBeNull()
    expect(caller).not.toHaveBeenCalled()
  })

  it('returns null when the "body" is just the headline echoed back', async () => {
    const caller = vi.fn()
    expect(await summarizePressArticle({ ...base, body: base.title }, { caller })).toBeNull()
    expect(caller).not.toHaveBeenCalled()
  })

  it('summarises once a real body is supplied', async () => {
    const caller = vi.fn().mockResolvedValue({ summary: 'x'.repeat(160) })
    const out = await summarizePressArticle(
      { ...base, body: 'texto real del artículo. '.repeat(40) },
      { caller },
    )
    expect(out?.summary).toHaveLength(160)
    expect(caller).toHaveBeenCalledTimes(1)
  })

  it('keeps the floor high enough that a headline cannot clear it', () => {
    expect(MIN_BODY_CHARS).toBeGreaterThan(200)
  })
})
