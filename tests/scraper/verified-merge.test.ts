import { describe, it, expect } from 'vitest'
import {
  mergeVerified,
  isDowngrade,
  validateOverlay,
  applyOverlayEntries,
  type VerifiedItem,
  type Overlay,
} from '../../src/scraper/verified-merge'
import type { ClaimVerdict, ClaimVerification } from '../../src/scraper/claim-verifier'

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

function vrf(id: string, verdict: ClaimVerdict): ClaimVerification {
  return { claimId: id, verdict, summary: 's', evidence: [], checkedAgainst: [] }
}

describe('validateOverlay', () => {
  it('accepts a well-formed overlay and rejects malformed entries', () => {
    const ok: Overlay = {
      version: 1,
      generatedAt: 'x',
      entries: { a: { verification: vrf('a', 'parcial'), source: 'nli', appliedAt: 'x' } },
    }
    expect(() => validateOverlay(ok)).not.toThrow()
    // missing verification
    expect(() =>
      validateOverlay({
        version: 1,
        generatedAt: 'x',
        entries: { a: { source: 'nli', appliedAt: 'x' } },
      } as unknown as Overlay),
    ).toThrow()
    // curator-downgrade with reason < 20 chars
    expect(() =>
      validateOverlay({
        version: 1,
        generatedAt: 'x',
        entries: {
          a: {
            verification: vrf('a', 'sin-datos'),
            source: 'curator-downgrade',
            appliedAt: 'x',
            reason: 'too short',
          },
        },
      } as Overlay),
    ).toThrow()
  })
})

describe('applyOverlayEntries', () => {
  const empty: Overlay = { version: 1, generatedAt: 'x', entries: {} }

  it('adds an nli entry and stamps appliedAt + generatedAt', () => {
    const out = applyOverlayEntries(
      empty,
      [{ claimId: 'a', verification: vrf('a', 'verificado'), source: 'nli' }],
      'TS',
    )
    expect(out.entries.a.source).toBe('nli')
    expect(out.entries.a.appliedAt).toBe('TS')
    expect(out.generatedAt).toBe('TS')
    expect(empty.entries.a).toBeUndefined() // input not mutated
  })

  it('rejects a curator-downgrade with a short reason', () => {
    const base = new Map<string, ClaimVerdict>([['a', 'verificado']])
    expect(() =>
      applyOverlayEntries(
        empty,
        [
          {
            claimId: 'a',
            verification: vrf('a', 'sin-datos'),
            source: 'curator-downgrade',
            reason: 'short',
          },
        ],
        'TS',
        base,
      ),
    ).toThrow()
  })

  it('rejects a curator-downgrade that is not actually a downgrade', () => {
    const base = new Map<string, ClaimVerdict>([['a', 'sin-datos']])
    expect(() =>
      applyOverlayEntries(
        empty,
        [
          {
            claimId: 'a',
            verification: vrf('a', 'verificado'),
            source: 'curator-downgrade',
            reason: 'this is a sufficiently long reason to pass the gate',
          },
        ],
        'TS',
        base,
      ),
    ).toThrow()
  })

  it('accepts a valid curator downgrade (contradicho → sin-datos)', () => {
    const base = new Map<string, ClaimVerdict>([['a', 'contradicho']])
    const out = applyOverlayEntries(
      empty,
      [
        {
          claimId: 'a',
          verification: vrf('a', 'sin-datos'),
          source: 'curator-downgrade',
          reason: 'the cited evidence does not actually contradict the claim',
          editor: 'sergei',
        },
      ],
      'TS',
      base,
    )
    expect(out.entries.a.verification.verdict).toBe('sin-datos')
    expect(out.entries.a.reason).toContain('does not actually contradict')
  })

  it('accepts a verdict-engine entry (re-derivation) with a grounded reason', () => {
    const out = applyOverlayEntries(
      empty,
      [
        {
          claimId: 'a',
          verification: vrf('a', 'sin-datos'),
          source: 'verdict-engine',
          reason: 'ningun candidato respalda el importe ni el sujeto de la afirmacion',
          editor: 'verdict-engine:gpt-5.4-mini',
        },
      ],
      'TS',
    )
    expect(out.entries.a.source).toBe('verdict-engine')
    expect(out.entries.a.verification.verdict).toBe('sin-datos')
  })

  it('rejects a verdict-engine entry with a short reason', () => {
    expect(() =>
      applyOverlayEntries(
        empty,
        [
          {
            claimId: 'a',
            verification: vrf('a', 'sin-datos'),
            source: 'verdict-engine',
            reason: 'x',
          },
        ],
        'TS',
      ),
    ).toThrow()
  })

  it('rejects a verdict-engine entry that emits contradicho', () => {
    expect(() =>
      applyOverlayEntries(
        empty,
        [
          {
            claimId: 'a',
            verification: vrf('a', 'contradicho'),
            source: 'verdict-engine',
            reason: 'the engine must never be allowed to emit a contradicho verdict',
          },
        ],
        'TS',
      ),
    ).toThrow()
  })
})
