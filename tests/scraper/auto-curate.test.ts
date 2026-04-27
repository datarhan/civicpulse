/**
 * Tests for the auto-curation core: gate filters, contradicho routing,
 * and the finding composer.
 *
 * The CLI orchestrator (scripts/auto-curate-findings.ts) is exercised
 * via end-to-end smoke runs (--dry-run); the pure module gets unit
 * coverage here so the libel-critical gates can't silently change.
 */
import { describe, expect, it } from 'vitest'
import {
  selectBundles,
  topQuotes,
  composeFinding,
  citedClaimIds,
  type VerifiedItem,
  type VerifiedSnapshot,
} from '../../src/scraper/auto-curate'
import { validateFindingsSnapshot } from '../../src/scraper/pleno-finding'

function mkClaim(over: Partial<VerifiedItem['claim']> = {}): VerifiedItem['claim'] {
  return {
    id: 'p1-001-cit-aaa111',
    plenoId: 'p1',
    plenoDate: '2026-01-15',
    segmentIndex: 0,
    type: 'cita_obra',
    topic: 'urbanismo',
    speakerGroup: 'PSOE',
    verbatim: 'el complejo deportivo La Mallá fue presupuestado en el año 2006 con problemas',
    context: 'debate municipal sobre infraestructura deportiva',
    entities: {},
    confidence: 0.85,
    reasoning: 'cita explícita',
    requiresHumanApproval: true,
    ...over,
  }
}

function mkItem(
  claimOver: Partial<VerifiedItem['claim']>,
  verdict: VerifiedItem['verification']['verdict'] = 'verificado',
): VerifiedItem {
  const claim = mkClaim(claimOver)
  return {
    claim,
    verification: {
      claimId: claim.id,
      verdict,
      summary: 'verifier summary',
      evidence: [
        {
          kind: 'tender',
          ref: 'https://example.com/tender/1',
          snippet: 'Servicio mantenimiento instalaciones complejo La Mallá',
          similarity: 0.7,
        },
      ],
      checkedAgainst: ['tenders'],
    },
  }
}

