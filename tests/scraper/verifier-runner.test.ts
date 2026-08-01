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
      // Non-empty: `checkedAgainst` now records that a matcher RAN, not that a
      // file was present. An empty array means nothing was compared, and
      // claiming otherwise is how every press row came to assert five sources
      // had been consulted when none had.
      tenders: { contracts: [{ title: 'obra sin relación', finalAmount: 1 }] },
      tendersTed: { items: [{ title: 'notice', totalValueEur: 2 }] },
      bdns: null,
      budget: null,
      promises: null,
      priorClaims: [],
      corpus: null,
    } as unknown as VerifierContext
    const v = await deterministicVerifier(claim, ctx)
    expect(v.checkedAgainst).toEqual(expect.arrayContaining(['tenders', 'tenders-ted']))
    expect(v.verdict).toBe('sin-datos') // no matching rows
    expect(v.claimId).toBe('x')
  })

  it('does not claim a source was checked when it holds no rows', async () => {
    const ctx = {
      tenders: { contracts: [] },
      tendersTed: { items: [] },
      bdns: null,
      budget: null,
      promises: null,
      priorClaims: [],
      corpus: null,
    } as unknown as VerifierContext
    const v = await deterministicVerifier(claim, ctx)
    expect(v.checkedAgainst).toEqual([])
  })
})

describe('loadVerifierContext', () => {
  it('loads the TED snapshot + a priorClaims array from public/data', async () => {
    const ctx = await loadVerifierContext()
    expect(ctx.tendersTed).not.toBeNull() // tenders-ted.json is committed in the repo
    expect(Array.isArray(ctx.priorClaims)).toBe(true)
  })
})
