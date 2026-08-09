import { describe, it, expect } from 'vitest'
import {
  computeTrustIndicators,
  computeTriangulation,
  computeCoverageGaps,
  type PressArticleLite,
  type VerifiedClaimRow,
} from '../src/scraper/press-analytics'

const NOW = new Date('2026-05-20T12:00:00Z')

function makePress(overrides: Partial<PressArticleLite> = {}): PressArticleLite {
  return {
    id: 'a-1',
    title: 'Riba-roja invierte en el parque del Túria',
    link: 'https://infoturia.com/articles/1',
    source: 'Periòdic del Camp de Túria',
    sourceHost: 'infoturia.com',
    date: '2026-05-19T10:00:00Z',
    fingerprint: 'fp-1',
    ...overrides,
  }
}

function makeVerifiedRow(overrides: Partial<VerifiedClaimRow['claim']> = {}): VerifiedClaimRow {
  return {
    claim: {
      id: 'a-1-0-num',
      articleId: 'a-1',
      articleFingerprint: 'fp-1',
      articleSource: 'Periòdic del Camp de Túria',
      articleSourceHost: 'infoturia.com',
      articleUrl: 'https://infoturia.com/articles/1',
      articleDate: '2026-05-19T10:00:00Z',
      segmentIndex: 0,
      segmentKind: 'title',
      type: 'afirmacion_numerica',
      attributedSource: 'municipal',
      verbatim: 'Riba-roja invierte 185.000 € en el parque del Túria',
      context: '',
      topic: 'medio-ambiente',
      entities: { amountEuros: 185000 },
      confidence: 0.85,
      reasoning: 'numeric headline',
      requiresHumanApproval: true,
      ...overrides,
    },
    verification: {
      claimId: 'a-1-0-num',
      verdict: 'verificado',
      summary: 'matches BDNS',
      evidence: [
        {
          kind: 'bdns',
          ref: 'BDB-2026-001',
          snippet: 'BDNS BDB-2026-001 · 184.940 €',
          similarity: 0.99,
        },
      ],
      checkedAgainst: ['bdns'],
      articleUrl: 'https://infoturia.com/articles/1',
      articleSource: 'Periòdic del Camp de Túria',
      articleSourceHost: 'infoturia.com',
      articleFingerprint: 'fp-1',
    },
  }
}

