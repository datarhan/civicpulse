import { describe, it, expect } from 'vitest'
import {
  compareCorpus,
  corpusDeltaBlocks,
  driftKey,
  type DriftedQuote,
} from '../src/scraper/corpus-baseline'

const q = (findingId: string, quote: string): DriftedQuote => ({ findingId, quote })

describe('corpus-baseline — the delta is the point', () => {
  // "30 untraceable" reads the same whether it is yesterday's 30 or a fresh 30
  // the run just created. Only the second needs a human.
  it('separates what this run broke from what was already accepted', () => {
    const before = [q('f-1', 'el presupuesto asciende a'), q('f-2', 'la obra está adjudicada')]
    const now = [q('f-2', 'la obra está adjudicada'), q('f-3', 'no consta en el expediente')]
    const d = compareCorpus(now, before)
    expect(d.appeared).toEqual([driftKey(q('f-3', 'no consta en el expediente'))])
    expect(d.carried).toEqual([driftKey(q('f-2', 'la obra está adjudicada'))])
    expect(d.healed).toEqual([driftKey(q('f-1', 'el presupuesto asciende a'))])
  })

  it('blocks on appeared only', () => {
    expect(corpusDeltaBlocks({ carried: ['a'], appeared: [], healed: ['b'] })).toBe(false)
    expect(corpusDeltaBlocks({ carried: [], appeared: ['c'], healed: [] })).toBe(true)
  })

  it('does not block when a hundred quotes carried over unchanged', () => {
    // The failure mode of a totals-based check: permanently red, therefore
    // permanently ignored.
    const many = Array.from({ length: 100 }, (_, i) => q(`f-${i}`, `cita ${i}`))
    expect(corpusDeltaBlocks(compareCorpus(many, many))).toBe(false)
  })

  it('an empty run against an empty baseline is quiet, not an error', () => {
    const d = compareCorpus([], [])
    expect(d).toEqual({ carried: [], appeared: [], healed: [] })
    expect(corpusDeltaBlocks(d)).toBe(false)
  })

  it('survives a missing drifted array on either side', () => {
    expect(() =>
      compareCorpus(undefined as unknown as DriftedQuote[], null as unknown as DriftedQuote[]),
    ).not.toThrow()
  })
})

describe('corpus-baseline — the key must not churn', () => {
  // A key that changes on cosmetic edits turns every re-transcription into a
  // wall of false "appeared", and a check nobody believes is a check nobody runs.
  it('two quotes in the same finding are distinct', () => {
    expect(driftKey(q('f-1', 'primera cita'))).not.toBe(driftKey(q('f-1', 'segunda cita')))
  })

  it('the same quote in two findings is distinct', () => {
    expect(driftKey(q('f-1', 'misma cita'))).not.toBe(driftKey(q('f-2', 'misma cita')))
  })

  it('a change past the 60th character does NOT count as a new drift', () => {
    const head = 'a'.repeat(60)
    expect(driftKey(q('f-1', `${head} cola vieja`))).toBe(driftKey(q('f-1', `${head} cola nueva`)))
  })

  it('a change inside the first 60 characters DOES', () => {
    expect(driftKey(q('f-1', 'el presupuesto sube'))).not.toBe(
      driftKey(q('f-1', 'el presupuesto baja')),
    )
  })

  it('tolerates a quote that is missing entirely', () => {
    expect(() => driftKey({ findingId: 'f-1' } as DriftedQuote)).not.toThrow()
  })
})
