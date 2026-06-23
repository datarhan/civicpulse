import { describe, it, expect } from 'vitest'
import {
  deterministicVerifier,
  loadVerifierContext,
  type VerifierContext,
} from '../../src/scraper/verifier-runner'
import type { PlenoClaim } from '../../src/scraper/pleno-claim'

const claim = {
  id: 'x',
  plenoId: 'p1',
  type: 'cita_obra',
  topic: 'urbanismo',
  speakerGroup: 'PP',
  verbatim: 'la obra de la calle inexistente ya está terminada',
  context: '',
  entities: { amountEuros: 999999, referencedEntity: 'calle inexistente' },
} as unknown as PlenoClaim

describe('deterministicVerifier', () => {
  it('threads ctx datasets (incl. TED) into verifyClaim', async () => {
    const ctx: VerifierContext = {
      tenders: [],
      tendersTed: [], // truthy → must appear in checkedAgainst (proves TED is wired)
      bdns: null,
      budget: null,
      promises: null,
      priorClaims: [],
      corpus: null,
    }
    const v = await deterministicVerifier(claim, ctx)
    expect(v.checkedAgainst).toEqual(expect.arrayContaining(['tenders', 'tenders-ted']))
    expect(v.verdict).toBe('sin-datos') // no matching rows
    expect(v.claimId).toBe('x')
  })
})

describe('loadVerifierContext', () => {
  it('loads the TED snapshot + a priorClaims array from public/data', async () => {
    const ctx = await loadVerifierContext()
    expect(ctx.tendersTed).not.toBeNull() // tenders-ted.json is committed in the repo
    expect(Array.isArray(ctx.priorClaims)).toBe(true)
  })
})
