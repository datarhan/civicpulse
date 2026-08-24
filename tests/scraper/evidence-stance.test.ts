/**
 * The guard on the defect that produced this file.
 *
 * `pleno-findings.json` carried a field called `corroboration[]` that
 * `auto-curate.ts` filled with EVERY verifier evidence ref for the cited
 * quotes — agreeing or not — plus the pleno video. Measured on the published
 * snapshot before the fix: 49 of 52 findings had a non-empty `corroboration[]`
 * and 0 of 52 had any `contradiction[]`, because no automated path could
 * produce one. The LLM synthesiser reads the schema, so it wrote «corroborado
 * por el registro del tender…» over contracts that corroborated nothing.
 *
 * These tests fail if a ref reaches a verdict-bearing bucket without the
 * signal that justifies it. Each one asserts how many rows it examined first:
 * the repo has shipped two suites that were green while measuring nothing, and
 * every assertion below would pass vacuously over an empty array.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  verifyClaim,
  evidenceStance,
  EVIDENCE_STANCES,
  type ClaimEvidence,
} from '../../src/scraper/claim-verifier'
import type { PlenoClaim } from '../../src/scraper/pleno-claim'
import { composeFinding, type VerifiedItem } from '../../src/scraper/auto-curate'
import { validateFindingsSnapshot, type PlenoFinding } from '../../src/scraper/pleno-finding'

// ─── fixtures ──────────────────────────────────────────────────────────────

function mkClaim(over: Partial<PlenoClaim> = {}): PlenoClaim {
  return {
    id: 'p1-001-cit-aaa111',
    plenoId: 'p1',
    plenoDate: '2026-01-15',
    segmentIndex: 0,
    type: 'cita_obra',
    topic: 'urbanismo',
    speakerGroup: 'PSOE',
    verbatim: 'la pasarela del barranco está terminada y abierta al público desde hace meses',
    context: 'debate municipal',
    entities: { referencedEntity: 'pasarela barranco' },
    confidence: 0.85,
    reasoning: 'cita explícita',
    requiresHumanApproval: true,
    ...over,
  } as PlenoClaim
}

/** A tender corpus in the shape readTenders() consumes. */
const TENDERS = {
  items: [
    {
      id: 't1',
      title: 'Contrato de obras de pasarela en barranco Mandor de Riba-roja de Túria',
      permalink: 'https://example.com/tender/pasarela',
      status: 'void',
      amount: 480000,
      awardAmount: 480000,
    },
    {
      id: 't2',
      title: 'Servicio de gestión de colas y turnos para atención al público',
      permalink: 'https://example.com/tender/colas',
      status: 'awarded',
      amount: 12000,
      awardAmount: 12000,
    },
  ],
}

function mkItem(verification: VerifiedItem['verification']): VerifiedItem {
  return { claim: mkClaim(), verification }
}

function mkVerification(evidence: ClaimEvidence[]): VerifiedItem['verification'] {
  return {
    claimId: 'p1-001-cit-aaa111',
    verdict: 'parcial',
    summary: 'resumen del verificador',
    evidence,
    checkedAgainst: ['tenders'],
  }
}

function compose(evidence: ClaimEvidence[], plenoSourceUrl?: string): PlenoFinding {
  const item = mkItem(mkVerification(evidence))
  return composeFinding({
    bundle: {
      plenoId: 'p1',
      plenoDate: '2026-01-15',
      topic: 'urbanismo',
      blocs: ['PSOE'],
      items: [item],
      score: 7,
    },
    selectedQuotes: [item],
    llmTitle: 'Hallazgo de prueba 2026-01-15',
    llmSummary: 'Resumen suficientemente largo para satisfacer el suelo de validación del schema.',
    ...(plenoSourceUrl ? { plenoSourceUrl, plenoSourceKind: 'pleno-video' as const } : {}),
  })
}

