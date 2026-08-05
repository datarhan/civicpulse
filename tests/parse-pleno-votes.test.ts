import { describe, it, expect } from 'vitest'
import {
  validateVote,
  validateSnapshot,
  PlenoVoteValidationError,
  BREAKDOWN_SOURCE_KINDS,
  OUTCOME_SOURCE_KINDS,
  VOTE_SOURCE_KINDS,
  VOTE_SOURCE_KIND_IDS,
} from '../src/scraper/pleno-votes'

const baseVote = {
  id: 'k4olcs-03',
  plenoId: 'k4olcs',
  plenoDate: '2026-04-20',
  itemNumber: 3,
  title: 'Aprobación inicial del presupuesto municipal para 2026',
  outcome: 'aprobado',
  votes: [
    { bloc: 'PSOE', direction: 'a_favor', seats: 11 },
    { bloc: 'PP', direction: 'en_contra', seats: 7 },
    { bloc: 'VOX', direction: 'abstencion', seats: 2 },
    { bloc: 'Compromís', direction: 'a_favor', seats: 1 },
  ],
  department: 'Hacienda',
  expediente: '4305/2026/GEN',
  sourceUrl: 'http://www.ribarroja.es/plenos/2026/acta-20-abril',
  sourcePublisher: 'Ayuntamiento de Riba-roja de Túria',
  retrievedAt: '2026-04-20',
  // An acta is the one source kind that publishes BOTH the outcome and the
  // per-bloc tally, so this fixture cites it for both.
  provenance: {
    outcome: {
      kind: 'acta',
      url: 'http://www.ribarroja.es/plenos/2026/acta-20-abril',
      publisher: 'Ayuntamiento de Riba-roja de Túria',
      retrievedAt: '2026-04-20',
      verification: 'sin-verificar',
    },
    breakdown: {
      kind: 'acta',
      url: 'http://www.ribarroja.es/plenos/2026/acta-20-abril',
      publisher: 'Ayuntamiento de Riba-roja de Túria',
      retrievedAt: '2026-04-20',
      verification: 'sin-verificar',
    },
  },
}

describe('pleno-votes validator', () => {
  it('accepts a well-formed vote', () => {
    const v = validateVote(baseVote)
    expect(v.id).toBe('k4olcs-03')
    expect(v.votes).toHaveLength(4)
    expect(v.outcome).toBe('aprobado')
  })

  it('rejects invalid id format', () => {
    expect(() => validateVote({ ...baseVote, id: 'INVALID' })).toThrow(PlenoVoteValidationError)
  })

  it('rejects non-ISO plenoDate', () => {
    expect(() => validateVote({ ...baseVote, plenoDate: '20/04/2026' })).toThrow(/ISO/)
  })

  it('rejects title shorter than 20 chars', () => {
    expect(() => validateVote({ ...baseVote, title: 'Corto' })).toThrow(/20 chars/)
  })

  it('rejects outcome outside enum', () => {
    expect(() => validateVote({ ...baseVote, outcome: 'quizas' })).toThrow(/outcome/)
  })

  it('rejects bloc outside enum', () => {
    expect(() =>
      validateVote({ ...baseVote, votes: [{ bloc: 'PODEMOS', direction: 'a_favor' }] }),
    ).toThrow(/bloc/)
  })

  it('rejects duplicate blocs in votes array', () => {
    expect(() =>
      validateVote({
        ...baseVote,
        votes: [
          { bloc: 'PSOE', direction: 'a_favor' },
          { bloc: 'PSOE', direction: 'en_contra' },
        ],
      }),
    ).toThrow(/listed more than once/)
  })

  it('rejects invalid direction', () => {
    expect(() =>
      validateVote({ ...baseVote, votes: [{ bloc: 'PSOE', direction: 'maybe' }] }),
    ).toThrow(/direction/)
  })

  it('rejects non-http source URL', () => {
    expect(() => validateVote({ ...baseVote, sourceUrl: 'file:///tmp/acta.pdf' })).toThrow(/http/)
  })

  it('rejects empty votes array', () => {
    expect(() => validateVote({ ...baseVote, votes: [] })).toThrow(/non-empty/)
  })

  it('rejects negative or non-integer seats', () => {
    expect(() =>
      validateVote({ ...baseVote, votes: [{ bloc: 'PSOE', direction: 'a_favor', seats: -1 }] }),
    ).toThrow(/seats/)
    expect(() =>
      validateVote({ ...baseVote, votes: [{ bloc: 'PSOE', direction: 'a_favor', seats: 1.5 }] }),
    ).toThrow(/seats/)
  })

  it('aggregates stats correctly in a snapshot', () => {
    const snap = validateSnapshot({
      generatedAt: '2026-04-20T00:00:00Z',
      source: {
        description: 'Curated from published actas',
        contract: 'Human-edited; CLI-validated',
      },
      items: [
        baseVote,
        { ...baseVote, id: 'k4olcs-04', itemNumber: 4, outcome: 'rechazado' },
        { ...baseVote, id: 'ma87e0-01', itemNumber: 1, plenoId: 'ma87e0', plenoDate: '2026-03-16' },
      ],
    })
    expect(snap.stats.total).toBe(3)
    expect(snap.stats.byOutcome.aprobado).toBe(2)
    expect(snap.stats.byOutcome.rechazado).toBe(1)
    expect(snap.stats.byPleno.k4olcs).toBe(2)
    expect(snap.stats.byPleno.ma87e0).toBe(1)
  })

  it('rejects duplicate ids at the snapshot level', () => {
    expect(() =>
      validateSnapshot({
        generatedAt: '2026-04-20T00:00:00Z',
        source: { description: '', contract: '' },
        items: [baseVote, baseVote],
      }),
    ).toThrow(/duplicate id/)
  })

  it('accepts an empty snapshot (no votes registered yet)', () => {
    const snap = validateSnapshot({
      generatedAt: '2026-04-20T00:00:00Z',
      source: { description: 'empty', contract: 'empty' },
      items: [],
    })
    expect(snap.stats.total).toBe(0)
    expect(snap.items).toEqual([])
  })

  it('accepts dueBy when accompanied by a ≥20-char dueBySource verbatim clause', () => {
    const v = validateVote({
      ...baseVote,
      dueBy: '2026-10-20',
      dueBySource: 'con plazo de ejecución de 6 meses desde la aprobación',
    })
    expect(v.dueBy).toBe('2026-10-20')
    expect(v.dueBySource).toMatch(/plazo de ejecución/)
  })

  it('rejects dueBy without dueBySource (libel guardrail)', () => {
    expect(() => validateVote({ ...baseVote, dueBy: '2026-10-20' })).toThrow(/dueBySource/)
  })

  it('rejects dueBy with a too-short dueBySource', () => {
    expect(() => validateVote({ ...baseVote, dueBy: '2026-10-20', dueBySource: 'corto' })).toThrow(
      /≥20|20 chars/,
    )
  })

  it('rejects non-ISO dueBy', () => {
    expect(() =>
      validateVote({
        ...baseVote,
        dueBy: '20/10/2026',
        dueBySource: 'con plazo de ejecución de 6 meses desde la aprobación',
      }),
    ).toThrow(/ISO/)
  })
})

