import { describe, it, expect } from 'vitest'
import {
  mergeVerified,
  isDowngrade,
  type VerifiedItem,
  type Overlay,
} from '../../src/scraper/verified-merge'
import type { ClaimVerification } from '../../src/scraper/claim-verifier'

function item(id: string, verdict: ClaimVerification['verdict']): VerifiedItem {
  return {
    claim: { id } as VerifiedItem['claim'],
    verification: { claimId: id, verdict, summary: '', evidence: [], checkedAgainst: [] },
  }
}

function overlay(entries: Record<string, ClaimVerification['verdict']>): Overlay {
  return {
    version: 1,
    generatedAt: '2026-06-23T00:00:00.000Z',
    entries: Object.fromEntries(
      Object.entries(entries).map(([id, verdict]) => [
        id,
        {
          verification: {
            claimId: id,
            verdict,
            summary: 's',
            evidence: [],
            checkedAgainst: ['nli-grounding'],
          },
          source: 'nli',
          appliedAt: '2026-06-23T00:00:00.000Z',
        },
      ]),
    ),
  }
}

describe('mergeVerified', () => {
  it('lets an overlay entry win per claimId, preserving base order', () => {
    const base = [item('a', 'sin-datos'), item('b', 'parcial'), item('c', 'sin-datos')]
    const merged = mergeVerified(base, overlay({ b: 'verificado', c: 'parcial' }))
    expect(merged.map((m) => m.claim.id)).toEqual(['a', 'b', 'c']) // order preserved
    expect(merged.find((m) => m.claim.id === 'a')!.verification.verdict).toBe('sin-datos') // untouched
    expect(merged.find((m) => m.claim.id === 'b')!.verification.verdict).toBe('verificado') // overlay wins
    expect(merged.find((m) => m.claim.id === 'c')!.verification.verdict).toBe('parcial')
  })

  it('drops overlay entries whose claimId is absent from base', () => {
    const base = [item('a', 'sin-datos')]
    const merged = mergeVerified(base, overlay({ ghost: 'verificado' }))
    expect(merged).toHaveLength(1)
    expect(merged[0].claim.id).toBe('a')
  })
})

describe('isDowngrade', () => {
  it('treats less-certain moves as downgrades and rejects upgrades / sideways', () => {
    expect(isDowngrade('verificado', 'sin-datos')).toBe(true)
    expect(isDowngrade('verificado', 'parcial')).toBe(true)
    expect(isDowngrade('parcial', 'sin-datos')).toBe(true)
    expect(isDowngrade('contradicho', 'parcial')).toBe(true)
    expect(isDowngrade('contradicho', 'sin-datos')).toBe(true)
    expect(isDowngrade('sin-datos', 'verificado')).toBe(false)
    expect(isDowngrade('parcial', 'verificado')).toBe(false)
    expect(isDowngrade('parcial', 'parcial')).toBe(false)
    expect(isDowngrade('parcial', 'contradicho')).toBe(false) // never "downgrade" INTO contradicho
  })
})