const ref = (over: Partial<ClaimEvidence> = {}): ClaimEvidence => ({
  kind: 'tender',
  ref: 'https://example.com/tender/colas',
  snippet: 'Servicio de gestión de colas y turnos para atención al público · 12.000 €',
  similarity: 0.9,
  ...over,
})

// ─── the generator records the signal ──────────────────────────────────────

describe('verifyClaim records a stance on every evidence row it emits', () => {
  it('classifies every row explicitly — no row is left for a consumer to guess', () => {
    // Several claim shapes so more than one emission path runs.
    const claims: PlenoClaim[] = [
      mkClaim(),
      mkClaim({
        id: 'p1-002-cit-bbb222',
        verbatim: 'invertimos 480.000 euros en la pasarela del barranco',
        entities: { referencedEntity: 'pasarela barranco', amountEuros: 480000 },
      }),
      mkClaim({
        id: 'p1-003-cit-ccc333',
        verbatim: 'la pasarela del barranco costó 12.000 euros y nada más',
        entities: { referencedEntity: 'pasarela barranco', amountEuros: 12000 },
      }),
    ]
    const rows = claims.flatMap(
      (claim) => verifyClaim({ claim, tenders: TENDERS }).evidence as ClaimEvidence[],
    )
    // Guard the guard: without rows the two assertions below prove nothing.
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(EVIDENCE_STANCES, `${r.ref} carries no stance the enum knows`).toContain(r.stance)
    }
  })

  it('marks the completion-vs-open tender as contradicting, and says so on the ref', () => {
    // "está terminada" + a tender still `open` is one of the two paths that
    // return `contradicho`. The ref that produced it must carry the stance.
    const v = verifyClaim({ claim: mkClaim(), tenders: TENDERS })
    expect(v.verdict).toBe('contradicho')
    const contradicting = v.evidence.filter((e) => evidenceStance(e) === 'contradicts')
    expect(contradicting).toHaveLength(1)
    expect(contradicting[0].ref).toBe('https://example.com/tender/pasarela')
  })

  it('never marks a title-overlap match as anything stronger than checked', () => {
    // The published defect: a queue-management IT contract cited as
    // corroborating a claim about waiting times. Title overlap, nothing else.
    const claim = mkClaim({
      id: 'p1-004-cit-ddd444',
      verbatim: 'hemos reducido las colas y los turnos de espera en atención al público',
      entities: { referencedEntity: 'colas y turnos atención al público' },
    })
    const v = verifyClaim({ claim, tenders: TENDERS })
    expect(v.evidence.length).toBeGreaterThan(0)
    for (const e of v.evidence) expect(evidenceStance(e)).toBe('checked')
  })
})

// ─── the composer cannot upgrade an unclassified ref ────────────────────────

describe('composeFinding buckets refs by the recorded stance only', () => {
  it('routes a contradicting ref to contradiction[] and nowhere else', () => {
    const f = compose([ref({ stance: 'contradicts' })])
    expect(f.contradiction).toHaveLength(1)
    expect(f.crossChecked).toHaveLength(0)
  })

  it('routes a checked ref to crossChecked[]', () => {
    const f = compose([ref({ stance: 'checked' })])
    expect(f.crossChecked).toHaveLength(1)
    expect(f.contradiction).toHaveLength(0)
  })

  it('treats a ref with NO stance as checked — a snapshot written before the field existed', () => {
    const legacy = ref()
    delete legacy.stance
    const f = compose([legacy])
    expect(f.crossChecked).toHaveLength(1)
    expect(f.contradiction).toHaveLength(0)
  })

  it('treats an unrecognised stance as checked rather than trusting it', () => {
    // A snapshot from a future/forked writer, or a hand-edited file. Asserted
    // on evidenceStance() itself, not just on where the ref lands: the ONE
    // reader is where the whitelist lives, and a downstream
    // `=== 'contradicts'` would file `corroborates` correctly by accident
    // while still returning it to anyone who asks.
    for (const bogus of ['corroborates', 'CONTRADICTS', '', 'true']) {
      const stance = evidenceStance({ stance: bogus })
      expect(EVIDENCE_STANCES, `evidenceStance returned «${stance}» for «${bogus}»`).toContain(
        stance,
      )
      expect(stance).toBe('checked')
    }
    const f = compose([ref({ stance: 'corroborates' as unknown as ClaimEvidence['stance'] })])
    expect(f.crossChecked).toHaveLength(1)
    expect(f.contradiction).toHaveLength(0)
  })

  it('files the pleno recording as provenance, never as a contradiction', () => {
    const f = compose([ref({ stance: 'contradicts' })], 'https://www.youtube.com/watch?v=ABCDEF')
    expect(f.crossChecked.map((r) => r.kind)).toEqual(['pleno-video'])
    expect(f.contradiction).toHaveLength(1)
  })

  it('emits no field named corroboration at all', () => {
    const f = compose([ref({ stance: 'checked' })])
    expect(Object.keys(f)).not.toContain('corroboration')
  })
})

