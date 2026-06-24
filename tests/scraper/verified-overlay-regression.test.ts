import { describe, it, expect } from 'vitest'
import { mergeVerified, type VerifiedItem, type Overlay } from '../../src/scraper/verified-merge'
import type { ClaimVerdict } from '../../src/scraper/claim-verifier'

// Audit R4/B5 regression guard.
// A deterministic re-run (`verify:pleno-claims`) rebuilds the base WITHOUT the
// second-pass verdicts — deterministic alone yields 0 contradicho. The published
// verified.json = base ⊕ overlay must RESTORE them. Proven end-to-end this
// session (base contradicho 0 → verified.json contradicho 24); this test locks
// the invariant so the "stray re-run wipes upgrades" footgun cannot return.

function baseItem(id: string, verdict: ClaimVerdict): VerifiedItem {
  return {
    claim: { id } as VerifiedItem['claim'],
    verification: { claimId: id, verdict, summary: '', evidence: [], checkedAgainst: [] },
  }
}

function llmOverlay(id: string, verdict: ClaimVerdict): Overlay {
  return {
    version: 1,
    generatedAt: 'x',
    entries: {
      [id]: {
        verification: {
          claimId: id,
          verdict,
          summary: 's',
          evidence: [{ kind: 'tender', ref: 't', snippet: 'x' }],
          checkedAgainst: ['llm-second-pass'],
        },
        source: 'llm',
        appliedAt: 'x',
      },
    },
  }
}

describe('R4/B5: a deterministic re-run cannot clobber the overlay', () => {
  it('restores a contradicho the recomputed deterministic base lost', () => {
    const overlay = llmOverlay('a', 'contradicho')
    // deterministic re-run: base has 'a' as sin-datos (deterministic → 0 contradicho)
    const deterministicBase = [baseItem('a', 'sin-datos'), baseItem('b', 'parcial')]
    const merged = mergeVerified(deterministicBase, overlay)
    expect(merged.find((m) => m.claim.id === 'a')!.verification.verdict).toBe('contradicho') // RESTORED
    expect(merged.find((m) => m.claim.id === 'b')!.verification.verdict).toBe('parcial') // deterministic untouched
  })
})
