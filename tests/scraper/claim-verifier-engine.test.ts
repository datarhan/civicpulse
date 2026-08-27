import { describe, it, expect } from 'vitest'
import {
  verifyClaimWithEngine,
  type EngineDeps,
  type EngineExtract,
} from '../../src/scraper/claim-verifier-engine'
import type { PlenoClaim } from '../../src/scraper/pleno-claim'
import type { CandidateShortlist } from '../../src/scraper/claim-verifier'

const claim = (over: Record<string, unknown> = {}): PlenoClaim =>
  ({
    id: 'c1',
    plenoId: 'p1',
    type: 'cita_obra',
    topic: 'urbanismo',
    speakerGroup: 'PP',
    verbatim: 'la obra de la calle Mayor costó 482000 euros',
    context: '',
    entities: {},
    ...over,
  }) as unknown as PlenoClaim

const cands = (): CandidateShortlist[] =>
  [
    {
      kind: 'tender',
      ref: 't0',
      snippet: 'Obras calle Mayor · €482.000 · awarded',
      similarity: 0.6,
    },
    { kind: 'tender', ref: 't1', snippet: 'Servicio jardinería · €12.000', similarity: 0.3 },
  ] as unknown as CandidateShortlist[]

/** deps with a canned extract + a controllable consistency result. */
function deps(extract: EngineExtract, consistency = true): EngineDeps {
  return {
    reasonFn: async () => 'el contrato t0 coincide con la obra y el importe',
    extractFn: async () => extract,
    consistencyFn: async () => consistency,
  }
}

const groundedCite = { candidateIndex: 0, snippet: 'tender[0].amount=482000 · Obras calle Mayor' }

describe('verifyClaimWithEngine', () => {
  it('verificado on a strong grounded cite that passes the consistency gate', async () => {
    const r = await verifyClaimWithEngine(
      { claim: claim(), candidates: cands() },
      deps({ verdict: 'verificado', cites: [groundedCite] }),
    )
    expect(r!.verification.verdict).toBe('verificado')
    expect(r!.upgraded).toBe(true)
    expect(r!.verification.evidence.map((e) => e.ref)).toContain('t0')
    // El campo se partió en dos: `checkedAgainst` dice CONTRA QUÉ se cotejó
    // —derivado del `kind` de la evidencia— y `derivedBy` dice QUÉ PASADA lo
    // produjo. Antes esta pasada escribía su nombre en el primero, y con el
    // suelo de evidencia puesto eso la dejaba sin poder subir nada.
    expect(r!.verification.derivedBy).toContain('verdict-engine')
    expect(r!.verification.checkedAgainst).toContain('tenders')
  })

  it('parcial when the extract says parcial', async () => {
    const r = await verifyClaimWithEngine(
      { claim: claim(), candidates: cands() },
      deps({ verdict: 'parcial', cites: [groundedCite] }),
    )
    expect(r!.verification.verdict).toBe('parcial')
  })

  it('sin-datos when there are no cites', async () => {
    const r = await verifyClaimWithEngine(
      { claim: claim(), candidates: cands() },
      deps({ verdict: 'verificado', cites: [] }),
    )
    expect(r!.verification.verdict).toBe('sin-datos')
    expect(r!.upgraded).toBe(false)
  })

  it('drops an ungrounded cite (value not in the snippet) → sin-datos', async () => {
    const r = await verifyClaimWithEngine(
      { claim: claim(), candidates: cands() },
      deps({
        verdict: 'verificado',
        cites: [{ candidateIndex: 0, snippet: 'tender[0].amount=999999 · x' }],
      }),
    )
    expect(r!.verification.verdict).toBe('sin-datos')
  })

  it('forces sin-datos when the consistency gate fails', async () => {
    const r = await verifyClaimWithEngine(
      { claim: claim(), candidates: cands() },
      deps({ verdict: 'verificado', cites: [groundedCite] }, false),
    )
    expect(r!.verification.verdict).toBe('sin-datos')
    expect(r!.verification.evidence).toHaveLength(0)
  })

  it('never emits contradicho even if the extract asks for it', async () => {
    const r = await verifyClaimWithEngine(
      { claim: claim(), candidates: cands() },
      deps({ verdict: 'contradicho' as EngineExtract['verdict'], cites: [groundedCite] }),
    )
    expect(r!.verification.verdict).not.toBe('contradicho')
  })

  it('returns null for opinativa accusations and for empty candidates', async () => {
    const op = claim({ type: 'acusacion_publica', accusationSubtype: 'opinativa' })
    expect(
      await verifyClaimWithEngine(
        { claim: op, candidates: cands() },
        deps({ verdict: 'verificado', cites: [groundedCite] }),
      ),
    ).toBeNull()
    expect(
      await verifyClaimWithEngine(
        { claim: claim(), candidates: [] },
        deps({ verdict: 'sin-datos', cites: [] }),
      ),
    ).toBeNull()
  })
})