// ─── the schema is the second layer ────────────────────────────────────────

const SNAP_HEAD = {
  version: '1.0',
  generatedAt: '2026-08-05T00:00:00.000Z',
  legalNotice: 'Aviso legal de prueba con longitud suficiente para el validador del schema.',
  contactUrl: 'https://example.com',
  methodologyUrl: '/metodologia',
}

function snapWith(over: Partial<PlenoFinding>): string {
  const base = compose([ref({ stance: 'checked' })])
  return JSON.stringify({ ...SNAP_HEAD, items: [{ ...base, ...over }] })
}

describe('validateFindingsSnapshot', () => {
  it('rejects a row that still carries the old corroboration key', () => {
    const base = compose([ref({ stance: 'checked' })])
    const legacy = { ...base, corroboration: base.crossChecked } as unknown as PlenoFinding
    expect(() =>
      validateFindingsSnapshot(JSON.stringify({ ...SNAP_HEAD, items: [legacy] })),
    ).toThrow(/renamed to `crossChecked`/)
  })

  it('rejects severity=critical backed only by cross-checked documents', () => {
    // /metodologia has always said a critical finding needs "al menos una
    // referencia de contradicción". The gate used to accept a corroboration
    // ref instead, so the published rule had never been met by anything.
    expect(() =>
      validateFindingsSnapshot(snapWith({ severity: 'critical', contradiction: [] })),
    ).toThrow(/severity=critical requires ≥1 contradiction ref/)
  })

  it('accepts severity=critical with a contradiction ref', () => {
    expect(() =>
      validateFindingsSnapshot(
        snapWith({
          severity: 'critical',
          contradiction: [
            {
              kind: 'tender',
              ref: 'https://example.com/tender/pasarela',
              snippet: 'estado: open — la obra que se dice terminada sigue en licitación',
            },
          ],
        }),
      ),
    ).not.toThrow()
  })
})

// ─── the published file ────────────────────────────────────────────────────

describe('published pleno-findings.json', () => {
  const snap = validateFindingsSnapshot(
    readFileSync(resolve('public/data/pleno-findings.json'), 'utf8'),
  )

  it('has been migrated: rows carry crossChecked, none carry corroboration', () => {
    expect(snap.items.length).toBeGreaterThan(0)
    const withRefs = snap.items.filter((f) => f.crossChecked.length > 0)
    // The migration moved refs rather than emptying arrays. If this drops to
    // zero the rename silently deleted the citations.
    expect(withRefs.length).toBeGreaterThan(0)
    for (const f of snap.items) {
      expect(Object.keys(f), `${f.id}`).not.toContain('corroboration')
    }
  })

  it('publishes no critical finding without a contradiction ref', () => {
    const critical = snap.items.filter((f) => f.severity === 'critical')
    // There are none today; the validator above is what keeps it that way.
    for (const f of critical) expect(f.contradiction.length).toBeGreaterThanOrEqual(1)
    expect(critical.length).toBe(0)
  })
})
