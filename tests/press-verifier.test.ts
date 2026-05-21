import { describe, it, expect } from 'vitest'
import { verifyPressClaim, verifyPressClaimsBatch } from '../src/scraper/press-verifier'
import type { PressClaim } from '../src/scraper/press-claim'

function makeClaim(overrides: Partial<PressClaim> = {}): PressClaim {
  return {
    id: 'a-001-0-num',
    articleId: 'a-001',
    articleFingerprint: 'fp-001',
    articleSource: 'Test Outlet',
    articleSourceHost: 'example.test',
    articleUrl: 'https://example.test/articles/001',
    articleDate: '2026-05-20T10:00:00.000Z',
    segmentIndex: 0,
    segmentKind: 'title',
    type: 'afirmacion_numerica',
    attributedSource: 'municipal',
    verbatim: 'Riba-roja invierte 185.000 € en el parque del Túria',
    context: '',
    topic: 'medio-ambiente',
    entities: {
      amountEuros: 185000,
      referencedEntity: 'parque del túria',
    },
    confidence: 0.85,
    reasoning: 'numeric headline',
    requiresHumanApproval: true,
    ...overrides,
  }
}

describe('press-verifier — opinativa accusations always sin-datos', () => {
  it('returns sin-datos for opinion-only accusations regardless of data', () => {
    const claim = makeClaim({
      type: 'acusacion_publica',
      accusationSubtype: 'opinativa',
      verbatim: 'El ayuntamiento ha fracasado en su gestión del río',
    })
    const result = verifyPressClaim({
      claim,
      tenders: { contracts: [] },
      bdns: { items: [] },
      budget: {},
    })
    expect(result.verdict).toBe('sin-datos')
  })
})

describe('press-verifier — dato_municipal (press-only family)', () => {
  it('verifies a padrón citation that matches INE within 2%', () => {
    const claim = makeClaim({
      type: 'dato_municipal',
      verbatim: 'Riba-roja supera ya los 24.600 habitantes según el último padrón',
      entities: { count: 24600, countUnit: 'habitantes', referencedEntity: 'padrón INE' },
      topic: 'demografia',
    })
    const result = verifyPressClaim({
      claim,
      padron: {
        items: [
          { year: 2025, total: 24616 },
          { year: 2024, total: 24300 },
        ],
      },
    })
    expect(result.verdict).toBe('verificado')
    expect(result.evidence[0].snippet).toMatch(/Padrón INE 2025/)
    expect(result.articleSource).toBe('Test Outlet')
  })

  it('returns sin-datos when the headline references padrón but the count is off by >2%', () => {
    const claim = makeClaim({
      type: 'dato_municipal',
      verbatim: 'Riba-roja supera ya los 28.000 habitantes según fuentes municipales',
      entities: { count: 28000, countUnit: 'habitantes', referencedEntity: 'padrón' },
      topic: 'demografia',
    })
    const result = verifyPressClaim({
      claim,
      padron: { items: [{ year: 2025, total: 24616 }] },
    })
    expect(result.verdict).toBe('sin-datos')
  })

  it('verifies a paro count against the SEPE monthly series within 5%', () => {
    const claim = makeClaim({
      type: 'dato_municipal',
      verbatim: 'El paro registrado en Riba-roja se sitúa en 1.250 personas',
      entities: { count: 1250, countUnit: 'personas', referencedEntity: 'paro registrado' },
      topic: 'empleo',
    })
    const result = verifyPressClaim({
      claim,
      paro: {
        items: [
          { month: '2026-03', total: 1247 },
          { month: '2026-02', total: 1310 },
        ],
      },
    })
    expect(result.verdict).toBe('verificado')
    expect(result.evidence[0].snippet).toMatch(/SEPE paro/)
  })

  it('returns sin-datos when no padron / paro reference is detected', () => {
    const claim = makeClaim({ type: 'dato_municipal' })
    const result = verifyPressClaim({ claim, padron: { items: [] }, paro: { items: [] } })
    expect(result.verdict).toBe('sin-datos')
  })
})

describe('press-verifier — preserves article provenance on every verdict', () => {
  it('every verification carries the article URL + outlet on the result', () => {
    const claim = makeClaim()
    const result = verifyPressClaim({ claim, tenders: { contracts: [] } })
    expect(result.articleUrl).toBe('https://example.test/articles/001')
    expect(result.articleSource).toBe('Test Outlet')
    expect(result.articleSourceHost).toBe('example.test')
    expect(result.articleFingerprint).toBe('fp-001')
  })
})

describe('press-verifier — verifyPressClaimsBatch', () => {
  it('aggregates per-verdict counts', () => {
    const claims: PressClaim[] = [
      makeClaim({ id: 'a-1-0', articleId: 'a-1' }),
      makeClaim({
        id: 'a-2-0',
        articleId: 'a-2',
        type: 'acusacion_publica',
        accusationSubtype: 'opinativa',
        verbatim: 'Pieza de opinión sobre el ayuntamiento como ejemplo de mala gestión',
      }),
    ]
    const snap = verifyPressClaimsBatch(claims, { tenders: { contracts: [] } })
    expect(snap.items.length).toBe(2)
    expect(snap.stats.total).toBe(2)
    expect(snap.stats.byVerdict['sin-datos']).toBeGreaterThanOrEqual(1)
  })
})

describe('press-verifier — Google Fact Check Tools cross-reference', () => {
  const newtralReview = {
    id: 'fc-newtral-1',
    claim: 'Riba-roja invertirá 50 millones de euros en el parque del Túria',
    claimant: null,
    claimDate: null,
    reviewerName: 'Newtral',
    reviewerSite: 'newtral.es',
    reviewTitle: 'No es cierto que Riba-roja invertirá 50 millones',
    reviewUrl: 'https://www.newtral.es/riba-roja-fake-claim/20260201/',
    reviewDate: '2026-02-01',
    verdict: 'Falso',
    normalizedVerdict: 'contradicho' as const,
    languageCode: 'es',
  }

  it('appends a kind:factcheck evidence row when a fact-check matches', () => {
    const claim = makeClaim({
      verbatim: 'Riba-roja invertirá 50 millones de euros en el parque del Túria',
    })
    const result = verifyPressClaim({
      claim,
      tenders: { contracts: [] },
      factchecks: [newtralReview],
    })
    const fcEvidence = result.evidence.find((e) => e.kind === 'factcheck')
    expect(fcEvidence?.ref).toBe(newtralReview.reviewUrl)
    expect(fcEvidence?.snippet).toMatch(/Newtral/)
    expect(result.checkedAgainst).toContain('factcheck')
  })

  it('upgrades a sin-datos verdict to the fact-checker consensus', () => {
    const claim = makeClaim({
      verbatim: 'Riba-roja invertirá 50 millones de euros en el parque del Túria',
    })
    const result = verifyPressClaim({
      claim,
      tenders: { contracts: [] },
      factchecks: [newtralReview],
    })
    expect(result.verdict).toBe('contradicho')
    expect(result.summary).toMatch(/consenso de fact-checkers/)
  })

  it('ignores factchecks when none have meaningful token overlap', () => {
    const claim = makeClaim({
      verbatim: 'Headline about national tax reform with no Riba-roja content',
    })
    const result = verifyPressClaim({
      claim,
      tenders: { contracts: [] },
      factchecks: [newtralReview],
    })
    expect(result.evidence.some((e) => e.kind === 'factcheck')).toBe(false)
  })
})