describe('selectBundles · gates', () => {
  it('groups by pleno + topic and filters out unattributed claims', () => {
    const verified: VerifiedSnapshot = {
      items: [
        mkItem({ id: 'p1-001-cit-a1', speakerGroup: 'PSOE' }, 'verificado'),
        mkItem({ id: 'p1-002-cit-a2', speakerGroup: 'PP' }, 'verificado'),
        mkItem({ id: 'p1-003-cit-a3', speakerGroup: null }, 'verificado'), // dropped
      ],
    }
    const r = selectBundles(verified, new Set(), { minScore: 0 })
    expect(r.eligible).toHaveLength(1)
    expect(r.eligible[0].items).toHaveLength(2)
    expect(r.eligible[0].blocs.sort()).toEqual(['PP', 'PSOE'])
  })

  it('routes contradicho-bearing bundles to quarantine, NOT eligible', () => {
    const verified: VerifiedSnapshot = {
      items: [
        mkItem({ id: 'p1-001-cit-a1', speakerGroup: 'PSOE' }, 'verificado'),
        mkItem({ id: 'p1-002-cit-a2', speakerGroup: 'PP' }, 'verificado'),
        mkItem({ id: 'p1-003-acu-a3', speakerGroup: 'Otro' }, 'contradicho'),
      ],
    }
    const r = selectBundles(verified, new Set(), { minScore: 0 })
    expect(r.eligible).toHaveLength(0)
    expect(r.quarantine).toHaveLength(1)
    expect(r.quarantine[0].items).toHaveLength(3) // contradicho stays in the bundle for the queue file
  })

  it('skips claims already cited in pleno-findings.json', () => {
    const verified: VerifiedSnapshot = {
      items: [
        mkItem({ id: 'p1-001-cit-a1', speakerGroup: 'PSOE' }, 'verificado'),
        mkItem({ id: 'p1-002-cit-a2', speakerGroup: 'PP' }, 'verificado'),
      ],
    }
    const cited = new Set(['p1-001-cit-a1'])
    const r = selectBundles(verified, cited, { minScore: 0 })
    // Only one claim survives; bundle has 1 bloc and no contradicho.
    // Dialectic gate (≥2 blocs OR ≥3 verificado same bloc) fails → dropped.
    expect(r.eligible).toHaveLength(0)
  })

  it('drops claims below confidence floor (0.65) and boilerplate verbatims', () => {
    const verified: VerifiedSnapshot = {
      items: [
        mkItem({ id: 'p1-001-cit-a1', speakerGroup: 'PSOE', confidence: 0.5 }, 'verificado'), // dropped: low conf
        mkItem(
          {
            id: 'p1-002-cit-a2',
            speakerGroup: 'PP',
            verbatim: 'Acta núm. 14 del pleno ordinario',
          },
          'verificado',
        ), // dropped: boilerplate
        mkItem({ id: 'p1-003-cit-a3', speakerGroup: 'VOX', confidence: 0.8 }, 'verificado'),
      ],
    }
    const r = selectBundles(verified, new Set(), { minScore: 0 })
    expect(r.eligible).toHaveLength(0) // single bloc with only 1 verificado claim
  })

  it('respects min-score floor', () => {
    const items = []
    for (let i = 0; i < 4; i++) {
      items.push(
        mkItem(
          {
            id: `p1-00${i}-cit-x${i}`,
            speakerGroup: i % 2 === 0 ? 'PSOE' : 'PP',
            confidence: 0.7,
          },
          'verificado',
        ),
      )
    }
    const verified: VerifiedSnapshot = { items }
    const lo = selectBundles(verified, new Set(), { minScore: 0 })
    expect(lo.eligible).toHaveLength(1)
    const hi = selectBundles(verified, new Set(), { minScore: 100 })
    expect(hi.eligible).toHaveLength(0)
  })

  it('passes single-bloc bundles when 3+ verificado claims', () => {
    const items = []
    for (let i = 0; i < 3; i++) {
      items.push(
        mkItem({ id: `p1-00${i}-cit-x${i}`, speakerGroup: 'PSOE', confidence: 0.85 }, 'verificado'),
      )
    }
    const r = selectBundles({ items }, new Set(), { minScore: 0 })
    expect(r.eligible).toHaveLength(1)
    expect(r.eligible[0].blocs).toEqual(['PSOE'])
  })

  it('caps eligible to opts.max', () => {
    const items: VerifiedItem[] = []
    for (let p = 0; p < 5; p++) {
      for (let i = 0; i < 2; i++) {
        items.push(
          mkItem(
            {
              id: `p${p}-00${i}-cit-x${i}`,
              plenoId: `p${p}`,
              speakerGroup: i === 0 ? 'PSOE' : 'PP',
              confidence: 0.85,
            },
            'verificado',
          ),
        )
      }
    }
    const r = selectBundles({ items }, new Set(), { minScore: 0, max: 3 })
    expect(r.eligible).toHaveLength(3)
  })
})

describe('topQuotes', () => {
  it('prefers contradicho > verificado > parcial, then by confidence', () => {
    const items = [
      mkItem({ id: 'a', confidence: 0.7 }, 'parcial'),
      mkItem({ id: 'b', confidence: 0.65 }, 'verificado'),
      mkItem({ id: 'c', confidence: 0.95 }, 'verificado'),
      mkItem({ id: 'd', confidence: 0.85 }, 'parcial'),
    ]
    const top = topQuotes(items, 4)
    expect(top.map((x) => x.claim.id)).toEqual(['c', 'b', 'd', 'a'])
  })
})

