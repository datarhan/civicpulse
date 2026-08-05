import { describe, it, expect } from 'vitest'
import {
  checkDraft,
  buildCurationQueue,
  draftRef,
  isCleanForReview,
  type DraftFindingLike,
  type QueueInputs,
} from '../src/scraper/curation-queue'

const codes = (cs: { code: string }[]) => cs.map((c) => c.code).sort()

const HAYSTACK =
  'Servicio de limpieza de caminos GARBIALDI, S.A. · contrato de recogida de residuos'

function inputs(over: Partial<QueueInputs> = {}): QueueInputs {
  return { haystack: HAYSTACK, verdictByClaimId: new Map(), ...over }
}

const CLEAN: DraftFindingLike = {
  id: 'f-1',
  plenoId: 'p1',
  summary: 'El PSOE afirma que se ampliará la recogida de residuos en el municipio.',
  sourceClaimIds: ['c1'],
  quotes: [
    { text: 'vamos a ampliar la recogida de residuos', speakerGroup: 'PSOE', sourceClaimId: 'c1' },
  ],
  crossChecked: [{ kind: 'tender', snippet: 'contrato de recogida de residuos sólidos urbanos' }],
}

describe('checkDraft — the four defect classes actually observed', () => {
  it('blocks a company named in prose that exists in no published record (the FCC case)', () => {
    const d = {
      ...CLEAN,
      summary: 'Según el registro municipal, la empresa FCC operó por emergencia.',
    }
    const cs = checkDraft(d, inputs({ verdictByClaimId: new Map([['c1', 'verificado']]) }))
    const hit = cs.find((c) => c.code === 'entity-unbacked')
    expect(hit?.level).toBe('blocker')
    expect(hit?.message).toContain('FCC')
  })

  it('does not flag a company that IS in the data', () => {
    const d = { ...CLEAN, summary: 'La empresa Garbialdi presta el servicio de limpieza.' }
    expect(codes(checkDraft(d, inputs()))).not.toContain('entity-unbacked')
  })

  it('respects the reviewed-names allowlist', () => {
    const d = { ...CLEAN, summary: 'Se preguntó por la empresa FCC en el debate.' }
    const cs = checkDraft(d, inputs({ reviewedNames: ['FCC'] }))
    expect(codes(cs)).not.toContain('entity-unbacked')
  })

  it('blocks prose asserting the record backs it while every claim is retracted (PEF/COMETA)', () => {
    const d: DraftFindingLike = {
      ...CLEAN,
      summary: 'El registro municipal incluye el seguimiento del Plan Económico y Financiero.',
      sourceClaimIds: ['c1', 'c2'],
    }
    const cs = checkDraft(
      d,
      inputs({
        verdictByClaimId: new Map([
          ['c1', 'sin-datos'],
          ['c2', 'sin-datos'],
        ]),
      }),
    )
    const hit = cs.find((c) => c.code === 'asserts-record-without-evidence')
    expect(hit?.level).toBe('blocker')
  })

  it('only warns when claims are retracted but the prose does NOT claim corroboration', () => {
    const cs = checkDraft(CLEAN, inputs({ verdictByClaimId: new Map([['c1', 'sin-datos']]) }))
    expect(codes(cs)).toContain('all-sin-datos')
    expect(codes(cs)).not.toContain('asserts-record-without-evidence')
    expect(cs.find((c) => c.code === 'all-sin-datos')?.level).toBe('warn')
  })

  it('warns on cited evidence sharing nothing with what was said (La Malla / paseo Pacadar)', () => {
    const d: DraftFindingLike = {
      ...CLEAN,
      quotes: [{ text: 'el parqué del complejo lo vamos a cambiar', speakerGroup: 'PSOE' }],
      crossChecked: [
        { kind: 'tender', snippet: 'pavimentación del paseo exterior uniendo edificios' },
      ],
    }
    expect(codes(checkDraft(d, inputs()))).toContain('unrelated-cross-check')
  })

  it('ignores the pleno video when cross-checking — it is provenance, not evidence', () => {
    const d: DraftFindingLike = {
      ...CLEAN,
      crossChecked: [{ kind: 'pleno-video', snippet: 'Vídeo del pleno · YouTube' }],
    }
    expect(codes(checkDraft(d, inputs()))).not.toContain('unrelated-cross-check')
  })

  it('warns on quotes with no attribution', () => {
    const d: DraftFindingLike = { ...CLEAN, quotes: [{ text: 'algo dicho', speakerGroup: null }] }
    expect(codes(checkDraft(d, inputs()))).toContain('unattributed-quotes')
  })

  it('reports a clean draft explicitly rather than returning nothing', () => {
    // Silence and "no problems found" must not look the same to a reviewer.
    const cs = checkDraft(CLEAN, inputs({ verdictByClaimId: new Map([['c1', 'verificado']]) }))
    expect(codes(cs)).toEqual(['clean'])
    expect(cs[0].level).toBe('ok')
  })
})

describe('buildCurationQueue', () => {
  it('attaches checks to every draft and stamps the reason', () => {
    const q = buildCurationQueue([CLEAN], inputs(), {
      reason: 'unmeasured',
      now: '2026-08-02T00:00:00Z',
    })
    expect(q.items).toHaveLength(1)
    expect(q.items[0].checks.length).toBeGreaterThan(0)
    expect(q.reason).toBe('unmeasured')
  })

  it('gives each draft a short handle a curator can type', () => {
    const q = buildCurationQueue([CLEAN], inputs(), { reason: 'r', now: 'n' })
    expect(q.items[0].ref.length).toBeLessThanOrEqual(24)
    expect(q.items[0].ref).toContain('p1')
  })

  it('draftRef is deterministic', () => {
    expect(draftRef(CLEAN, 0)).toBe(draftRef(CLEAN, 0))
  })
})

describe('isCleanForReview', () => {
  it('is false when any check is a blocker', () => {
    const item = {
      ref: 'r',
      finding: CLEAN,
      checks: [{ code: 'entity-unbacked', level: 'blocker' as const, message: 'x' }],
    }
    expect(isCleanForReview(item)).toBe(false)
  })

  it('is true when only warnings are present — a warning is context, not a veto', () => {
    const item = {
      ref: 'r',
      finding: CLEAN,
      checks: [{ code: 'all-sin-datos', level: 'warn' as const, message: 'x' }],
    }
    expect(isCleanForReview(item)).toBe(true)
  })
})