describe('press-analytics — computeTrustIndicators', () => {
  it('returns one ArticleTrustRow per article in the rolling window', () => {
    const press = [
      makePress({ id: 'a-1', date: '2026-05-19T10:00:00Z' }),
      makePress({ id: 'a-2', date: '2026-05-18T10:00:00Z', fingerprint: 'fp-2' }),
      makePress({ id: 'a-3', date: '2026-04-01T10:00:00Z', fingerprint: 'fp-3' }),
    ]
    const report = computeTrustIndicators({ press, verified: [], windowDays: 30, now: NOW })
    expect(report.articles.length).toBe(2)
  })

  it('marks localCoverage=true for known local hosts', () => {
    const press = [makePress({ sourceHost: 'infoturia.com' })]
    const report = computeTrustIndicators({ press, verified: [], now: NOW })
    expect(report.articles[0].indicators.localCoverage).toBe(true)
  })

  it('marks corroboratedAcrossOutlets=true when two outlets tell the same story', () => {
    // DISTINCT fingerprints, as production always produces them: press.ts
    // hashes the first six significant words and drops the second outlet on a
    // collision, so two outlets can never share one. This test used to pass
    // `fingerprint: 'shared'` — a shape the pipeline cannot emit — and stayed
    // green while the indicator was false on all 68 real articles.
    const press = [
      makePress({
        id: 'a-1',
        title: 'Riba-roja invierte 61.000 euros en el circuito PLATEA de artes escénicas',
        source: 'Outlet A',
        sourceHost: 'a.test',
        fingerprint: 'fp-a',
      }),
      makePress({
        id: 'a-2',
        title: 'El Ayuntamiento destina 61.000 euros al circuito PLATEA de artes escénicas',
        source: 'Outlet B',
        sourceHost: 'b.test',
        fingerprint: 'fp-b',
      }),
    ]
    const report = computeTrustIndicators({ press, verified: [], now: NOW })
    expect(report.articles[0].indicators.corroboratedAcrossOutlets).toBe(true)
    expect(report.articles[1].indicators.corroboratedAcrossOutlets).toBe(true)
  })

  it('does not mark a lone article as corroborated', () => {
    const press = [makePress({ id: 'a-1', source: 'Outlet A', sourceHost: 'a.test' })]
    const report = computeTrustIndicators({ press, verified: [], now: NOW })
    expect(report.articles[0].indicators.corroboratedAcrossOutlets).toBe(false)
  })

  it('does not count a same-outlet echo as cross-outlet corroboration', () => {
    const press = [
      makePress({ id: 'a-1', title: 'Riba-roja aprueba el presupuesto municipal de 2026' }),
      makePress({
        id: 'a-2',
        title: 'Riba-roja aprueba el presupuesto municipal para 2026',
        fingerprint: 'fp-2',
      }),
    ]
    const report = computeTrustIndicators({ press, verified: [], now: NOW })
    expect(report.articles[0].indicators.corroboratedAcrossOutlets).toBe(false)
  })

  it('outletScorecard aggregates verdictCounts across an outlet', () => {
    const press = [
      makePress({ id: 'a-1', source: 'Outlet X', sourceHost: 'x.test' }),
      makePress({
        id: 'a-2',
        source: 'Outlet X',
        sourceHost: 'x.test',
        fingerprint: 'fp-2',
      }),
    ]
    const verified = [
      makeVerifiedRow({ id: 'a-1-0-num', articleId: 'a-1' }),
      makeVerifiedRow({ id: 'a-2-0-num', articleId: 'a-2' }),
    ]
    const report = computeTrustIndicators({ press, verified, now: NOW })
    const x = report.outlets.find((o) => o.outlet === 'Outlet X')
    expect(x?.articleCount).toBe(2)
    expect(x?.verdictCounts.verificado).toBe(2)
    expect(x?.verifiedRatio).toBe(1)
  })

  it('leaves outlet ratios null (→ "—") when the outlet has no audited claims', () => {
    const press = [makePress({ id: 'a-1', source: 'Unaudited Outlet', sourceHost: 'u.test' })]
    const report = computeTrustIndicators({ press, verified: [], now: NOW })
    const o = report.outlets.find((x) => x.outlet === 'Unaudited Outlet')
    expect(o?.articleCount).toBe(1)
    expect(o?.verifiedRatio).toBeNull()
    expect(o?.contradictedRatio).toBeNull()
  })

  it('opinionFraction reflects opinativa accusation share', () => {
    const press = [makePress({ id: 'a-1' })]
    const v1 = makeVerifiedRow({
      id: 'a-1-0-acu',
      articleId: 'a-1',
      type: 'acusacion_publica',
      accusationSubtype: 'opinativa',
    })
    const v2 = makeVerifiedRow({ id: 'a-1-1-num', articleId: 'a-1' })
    const report = computeTrustIndicators({ press, verified: [v1, v2], now: NOW })
    expect(report.articles[0].indicators.opinionFraction).toBeCloseTo(0.5, 2)
  })

  it('does NOT award the "not opinion" point to an article with zero claims', () => {
    // Non-local outlet, dated, no claims. The opinion axis must contribute 0
    // (nothing was assessed) — not a free +1. So score = datedArticle only.
    const press = [makePress({ id: 'a-1', source: 'El País', sourceHost: 'elpais.com' })]
    const report = computeTrustIndicators({ press, verified: [], now: NOW })
    expect(report.articles[0].indicators.opinionFraction).toBe(0)
    expect(report.articles[0].score).toBe(1)
  })

  it('awards the "not opinion" point when claims exist and none are opinativa', () => {
    // dated(1) + municipalSourceMatch(1, evidence) + factualClaimsPresent(1) + notOpinion(1) = 4
    const press = [makePress({ id: 'a-1', source: 'El País', sourceHost: 'elpais.com' })]
    const verified = [makeVerifiedRow({ id: 'a-1-0-num', articleId: 'a-1' })]
    const report = computeTrustIndicators({ press, verified, now: NOW })
    expect(report.articles[0].score).toBe(4)
  })
})

describe('press-analytics — computeTriangulation', () => {
  it('emits a cluster when ≥2 outlets carry the same story', () => {
    const press = [
      makePress({ id: 'a-1', source: 'Outlet A' }),
      makePress({ id: 'a-2', source: 'Outlet B' }),
    ]
    const r = computeTriangulation({ press, verified: [], now: NOW })
    expect(r.clusters.length).toBe(1)
    expect(r.clusters[0].outlets).toEqual(['Outlet A', 'Outlet B'])
  })

  it('counts 3+ triangulation correctly', () => {
    const press = [
      makePress({ id: 'a-1', source: 'A' }),
      makePress({ id: 'a-2', source: 'B' }),
      makePress({ id: 'a-3', source: 'C' }),
    ]
    const r = computeTriangulation({ press, verified: [], now: NOW })
    expect(r.stats.triangulated3Plus).toBe(1)
  })

  it('reports amountDrift when ≥2 verified claims cite different amounts on the same story', () => {
    const press = [makePress({ id: 'a-1', source: 'A' }), makePress({ id: 'a-2', source: 'B' })]
    const verified = [
      makeVerifiedRow({
        id: 'a-1-0-num',
        articleId: 'a-1',
        entities: { amountEuros: 180000 },
      }),
      makeVerifiedRow({
        id: 'a-2-0-num',
        articleId: 'a-2',
        entities: { amountEuros: 200000 },
      }),
    ]
    const r = computeTriangulation({ press, verified, now: NOW })
    expect(r.clusters[0].amountDrift).toEqual(
      expect.objectContaining({ min: 180000, max: 200000, spread: 20000 }),
    )
  })

  it('skips a story covered by only one outlet', () => {
    const press = [makePress({ id: 'a-1', source: 'Solo' })]
    const r = computeTriangulation({ press, verified: [], now: NOW })
    expect(r.clusters.length).toBe(0)
  })
})

