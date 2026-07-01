import { describe, it, expect } from 'vitest'
import { dedupeEvidence, mergeVerified } from '../src/scraper/verified-merge'

const ev = (kind: string, ref: string, snippet: string, similarity?: number) =>
  ({ kind, ref, snippet, ...(similarity != null ? { similarity } : {}) }) as any

const verification = (evidence: any[], verdict = 'verificado') =>
  ({ claimId: 'x', verdict, summary: 's', evidence, checkedAgainst: [] }) as any

const baseItem = (id: string, evidence: any[]) =>
  ({ claim: { id } as any, verification: verification(evidence) }) as any

const emptyOverlay = { version: 1, generatedAt: '', entries: {} } as any

describe('dedupeEvidence', () => {
  it('removes exact-duplicate rows (same kind+ref+snippet), keeping first-seen order', () => {
    const out = dedupeEvidence([
      ev('tender', 'r1', 'Servicio de limpieza viaria', 1),
      ev('tender', 'r1', 'Servicio de limpieza viaria', 1), // exact dup
      ev('bdns', 'r2', 'Subvención cultural', 0.5),
    ])
    expect(out).toHaveLength(2)
    expect(out.map((e) => e.ref)).toEqual(['r1', 'r2'])
  })

  it('keeps rows that share a snippet but differ by ref (two distinct contracts)', () => {
    const out = dedupeEvidence([
      ev('tender', 'rA', 'Servicio de limpieza viaria', 1),
      ev('tender', 'rB', 'Servicio de limpieza viaria', 1),
    ])
    expect(out).toHaveLength(2)
  })

  it('is a safe no-op for 0 or 1 evidence rows', () => {
    expect(dedupeEvidence([])).toEqual([])
    const one = [ev('tender', 'r', 's', 1)]
    expect(dedupeEvidence(one)).toEqual(one)
  })
})

describe('mergeVerified dedupes evidence', () => {
  it('dedupes evidence on plain base items', () => {
    const out = mergeVerified(
      [baseItem('c1', [ev('tender', 'r1', 'snip', 0.3), ev('tender', 'r1', 'snip', 0.3)])],
      emptyOverlay,
    )
    expect(out[0].verification.evidence).toHaveLength(1)
  })

  it('dedupes evidence on overlay-replaced items too', () => {
    const overlay = {
      version: 1,
      generatedAt: '',
      entries: {
        c1: {
          verification: verification([ev('bdns', 'rX', 'y', 1), ev('bdns', 'rX', 'y', 1)]),
          source: 'llm',
          appliedAt: 'now',
        },
      },
    } as any
    const out = mergeVerified([baseItem('c1', [])], overlay)
    expect(out[0].verification.evidence).toHaveLength(1)
  })

  it('returns the SAME verification object when there is nothing to dedupe (byte-identical round-trip)', () => {
    const item = baseItem('c1', [ev('tender', 'r1', 'a', 1), ev('bdns', 'r2', 'b', 0.5)])
    const out = mergeVerified([item], emptyOverlay)
    expect(out[0].verification).toBe(item.verification)
  })
})
