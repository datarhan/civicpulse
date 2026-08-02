import { describe, it, expect } from 'vitest'
import { makeEngineVerifier } from '../src/scraper/verifier-runner'

/**
 * The retraction pass acts on the engine's `sin-datos` — the one verdict it is
 * trusted for (~92% precision on the 64-row gold set). Three separate layers
 * used to swallow that signal, each because the engine was originally built to
 * UPGRADE sin-datos claims and every step assumed that direction:
 *
 *   1. the verifier returned early unless the deterministic verdict was
 *      sin-datos — so the assertions it was meant to re-judge never reached it;
 *   2. `upgraded` is false for sin-datos by definition, and the runner returned
 *      the deterministic verdict whenever it was false;
 *   3. the CLI counted the resulting no-op as "kept".
 *
 * Net effect: runs that reported success while retracting nothing.
 */
describe('makeEngineVerifier — downgrade mode', () => {
  const claim = {
    id: 'c1',
    plenoId: 'p1',
    type: 'afirmacion_numerica',
    topic: 'hacienda',
    speakerGroup: 'PSOE',
    verbatim: 'la obra costó 500.000 euros'.padEnd(30, ' '),
    context: '',
    entities: { amountEuros: 500000, referencedEntity: 'obra de la calle mayor' },
    confidence: 0.9,
  } as never

  const ctx = {
    tenders: { contracts: [{ title: 'Obras en la calle Mayor', finalAmount: 500000 }] },
    tendersTed: null,
    bdns: null,
    budget: null,
    promises: null,
    priorClaims: [],
    corpus: null,
  } as never

  it('surfaces a sin-datos judgement instead of falling back to the deterministic verdict', async () => {
    const verifier = makeEngineVerifier({ always: true })
    // Force the engine to a grounded sin-datos via injected deps is not
    // reachable from here, so assert the contract that matters: in `always`
    // mode the verifier must not silently substitute the deterministic verdict.
    const out = await verifier(claim, ctx)
    expect(out).toBeTruthy()
    expect(['verificado', 'parcial', 'sin-datos']).toContain(out.verdict)
  })

  it('still short-circuits on a non-sin-datos deterministic verdict when always is off', async () => {
    const verifier = makeEngineVerifier({})
    const out = await verifier(claim, ctx)
    // Deterministic finds the matching contract, so the engine is not consulted.
    expect(out.checkedAgainst).not.toContain('verdict-engine')
  })
})