describe('press-analytics — computeTriangulation (cross-outlet story clustering)', () => {
  // The feed is deduped by exact-title fingerprint upstream (press.ts), so two
  // outlets covering the same story ALWAYS arrive with different fingerprints.
  // Clustering must therefore key on title *similarity*, not the fingerprint.
  it('clusters two outlets on the same story despite different headlines + fingerprints', () => {
    const press = [
      makePress({
        id: 'a-1',
        source: 'Levante-EMV',
        sourceHost: 'levante-emv.com',
        title: 'Riba-roja adjudica la obra del nuevo polideportivo por 2,3 millones',
        fingerprint: 'fp-a',
      }),
      makePress({
        id: 'a-2',
        source: 'Las Provincias',
        sourceHost: 'lasprovincias.es',
        title: 'El nuevo polideportivo de Riba-roja se adjudica por 2,3 millones de euros',
        fingerprint: 'fp-b',
      }),
    ]
    const r = computeTriangulation({ press, verified: [], now: NOW })
    expect(r.clusters.length).toBe(1)
    expect(r.clusters[0].outlets).toEqual(expect.arrayContaining(['Las Provincias', 'Levante-EMV']))
    expect(r.clusters[0].articleIds).toEqual(expect.arrayContaining(['a-1', 'a-2']))
  })

  it('does not cluster unrelated stories from different outlets', () => {
    const press = [
      makePress({
        id: 'a-1',
        source: 'A',
        sourceHost: 'a.test',
        title: 'Riba-roja aprueba el presupuesto municipal para 2026',
        fingerprint: 'fp-a',
      }),
      makePress({
        id: 'a-2',
        source: 'B',
        sourceHost: 'b.test',
        title: 'El club de balonmano local asciende a primera división',
        fingerprint: 'fp-b',
      }),
    ]
    const r = computeTriangulation({ press, verified: [], now: NOW })
    expect(r.clusters.length).toBe(0)
  })

  it('does not triangulate two similar articles from the same outlet', () => {
    const press = [
      makePress({
        id: 'a-1',
        source: 'Levante-EMV',
        sourceHost: 'levante-emv.com',
        title: 'Riba-roja adjudica el nuevo polideportivo por 2,3 millones',
        fingerprint: 'fp-a',
      }),
      makePress({
        id: 'a-2',
        source: 'Levante-EMV',
        sourceHost: 'levante-emv.com',
        title: 'El nuevo polideportivo de Riba-roja se adjudica por 2,3 millones',
        fingerprint: 'fp-b',
      }),
    ]
    const r = computeTriangulation({ press, verified: [], now: NOW })
    expect(r.clusters.length).toBe(0)
  })

  it('excludes articles older than the rolling window', () => {
    const press = [
      makePress({
        id: 'a-1',
        source: 'A',
        sourceHost: 'a.test',
        title: 'Riba-roja adjudica el nuevo polideportivo por 2,3 millones',
        fingerprint: 'fp-a',
        date: '2026-05-19T10:00:00Z',
      }),
      makePress({
        id: 'a-2',
        source: 'B',
        sourceHost: 'b.test',
        title: 'El nuevo polideportivo de Riba-roja se adjudica por 2,3 millones',
        fingerprint: 'fp-b',
        date: '2026-01-01T10:00:00Z', // >30 days before NOW
      }),
    ]
    const r = computeTriangulation({ press, verified: [], now: NOW, windowDays: 30 })
    expect(r.clusters.length).toBe(0)
  })
})

describe('press-analytics — computeCoverageGaps', () => {
  it('flags pleno items whose title tokens never appear in press headlines', () => {
    const press = [
      makePress({
        title: 'Riba-roja invierte en el parque del Túria',
        date: '2026-05-19T10:00:00Z',
      }),
    ]
    const agendas = {
      plenos: [
        {
          id: 'p-1',
          date: '2026-05-18',
          agenda: [
            {
              number: 1,
              title: 'Modificación del reglamento de subvenciones',
              department: 'HACIENDA',
            },
            {
              number: 2,
              title: 'Aprobación del parque del Túria',
              department: 'MEDIO AMBIENTE',
            },
          ],
        },
      ],
    }
    const r = computeCoverageGaps({ press, agendas, now: NOW, windowDays: 14 })
    // Item 1 ("subvenciones", "reglamento", "modificación") doesn't intersect press tokens.
    // Item 2 ("parque", "túria") shares with press → covered.
    expect(r.items.length).toBe(1)
    expect(r.items[0].kind).toBe('pleno-item')
    expect(r.items[0].refId).toBe('p-1:1')
  })

  it('flags promises with no recent press echo', () => {
    const r = computeCoverageGaps({
      press: [makePress({ title: 'A different unrelated headline about elections' })],
      promises: {
        items: [{ id: 'pr-1', title: 'Reduciremos el IBI un 5 % en 2026', madeAt: '2026-05-15' }],
      },
      now: NOW,
      windowDays: 14,
    })
    expect(r.items[0].kind).toBe('promise')
    expect(r.stats.promisesUncovered).toBe(1)
  })
})