describe('composeFinding', () => {
  function buildBundle(opts?: Partial<{ blocs: string[]; itemCount: number }>) {
    const blocs = opts?.blocs ?? ['PSOE', 'PP']
    const itemCount = opts?.itemCount ?? 2
    const items: VerifiedItem[] = []
    for (let i = 0; i < itemCount; i++) {
      items.push(
        mkItem(
          {
            id: `p1-00${i}-cit-x${i}`,
            speakerGroup: blocs[i % blocs.length],
            confidence: 0.85,
          },
          'verificado',
        ),
      )
    }
    return {
      plenoId: 'p1',
      plenoDate: '2026-01-15',
      topic: 'urbanismo',
      blocs,
      items,
      score: 10.0,
    }
  }

  it('produces a valid PlenoFinding payload accepted by the snapshot validator', () => {
    const bundle = buildBundle()
    const finding = composeFinding({
      bundle,
      selectedQuotes: bundle.items,
      llmTitle: 'Debate urbanismo La Mallá pleno 2026-01-15',
      llmSummary:
        'En el pleno del 15 de enero de 2026, los grupos PSOE y PP debatieron el estado del complejo La Mallá. Los registros municipales (PLACSP) confirman al menos un contrato de mantenimiento.',
    })
    expect(finding.severity).toBe('informational')
    expect(finding.curatorName).toBe('auto-curation-v1')
    expect(finding.sourceClaimIds).toHaveLength(2)
    expect(finding.contradiction).toEqual([])

    const snap = {
      version: '1.0',
      generatedAt: new Date().toISOString(),
      legalNotice: 'Test legal notice text long enough to pass the schema floor.',
      contactUrl: 'https://example.com',
      methodologyUrl: '/metodologia',
      items: [finding],
    }
    expect(() => validateFindingsSnapshot(JSON.stringify(snap))).not.toThrow()
  })

  it('aggregates verifier evidence into corroboration[]', () => {
    const bundle = buildBundle()
    const finding = composeFinding({
      bundle,
      selectedQuotes: bundle.items,
      llmTitle: 'Title test 2026-01-15',
      llmSummary:
        'Resumen suficientemente largo para satisfacer el suelo de validación del schema.',
    })
    expect(finding.corroboration.length).toBeGreaterThan(0)
    expect(finding.corroboration[0].kind).toBe('tender')
  })

  it('appends pleno video URL to corroboration when supplied', () => {
    const bundle = buildBundle()
    const finding = composeFinding({
      bundle,
      selectedQuotes: bundle.items,
      llmTitle: 'Title test 2026-01-15',
      llmSummary: 'Resumen suficientemente largo para satisfacer el suelo del schema.',
      plenoSourceUrl: 'https://www.youtube.com/watch?v=ABCDEF',
      plenoSourceKind: 'pleno-video',
    })
    const videoRef = finding.corroboration.find((r) => r.kind === 'pleno-video')
    expect(videoRef).toBeDefined()
    expect(videoRef!.ref).toBe('https://www.youtube.com/watch?v=ABCDEF')
  })

  it('dedups verifier evidence refs across selected quotes', () => {
    const bundle = buildBundle({ itemCount: 3, blocs: ['PSOE', 'PP', 'VOX'] })
    // All three claims share the same evidence ref via mkItem default.
    const finding = composeFinding({
      bundle,
      selectedQuotes: bundle.items,
      llmTitle: 'Dedup test 2026-01-15',
      llmSummary: 'Resumen suficientemente largo para satisfacer el suelo del schema.',
    })
    expect(finding.corroboration).toHaveLength(1)
  })

  it('severity is hard-coded informational regardless of bundle', () => {
    const bundle = buildBundle()
    const finding = composeFinding({
      bundle,
      selectedQuotes: bundle.items,
      llmTitle: 'Test 2026-01-15',
      llmSummary: 'Resumen suficientemente largo para satisfacer el suelo del schema.',
    })
    expect(finding.severity).toBe('informational')
  })
})

describe('citedClaimIds', () => {
  it('unions sourceClaimIds across all findings', () => {
    const findings = {
      items: [
        { id: 'f1', sourceClaimIds: ['a', 'b'] },
        { id: 'f2', sourceClaimIds: ['b', 'c'] },
      ],
    } as never
    expect([...citedClaimIds(findings)].sort()).toEqual(['a', 'b', 'c'])
  })

  it('handles null/undefined input cleanly', () => {
    expect(citedClaimIds(null).size).toBe(0)
    expect(citedClaimIds(undefined).size).toBe(0)
  })
})