/**
 * A vote asserts two facts — «se aprobó» and «PSOE a favor, PP en contra» — and
 * until 2026-08-05 both hung off one `sourceUrl` that, on all 17 published
 * rows, pointed at regmeet. regmeet publishes the orden del día and the result
 * and NO per-bloc tally at all, so half of every row was attributed to a
 * document that does not contain it. `check:citations` could not see it: the
 * URL resolves, it simply does not carry the claim.
 *
 * These pin the guard where it belongs — on the writer. Every CLI runs
 * `validateSnapshot` before it writes, so the combination below cannot be
 * committed by a curator, a promotion or a merge.
 */
describe('provenance: one citation per claim', () => {
  const regmeetUrl = 'https://regmeet.com/aytoribarroja/participaciones/abc?idioma=castellano'
  const transcriptRef = {
    kind: 'transcripcion',
    url: '/data/pleno-transcripts/k4olcs.txt',
    publisher: 'CivicPulse — transcripción automática (Whisper) de la sesión',
    retrievedAt: '2026-08-01',
    verification: 'sin-verificar',
  }
  const regmeetRef = {
    kind: 'regmeet',
    url: regmeetUrl,
    publisher: 'Ayuntamiento de Riba-roja de Túria',
    retrievedAt: '2026-06-24',
    verification: 'sin-verificar',
  }
  const onRegmeet = { ...baseVote, sourceUrl: regmeetUrl }

  it('derives the allowed kinds from the capability table rather than a copy', () => {
    // The list a checker imports must be a function of the table, not a hand
    // -kept twin of it — the failure mode in docs/DATA_INTEGRITY.md rule 1.
    expect([...BREAKDOWN_SOURCE_KINDS].sort()).toEqual(
      VOTE_SOURCE_KIND_IDS.filter((k) => VOTE_SOURCE_KINDS[k].publishesBreakdown).sort(),
    )
    // …and the fact that makes this whole split necessary.
    expect(BREAKDOWN_SOURCE_KINDS).not.toContain('regmeet')
    expect(OUTCOME_SOURCE_KINDS).toContain('regmeet')
    // No kind may be inert in both roles: that would be a source nothing can cite.
    for (const k of VOTE_SOURCE_KIND_IDS) {
      expect(BREAKDOWN_SOURCE_KINDS.includes(k) || OUTCOME_SOURCE_KINDS.includes(k)).toBe(true)
    }
  })

  it('REFUSES a per-bloc breakdown attributed to regmeet — the original defect', () => {
    expect(() =>
      validateVote({
        ...onRegmeet,
        provenance: { outcome: regmeetRef, breakdown: regmeetRef },
      }),
    ).toThrow(/does not publish a per-bloc breakdown/)
  })

  it('accepts regmeet for the outcome and the transcript for the breakdown', () => {
    const v = validateVote({
      ...onRegmeet,
      provenance: { outcome: regmeetRef, breakdown: transcriptRef },
    })
    expect(v.provenance?.outcome.kind).toBe('regmeet')
    expect(v.provenance?.breakdown?.kind).toBe('transcripcion')
    // The field must survive the validator's rebuild — a citation silently
    // dropped on the way through is the same as no citation.
    expect(v.provenance?.breakdown?.url).toBe('/data/pleno-transcripts/k4olcs.txt')
  })

  it('refuses a published tally with no breakdown citation', () => {
    expect(() =>
      validateVote({ ...onRegmeet, provenance: { outcome: regmeetRef, breakdown: null } }),
    ).toThrow(/must name the source that carries it/)
  })

  it('refuses a breakdown citation with no tally to support', () => {
    expect(() =>
      validateVote({
        ...onRegmeet,
        votes: [],
        votesRetracted: {
          reason: 'el desglose procedía de una transcripción sin cotejar',
          editor: 'Curator',
          retractedAt: '2026-08-05T00:00:00.000Z',
        },
        provenance: { outcome: regmeetRef, breakdown: transcriptRef },
      }),
    ).toThrow(/no per-bloc tally is published/)
  })

  it('refuses an outcome citation that disagrees with sourceUrl', () => {
    expect(() =>
      validateVote({
        ...onRegmeet,
        provenance: {
          outcome: { ...regmeetRef, url: 'https://regmeet.com/aytoribarroja/otra-cosa' },
          breakdown: transcriptRef,
        },
      }),
    ).toThrow(/the outcome has one source, not two/)
  })

  it('gates "verificado" behind a verbatim quote and a signature', () => {
    const verified = { ...transcriptRef, verification: 'verificado' }
    expect(() =>
      validateVote({ ...onRegmeet, provenance: { outcome: regmeetRef, breakdown: verified } }),
    ).toThrow(/verbatim quote/)
    expect(() =>
      validateVote({
        ...onRegmeet,
        provenance: {
          outcome: regmeetRef,
          breakdown: { ...verified, quote: 'tretze vots en contra i huit a favor' },
        },
      }),
    ).toThrow(/verifiedBy/)
    const ok = validateVote({
      ...onRegmeet,
      provenance: {
        outcome: regmeetRef,
        breakdown: {
          ...verified,
          quote: 'tretze vots en contra i huit a favor',
          verifiedBy: 'Sergei Lutchenko',
        },
      },
    })
    expect(ok.provenance?.breakdown?.verification).toBe('verificado')
  })

  it('refuses a signature beside a claim that is NOT marked verified', () => {
    // Otherwise a row could carry a curator's name while still declaring
    // itself unchecked — a verification that did not happen, in writing.
    expect(() =>
      validateVote({
        ...onRegmeet,
        provenance: {
          outcome: regmeetRef,
          breakdown: { ...transcriptRef, verifiedBy: 'Sergei Lutchenko' },
        },
      }),
    ).toThrow(/not marked "verificado"/)
  })

  it('requires provenance on every PUBLISHED row, but not on a tombstoned one', () => {
    // Published: refused.
    expect(() =>
      validateSnapshot({
        generatedAt: '2026-08-05T00:00:00.000Z',
        source: { description: 'x', contract: 'y' },
        items: [baseVote2WithoutProvenance()],
      }),
    ).toThrow(/publishes no provenance/)

    // Tombstoned inside retractions[]: accepted unchanged. The three entries
    // written before the migration must never be re-annotated — a ledger that
    // gets edited after the fact records nothing.
    const snap = validateSnapshot({
      generatedAt: '2026-08-05T00:00:00.000Z',
      source: { description: 'x', contract: 'y' },
      items: [],
      retractions: [
        {
          voteId: 'k4olcs-03',
          scope: 'record',
          reason: 'la transcripción invierte las direcciones publicadas en este punto',
          editor: 'Curator',
          retractedAt: '2026-08-05T00:00:00.000Z',
          original: baseVote2WithoutProvenance(),
          originalVotes: null,
        },
      ],
    })
    expect(snap.retractions[0].original?.provenance).toBeUndefined()
  })

  function baseVote2WithoutProvenance() {
    const { provenance: _dropped, ...rest } = baseVote
    return rest
  }
})
