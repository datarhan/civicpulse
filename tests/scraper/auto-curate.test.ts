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
import { classifyClaimVisibility } from '../../src/scraper/claim-public-gate'
import { buildRecordDateIndex, emptyRecordDateGateReport } from '../../src/scraper/record-dates'
import { findRepeatedQuotes, validateFindingsSnapshot } from '../../src/scraper/pleno-finding'
import type { ClaimEvidence } from '../../src/scraper/claim-verifier'
import type { SpeakerGroup } from '../../src/scraper/pleno-votes'

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
  evidence: ClaimEvidence[] = [
    {
      kind: 'tender',
      ref: 'https://example.com/tender/1',
      snippet: 'Servicio mantenimiento instalaciones complejo La Mallá',
      similarity: 0.7,
    },
  ],
): VerifiedItem {
  const claim = mkClaim(claimOver)
  return {
    claim,
    verification: {
      claimId: claim.id,
      verdict,
      summary: 'verifier summary',
      evidence,
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
        // A real bloc, not the retired `Otro` sentinel — the routing under test
        // keys on the verdict, and `Otro` no longer type-checks. See
        // tests/otro-sentinel-retired.test.ts.
        mkItem({ id: 'p1-003-acu-a3', speakerGroup: 'VOX' }, 'contradicho'),
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

/**
 * The public claim-ledger gate governs what machine-extracted claims may
 * surface. `/hallazgos` republishes the verbatim of every claim a finding
 * quotes, so auto-curation must ask the same gate the ledger asks — and may not
 * use the exception the gate reserves for a curator.
 *
 * Both directions in one test: the only difference between the claims below is
 * the accusation subtype, which is precisely what the gate reads.
 */
describe('selectBundles · public claim-ledger gate', () => {
  const shownAccusation = (id: string, speakerGroup: SpeakerGroup) =>
    mkItem(
      { id, speakerGroup, type: 'acusacion_publica', accusationSubtype: 'factual' },
      'verificado',
    )

  it('bundles a gate-shown accusation and leaves the gate-hidden one out', () => {
    const opinativa = mkItem(
      {
        id: 'p1-003-acu-a3',
        speakerGroup: 'VOX',
        type: 'acusacion_publica',
        accusationSubtype: 'opinativa',
      },
      'verificado',
    )
    // Guard the premise: this pair really does straddle the gate.
    expect(classifyClaimVisibility(shownAccusation('p1-001-acu-a1', 'PSOE'))).toBe('shown')
    expect(classifyClaimVisibility(opinativa)).toBe('hidden')

    const r = selectBundles(
      {
        items: [
          shownAccusation('p1-001-acu-a1', 'PSOE'),
          shownAccusation('p1-002-acu-a2', 'PP'),
          opinativa,
        ],
      },
      new Set(),
      { minScore: 0 },
    )
    expect(r.eligible).toHaveLength(1)
    expect(r.eligible[0].items.map((i) => i.claim.id)).toEqual(['p1-001-acu-a1', 'p1-002-acu-a2'])
    expect(r.quarantine).toHaveLength(0)
  })

  it('drops an accusation with no subtype — the gate defaults it to opinativa', () => {
    const r = selectBundles(
      {
        items: [
          shownAccusation('p1-001-acu-a1', 'PSOE'),
          shownAccusation('p1-002-acu-a2', 'PP'),
          mkItem(
            { id: 'p1-003-acu-a3', speakerGroup: 'VOX', type: 'acusacion_publica' },
            'verificado',
          ),
        ],
      },
      new Set(),
      { minScore: 0 },
    )
    expect(r.eligible[0].items.map((i) => i.claim.id)).not.toContain('p1-003-acu-a3')
  })

  it('still quarantines a contradicho bundle, though the gate calls it hidden', () => {
    // The gate and the quarantine agree that a machine contradicho must not be
    // published; the quarantine goes further and withholds its whole bundle.
    // If the gate filtered the claim out first there would be no contradicho
    // left to route, the queue file would come up empty, and the guard would
    // look like it had nothing to catch.
    const contradicho = mkItem(
      {
        id: 'p1-003-acu-a3',
        speakerGroup: 'VOX',
        type: 'acusacion_publica',
        accusationSubtype: 'factual',
      },
      'contradicho',
    )
    expect(classifyClaimVisibility(contradicho)).toBe('hidden')
    const r = selectBundles(
      {
        items: [
          shownAccusation('p1-001-acu-a1', 'PSOE'),
          shownAccusation('p1-002-acu-a2', 'PP'),
          contradicho,
        ],
      },
      new Set(),
      { minScore: 0 },
    )
    expect(r.eligible).toHaveLength(0)
    expect(r.quarantine).toHaveLength(1)
    expect(r.quarantine[0].items.map((i) => i.claim.id)).toContain('p1-003-acu-a3')
  })

  it('drops the claim, not the bundle — the survivors still face the dialectic gate', () => {
    // One shown claim + one hidden claim: the bundle now has a single bloc and
    // a single verificado, so it fails the dialectic gate on its own merits.
    const r = selectBundles(
      {
        items: [
          shownAccusation('p1-001-acu-a1', 'PSOE'),
          mkItem(
            {
              id: 'p1-002-acu-a2',
              speakerGroup: 'PP',
              type: 'acusacion_publica',
              accusationSubtype: 'opinativa',
            },
            'verificado',
          ),
        ],
      },
      new Set(),
      { minScore: 0 },
    )
    expect(r.eligible).toHaveLength(0)
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
  function buildBundle(opts?: Partial<{ blocs: SpeakerGroup[]; itemCount: number }>) {
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
            // Distinct per item, deliberately. Until 2026-08-10 every item in
            // this bundle carried mkClaim's default verbatim, so `composeFinding`
            // was only ever exercised on a bundle where two blocs said the
            // identical sentence — the very shape three published findings
            // shipped. A fixture that restates the defect cannot detect it.
            verbatim: `intervención número ${i} sobre el estado del complejo deportivo La Mallá`,
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

  /**
   * The generator pattern behind `f-2025-12-01-acu-51aaa3`,
   * `f-2026-01-19-cit-3fd230` and `f-2026-05-11-acu-a870a4`: the extractor
   * emits a claim for the whole sentence AND one starting a few words in, the
   * selector hands both to the composer, and the page shows one voice twice —
   * with two different `speakerGroup` values in all three real cases, so the
   * LLM summary then counted two speakers.
   *
   * Both orderings, because they take DIFFERENT branches of the dedupe and the
   * published corpus contained one of each: `51aaa3` had the short copy first,
   * `a870a4` the long one. A single ordering left half the dedupe unexercised —
   * ablating that half stayed green.
   */
  const WHOLE = 'después de la catástrofe, ustedes han emitido salvoconductos en alerta roja'
  const CUT = { id: 'p1-010-acu-short', speakerGroup: null, verbatim: WHOLE.slice(28) } as const
  const FULL = { id: 'p1-011-acu-whole', speakerGroup: 'PSOE', verbatim: WHOLE } as const
  const OTHER = {
    id: 'p1-012-acu-other',
    speakerGroup: 'PP',
    verbatim: 'una cuestión enteramente distinta',
  } as const

  it.each([
    { order: 'short first', claims: [CUT, FULL, OTHER], anchor: 'f-2026-01-15-acu-short' },
    { order: 'long first', claims: [FULL, CUT, OTHER], anchor: 'f-2026-01-15-acu-whole' },
  ])('publishes one row per intervention when the extractor cut it twice ($order)', (c) => {
    const bundle = buildBundle()
    bundle.items = c.claims.map((x) => mkItem({ ...x }))
    const finding = composeFinding({
      bundle,
      selectedQuotes: bundle.items,
      llmTitle: 'Debate sobre salvoconductos pleno 2026-01-15',
      llmSummary:
        'En el pleno del 15 de enero de 2026 se debatió la emisión de salvoconductos durante la alerta roja, con intervenciones de dos grupos municipales.',
    })
    // Whichever came first, the fuller verbatim is the one that survives —
    // and it is the attributed one.
    expect(finding.quotes.map((q) => q.sourceClaimId)).toEqual([
      'p1-011-acu-whole',
      'p1-012-acu-other',
    ])
    expect(finding.quotes[0].speakerGroup).toBe('PSOE')
    // Both ids stay in the citation trail: the claim was real, it was just not
    // a second row.
    expect(finding.sourceClaimIds).toEqual(c.claims.map((x) => x.id))
    // And the id still keys the anchor, so deduping cannot rename a finding.
    expect(finding.id).toBe(c.anchor)
    expect(findRepeatedQuotes(finding)).toEqual([])
  })

  it('aggregates verifier evidence into crossChecked[]', () => {
    const bundle = buildBundle()
    const finding = composeFinding({
      bundle,
      selectedQuotes: bundle.items,
      llmTitle: 'Title test 2026-01-15',
      llmSummary:
        'Resumen suficientemente largo para satisfacer el suelo de validación del schema.',
    })
    expect(finding.crossChecked.length).toBeGreaterThan(0)
    expect(finding.crossChecked[0].kind).toBe('tender')
  })

  it('appends pleno video URL to crossChecked when supplied', () => {
    const bundle = buildBundle()
    const finding = composeFinding({
      bundle,
      selectedQuotes: bundle.items,
      llmTitle: 'Title test 2026-01-15',
      llmSummary: 'Resumen suficientemente largo para satisfacer el suelo del schema.',
      plenoSourceUrl: 'https://www.youtube.com/watch?v=ABCDEF',
      plenoSourceKind: 'pleno-video',
    })
    const videoRef = finding.crossChecked.find((r) => r.kind === 'pleno-video')
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
    expect(finding.crossChecked).toHaveLength(1)
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

/**
 * A record that did not exist when the council met cannot be what the council
 * was discussing. Three of these shipped: a Microsoft 365 contract awarded
 * 2026-02-02 cross-checked against a 2026-01-19 session, a Plan de Igualdad
 * contract awarded 2026-06-02 against 2026-05-11, and an award of 2026-05-08
 * against a debate seven months earlier.
 *
 * The positive control is the point of the test. A tender process is public,
 * and debatable, from the moment the licitación opens — so a gate keyed on the
 * award date alone would drop true joins, and a test with only the negative
 * case could not tell that gate from this one.
 */
describe('composeFinding · record-date gate', () => {
  const SESSION = '2026-01-19'
  const POST_DATED = 'https://example.com/tender/awarded-after-the-session'
  const LIVE_PROCESS = 'https://example.com/tender/open-at-the-session'

  const index = buildRecordDateIndex([
    {
      contracts: [
        // The Microsoft 365 shape: awarded a fortnight after the session, no
        // licitación row, nothing that was under way on the day.
        { permalink: POST_DATED, awardDate: '2026-02-02', endDate: '2026-10-14' },
        // Awarded LATER than the post-dated one, and it must survive: its
        // process was open two weeks before the council sat.
        { permalink: LIVE_PROCESS, awardDate: '2026-03-01', endDate: '2027-01-01' },
      ],
      tenders: [
        {
          permalink: LIVE_PROCESS,
          openProposalsDate: '2026-01-05',
          submissionDate: '2026-01-30',
        },
      ],
    },
  ])

  function bundleCiting(refs: string[]) {
    const blocs: SpeakerGroup[] = ['PSOE', 'PP']
    const items = refs.map((ref, i) =>
      mkItem(
        { id: `p1-00${i}-cit-x${i}`, plenoDate: SESSION, speakerGroup: blocs[i % 2] },
        'verificado',
        [{ kind: 'tender', ref, snippet: `Expediente ${i}`, similarity: 0.7 }],
      ),
    )
    return {
      plenoId: 'p1',
      plenoDate: SESSION,
      topic: 'urbanismo',
      blocs: blocs as string[],
      items,
      score: 10,
    }
  }

  it('drops the post-dated record and keeps the one whose process was live', () => {
    const bundle = bundleCiting([POST_DATED, LIVE_PROCESS])
    const dateGate = emptyRecordDateGateReport()
    const finding = composeFinding({
      bundle,
      selectedQuotes: bundle.items,
      llmTitle: 'Debate urbanismo pleno 2026-01-19',
      llmSummary: 'Resumen suficientemente largo para satisfacer el suelo del schema.',
      recordDates: index,
      dateGate,
    })
    expect(finding.crossChecked.map((r) => r.ref)).toEqual([LIVE_PROCESS])
    expect(dateGate.postDated).toEqual([
      { ref: POST_DATED, firstKnown: '2026-02-02', plenoDate: SESSION },
    ])
    // The gate dated and passed one ref. Without this, "dropped everything"
    // and "applied the rule" look identical from the assertion above.
    expect(dateGate.kept).toBe(1)
  })

  it('publishes every ref when no index is supplied — the gate is opt-in', () => {
    const bundle = bundleCiting([POST_DATED, LIVE_PROCESS])
    const finding = composeFinding({
      bundle,
      selectedQuotes: bundle.items,
      llmTitle: 'Debate urbanismo pleno 2026-01-19',
      llmSummary: 'Resumen suficientemente largo para satisfacer el suelo del schema.',
    })
    expect(finding.crossChecked.map((r) => r.ref).sort()).toEqual([POST_DATED, LIVE_PROCESS].sort())
  })

  it('never drops the pleno video — provenance is not a cross-referenced record', () => {
    const bundle = bundleCiting([LIVE_PROCESS])
    const finding = composeFinding({
      bundle,
      selectedQuotes: bundle.items,
      llmTitle: 'Debate urbanismo pleno 2026-01-19',
      llmSummary: 'Resumen suficientemente largo para satisfacer el suelo del schema.',
      plenoSourceUrl: 'https://www.youtube.com/watch?v=ABCDEF',
      plenoSourceKind: 'pleno-video',
      recordDates: index,
    })
    expect(finding.crossChecked.some((r) => r.kind === 'pleno-video')).toBe(true)
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
