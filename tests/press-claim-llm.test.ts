import { describe, it, expect, vi } from 'vitest'
import {
  extractPressClaimsForItem,
  extractPressClaimsBatch,
  _dedupeClaims,
  _projectClaim,
  type PressNewsItem,
} from '../src/scraper/press-claim-llm'

function makeItem(overrides: Partial<PressNewsItem> = {}): PressNewsItem {
  return {
    id: 'a-001',
    title: 'Riba-roja invierte 185.000 € en el parque del Túria',
    source: 'Test Outlet',
    sourceHost: 'example.test',
    link: 'https://example.test/articles/001',
    date: '2026-05-20T10:00:00.000Z',
    fingerprint: 'fp-001',
    ...overrides,
  }
}

describe('press-claim-llm — extractPressClaimsForItem', () => {
  it('skips extraction when triage flags hasCheckableClaim:false', async () => {
    const caller = vi.fn().mockResolvedValueOnce({
      hasCheckableClaim: false,
      reasoning: 'opinion column, no figures',
      expectedClaimTypes: [],
      needsBody: false,
    })
    const result = await extractPressClaimsForItem(makeItem(), { caller: caller as any })
    expect(result.claims).toEqual([])
    expect(result.bodyUsed).toBe(false)
    expect(caller).toHaveBeenCalledTimes(1)
  })

  it('returns empty + circuit-tripped triage when caller yields null', async () => {
    const caller = vi.fn().mockResolvedValueOnce(null)
    const result = await extractPressClaimsForItem(makeItem(), { caller: caller as any })
    expect(result.claims).toEqual([])
    expect(result.triage.reasoning).toBe('llm-unavailable')
  })

  it('runs headline-only extraction when triage says hasCheckableClaim:true + needsBody:false', async () => {
    const caller = vi
      .fn()
      .mockResolvedValueOnce({
        hasCheckableClaim: true,
        reasoning: 'headline asserts €',
        expectedClaimTypes: ['afirmacion_numerica'],
        needsBody: false,
      })
      .mockResolvedValueOnce({
        claims: [
          {
            type: 'afirmacion_numerica',
            attributedSource: 'municipal',
            verbatim: 'Riba-roja invierte 185.000 € en el parque del Túria',
            context: '',
            topic: 'medio-ambiente',
            entities: {
              amountEuros: 185000,
              count: null,
              countUnit: null,
              date: null,
              referencedEntity: 'parque del Túria',
            },
            accusationSubtype: null,
            confidence: 0.82,
            reasoning: 'numeric claim',
          },
        ],
      })

    const result = await extractPressClaimsForItem(makeItem(), { caller: caller as any })
    expect(result.claims.length).toBe(1)
    expect(result.claims[0].type).toBe('afirmacion_numerica')
    expect(result.claims[0].entities.amountEuros).toBe(185000)
    expect(result.claims[0].segmentKind).toBe('title')
    expect(result.claims[0].requiresHumanApproval).toBe(true)
    expect(result.bodyUsed).toBe(false)
    expect(caller).toHaveBeenCalledTimes(2)
  })

  it('fetches body + uses segmentKind:"body" when triage says needsBody:true', async () => {
    const caller = vi
      .fn()
      .mockResolvedValueOnce({
        hasCheckableClaim: true,
        reasoning: 'headline insinuates an amount',
        expectedClaimTypes: ['afirmacion_numerica'],
        needsBody: true,
      })
      .mockResolvedValueOnce({
        claims: [
          {
            type: 'afirmacion_numerica',
            attributedSource: 'outlet',
            verbatim: 'El proyecto contempla una inversión de 185.000 euros municipales',
            context: '',
            topic: 'medio-ambiente',
            entities: {
              amountEuros: 185000,
              count: null,
              countUnit: null,
              date: null,
              referencedEntity: null,
            },
            accusationSubtype: null,
            confidence: 0.9,
            reasoning: 'numeric in body',
          },
        ],
      })
    const fetcher = vi.fn().mockResolvedValueOnce('Body of the article with the €185k figure.')

    const result = await extractPressClaimsForItem(makeItem(), {
      caller: caller as any,
      bodyFetcher: fetcher as any,
    })
    expect(result.bodyUsed).toBe(true)
    expect(result.claims[0].segmentKind).toBe('body')
    expect(fetcher).toHaveBeenCalledWith('https://example.test/articles/001')
  })

  it('forceHeadlineOnly skips body-fetch even when triage requests it', async () => {
    const caller = vi
      .fn()
      .mockResolvedValueOnce({
        hasCheckableClaim: true,
        reasoning: 'x',
        expectedClaimTypes: ['cita_obra'],
        needsBody: true,
      })
      .mockResolvedValueOnce({ claims: [] })
    const fetcher = vi.fn()

    const result = await extractPressClaimsForItem(makeItem(), {
      caller: caller as any,
      bodyFetcher: fetcher as any,
      forceHeadlineOnly: true,
    })
    expect(result.bodyUsed).toBe(false)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('drops claims whose verbatim is shorter than 20 chars', async () => {
    const caller = vi
      .fn()
      .mockResolvedValueOnce({
        hasCheckableClaim: true,
        reasoning: 'x',
        expectedClaimTypes: ['promesa'],
        needsBody: false,
      })
      .mockResolvedValueOnce({
        claims: [
          {
            type: 'promesa',
            attributedSource: 'opposition',
            verbatim: 'too short',
            context: '',
            topic: 'fiscal',
            entities: {
              amountEuros: null,
              count: null,
              countUnit: null,
              date: null,
              referencedEntity: null,
            },
            accusationSubtype: null,
            confidence: 0.5,
            reasoning: 'short',
          },
          {
            type: 'promesa',
            attributedSource: 'opposition',
            verbatim: 'Reduciremos el IBI un 5 % antes de fin de mandato',
            context: '',
            topic: 'fiscal',
            entities: {
              amountEuros: null,
              count: 5,
              countUnit: '%',
              date: null,
              referencedEntity: 'IBI',
            },
            accusationSubtype: null,
            confidence: 0.85,
            reasoning: 'percent reduction',
          },
        ],
      })
    const result = await extractPressClaimsForItem(makeItem(), { caller: caller as any })
    expect(result.claims.length).toBe(1)
    expect(result.claims[0].verbatim).toMatch(/Reduciremos/)
  })
})

describe('press-claim-llm — _dedupeClaims', () => {
  it('collapses same type + amount + verbatim prefix; highest confidence wins', () => {
    const item = makeItem()
    const base = {
      type: 'afirmacion_numerica' as const,
      attributedSource: 'outlet' as const,
      verbatim: 'Riba-roja invierte 185.000 € en obras municipales y vecinales',
      context: '',
      topic: 'fiscal' as const,
      entities: {
        amountEuros: 185000,
        count: null,
        countUnit: null,
        date: null,
        referencedEntity: null,
      },
      accusationSubtype: null,
      confidence: 0.7,
      reasoning: '',
    }
    const c1 = _projectClaim(item, base, 0, 'title')!
    const c2 = _projectClaim(item, { ...base, confidence: 0.9 }, 1, 'title')!
    const c3 = _projectClaim(item, { ...base, confidence: 0.5 }, 2, 'title')!
    const deduped = _dedupeClaims([c1, c2, c3])
    expect(deduped.length).toBe(1)
    expect(deduped[0].confidence).toBe(0.9)
  })
})

describe('press-claim-llm — extractPressClaimsBatch', () => {
  it('aggregates per-item stats correctly', async () => {
    let call = 0
    const caller = vi.fn().mockImplementation(async (req: any) => {
      call += 1
      const isTriage = req.input.kind === 'press-triage'
      if (isTriage) {
        return {
          hasCheckableClaim: call <= 1, // only first item triages true
          reasoning: 'mock',
          expectedClaimTypes: [],
          needsBody: false,
        }
      }
      return { claims: [] }
    })
    const items = [
      makeItem({ id: 'a-001', fingerprint: 'fp-001' }),
      makeItem({ id: 'a-002', fingerprint: 'fp-002' }),
    ]
    const result = await extractPressClaimsBatch(items, { caller: caller as any })
    expect(result.stats.total).toBe(2)
    expect(result.stats.triageHits).toBe(1)
    expect(result.stats.bodyFetches).toBe(0)
  })
})
