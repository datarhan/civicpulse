import { describe, it, expect } from 'vitest'
import {
  shortlistCandidates,
  rerankTierB,
  type RerankQueja,
  type RerankCandidate,
} from '../src/scraper/queja-contract-rerank'

const queja: RerankQueja = {
  id: 'Q-1',
  serviceCode: 'deportes',
  placeSlug: null,
  description: 'Estructura metálica ilegal en el campo deportivo municipal',
  createdAt: '2025-01-01',
}
const cand = (o: Partial<RerankCandidate>): RerankCandidate => ({
  permalink: 'https://x/' + (o.tenderId ?? 'c'),
  tenderId: 'c',
  title: '',
  ...o,
})

describe('shortlistCandidates (lexical pre-filter)', () => {
  it('ranks candidates by word overlap with the queja and drops non-overlapping ones', () => {
    const candidates = [
      cand({ tenderId: 'c1', title: 'Obras en el campo deportivo municipal' }),
      cand({ tenderId: 'c2', title: 'Suministro de material de oficina' }),
      cand({ tenderId: 'c3', title: 'Mantenimiento de estructura metálica del pabellón' }),
    ]
    const top = shortlistCandidates(queja, candidates, 2)
    expect(top.map((c) => c.tenderId).sort()).toEqual(['c1', 'c3'])
    expect(top.map((c) => c.tenderId)).not.toContain('c2')
  })
  it('caps at topN', () => {
    const candidates = Array.from({ length: 20 }, (_, i) =>
      cand({ tenderId: 'k' + i, title: 'campo deportivo obra ' + i }),
    )
    expect(shortlistCandidates(queja, candidates, 5)).toHaveLength(5)
  })
})

describe('rerankTierB (LLM pick, injected caller)', () => {
  const candidates = [cand({ tenderId: 'c1', title: 'Obras campo deportivo' })]
  // Every stub below is annotated `Promise<any>`: `LlmCaller` is generic over
  // the zod schema chosen at the call site, so no concrete literal is
  // assignable to it. Annotating beats an `as unknown as` cast — the
  // parameters still get checked.
  const good = async (): Promise<any> => ({
    correlation: {
      quejaId: 'Q-1',
      tenderPermalink: 'https://x/c1',
      confidence: 0.82,
      reasoning: 'El contrato de obras en el campo deportivo podría abordar la queja.',
    },
  })

  it('returns the picked candidate stamped via:llm + requiresHumanApproval', async () => {
    const out = await rerankTierB(queja, candidates, good)
    expect(out).toMatchObject({
      tenderId: 'c1',
      tenderPermalink: 'https://x/c1',
      via: 'llm',
      requiresHumanApproval: true,
    })
  })
  it('drops a hallucinated permalink not in the candidate set', async () => {
    const halluc = async (): Promise<any> => ({
      correlation: {
        quejaId: 'Q-1',
        tenderPermalink: 'https://x/ZZZ',
        confidence: 0.9,
        reasoning: 'x'.repeat(12),
      },
    })
    expect(await rerankTierB(queja, candidates, halluc)).toBeNull()
  })
  it('drops a below-threshold confidence', async () => {
    const weak = async (): Promise<any> => ({
      correlation: {
        quejaId: 'Q-1',
        tenderPermalink: 'https://x/c1',
        confidence: 0.4,
        reasoning: 'x'.repeat(12),
      },
    })
    expect(await rerankTierB(queja, candidates, weak)).toBeNull()
  })
  it('returns null when the LLM declines (correlation:null)', async () => {
    expect(
      await rerankTierB(queja, candidates, async (): Promise<any> => ({ correlation: null })),
    ).toBeNull()
  })
  it('never calls the LLM when there are no candidates', async () => {
    let called = false
    const spy = async (): Promise<any> => {
      called = true
      return { correlation: null }
    }
    expect(await rerankTierB(queja, [], spy)).toBeNull()
    expect(called).toBe(false)
  })
})
