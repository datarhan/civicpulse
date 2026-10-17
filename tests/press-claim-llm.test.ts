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

  it('counts llm-unavailable items so a backend-less run is not silently empty', async () => {
    // Every call returns null → the circuit trips → every item's triage is
    // stamped 'llm-unavailable'. The batch must surface that count so the CLI
    // can distinguish "no checkable claims" from "no working LLM".
    const caller = vi.fn().mockResolvedValue(null)
    const items = [
      makeItem({ id: 'a-001', fingerprint: 'fp-001' }),
      makeItem({ id: 'a-002', fingerprint: 'fp-002' }),
    ]
    const result = await extractPressClaimsBatch(items, { caller: caller as any })
    expect(result.stats.claimsEmitted).toBe(0)
    expect(result.stats.llmUnavailable).toBe(2)
  })

  // La CLI decide el desenlace de cada artículo (`desenlaceDe`,
  // press-extraccion.ts) a partir de `triages`. Sin el recuento por artículo y
  // sin el aviso de la extracción muda, «el triaje dio positivo y la extracción
  // no respondió» llega a la CLI idéntico a «miró y no encontró nada».
  it('cada triaje lleva cuántas afirmaciones dio y si la extracción quedó sin respuesta', async () => {
    const triajePositivo = {
      hasCheckableClaim: true,
      reasoning: 'cifra en el titular',
      expectedClaimTypes: ['afirmacion_numerica'],
      needsBody: false,
    }
    const unaAfirmacion = {
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
    }
    // Por artículo, en orden: a-001 extrae una; a-002 se descarta en el
    // triaje; a-003 pasa el triaje y la extracción devuelve null; a-004 no
    // llega al modelo; a-005 pasa el triaje y la extracción no da ninguna.
    const respuestas: Record<string, { triaje: unknown; extraccion?: unknown }> = {
      'fp-001': { triaje: triajePositivo, extraccion: unaAfirmacion },
      'fp-002': {
        triaje: {
          hasCheckableClaim: false,
          reasoning: 'opinión',
          expectedClaimTypes: [],
          needsBody: false,
        },
      },
      'fp-003': { triaje: triajePositivo, extraccion: null },
      'fp-004': { triaje: null },
      'fp-005': { triaje: triajePositivo, extraccion: { claims: [] } },
    }
    const caller = vi.fn().mockImplementation(async (req: any) => {
      const r = respuestas[req.input.fingerprint]
      return req.input.kind === 'press-triage' ? r.triaje : r.extraccion
    })
    const items = ['001', '002', '003', '004', '005'].map((n) =>
      makeItem({ id: `a-${n}`, fingerprint: `fp-${n}` }),
    )
    const result = await extractPressClaimsBatch(items, { caller: caller as any })
    expect(result.triages.map((t) => [t.articleId, t.claims, t.extraccionSinRespuesta])).toEqual([
      ['a-001', 1, false],
      ['a-002', 0, false],
      ['a-003', 0, true],
      // Un triaje sin modelo no es una extracción sin respuesta: ya lo marca
      // `reasoning: 'llm-unavailable'`, y la extracción ni se intentó.
      ['a-004', 0, false],
      ['a-005', 0, false],
    ])
  })
})

describe('press-claim-llm — extractPressClaimsForItem · extraccionSinRespuesta', () => {
  it('sólo es true cuando el triaje dio positivo y la extracción devolvió null', async () => {
    const caller = vi
      .fn()
      .mockResolvedValueOnce({
        hasCheckableClaim: true,
        reasoning: 'cifra',
        expectedClaimTypes: [],
        needsBody: false,
      })
      .mockResolvedValueOnce(null)
    const result = await extractPressClaimsForItem(makeItem(), { caller: caller as any })
    expect(result.claims).toEqual([])
    expect(result.extraccionSinRespuesta).toBe(true)
    // El resto del resultado no cambia: el triaje real, no uno inventado.
    expect(result.triage.hasCheckableClaim).toBe(true)
    expect(result.bodyUsed).toBe(false)
  })

  it('es false en un triaje sin modelo y en un triaje negativo', async () => {
    const sinModelo = await extractPressClaimsForItem(makeItem(), {
      caller: vi.fn().mockResolvedValueOnce(null) as any,
    })
    expect(sinModelo.extraccionSinRespuesta).toBe(false)
    const negativo = await extractPressClaimsForItem(makeItem(), {
      caller: vi.fn().mockResolvedValueOnce({
        hasCheckableClaim: false,
        reasoning: 'opinión',
        expectedClaimTypes: [],
        needsBody: false,
      }) as any,
    })
    expect(negativo.extraccionSinRespuesta).toBe(false)
  })
})
