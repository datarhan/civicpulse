import { describe, it, expect } from 'vitest'
import {
  assessCorpusShape,
  assessSelfRetrieval,
  computeProbeOutcomes,
  pickProbeIndices,
  l2Norm,
  median,
  SELF_SIM_FLOOR,
  NORM_BAND,
  TIE_EPSILON,
  type ShapeRow,
  type ProbeOutcome,
} from '../src/scraper/retrieval-health'

const codes = (fs: { code: string }[]) => fs.map((f) => f.code).sort()

/** A unit vector of the given width, varied by seed so rows aren't identical. */
function unit(dim: number, seed: number): number[] {
  const v = Array.from({ length: dim }, (_, i) => Math.sin(seed * 7.3 + i * 1.7))
  const n = l2Norm(v)
  return v.map((x) => x / n)
}

function rows(count: number, dim = 8): ShapeRow[] {
  return Array.from({ length: count }, (_, i) => ({
    sourceId: `row-${i}`,
    embedding: unit(dim, i + 1),
  }))
}

describe('assessCorpusShape', () => {
  it('passes a healthy normalised corpus', () => {
    expect(assessCorpusShape(rows(20))).toEqual([])
  })

  it('flags an empty corpus', () => {
    expect(codes(assessCorpusShape([]))).toEqual(['empty-corpus'])
  })

  it('flags a corpus that mixes embedding widths', () => {
    const mixed = [...rows(10, 8), ...rows(3, 16)]
    const f = assessCorpusShape(mixed)
    expect(codes(f)).toContain('mixed-dimensions')
    expect(f.find((x) => x.code === 'mixed-dimensions')!.level).toBe('error')
  })

  it('flags all-zero vectors as permanently unreachable', () => {
    const withZero: ShapeRow[] = [
      ...rows(5),
      { sourceId: 'dead', embedding: [0, 0, 0, 0, 0, 0, 0, 0] },
    ]
    expect(codes(assessCorpusShape(withZero))).toContain('zero-vectors')
  })

  it('warns when vectors were never L2-normalised', () => {
    // Truncated Gemini output lands near 0.57 — well under the band.
    const under = rows(10).map((r) => ({ ...r, embedding: r.embedding.map((x) => x * 0.57) }))
    const f = assessCorpusShape(under)
    expect(codes(f)).toContain('unnormalised')
    expect(f.find((x) => x.code === 'unnormalised')!.level).toBe('warn')
  })

  it('accepts norms inside the band', () => {
    const inBand = rows(10).map((r) => ({
      ...r,
      embedding: r.embedding.map((x) => x * ((NORM_BAND[0] + NORM_BAND[1]) / 2)),
    }))
    expect(codes(assessCorpusShape(inBand))).not.toContain('unnormalised')
  })
})

describe('assessSelfRetrieval', () => {
  const good = (n: number): ProbeOutcome[] =>
    Array.from({ length: n }, (_, i) => ({ sourceId: `row-${i}`, rank: 1, selfSimilarity: 1.0 }))

  it('passes when every probe retrieves itself first', () => {
    expect(assessSelfRetrieval(good(8))).toEqual([])
  })

  it('reports the width-mismatch shape when nothing retrieves itself', () => {
    // What the incident actually looked like: every score 0, nothing found.
    const dead: ProbeOutcome[] = Array.from({ length: 8 }, (_, i) => ({
      sourceId: `row-${i}`,
      rank: 0,
      selfSimilarity: 0,
    }))
    const f = assessSelfRetrieval(dead)
    expect(codes(f)).toEqual(['retrieval-dead'])
    expect(f[0].message).toContain('EMBED_BACKEND')
  })

  it('flags a partial miss without claiming total failure', () => {
    const mixed: ProbeOutcome[] = [...good(6), { sourceId: 'odd', rank: 4, selfSimilarity: 0.7 }]
    const f = assessSelfRetrieval(mixed)
    expect(codes(f)).toContain('self-retrieval-miss')
    expect(codes(f)).not.toContain('retrieval-dead')
  })

  it('flags a first-ranked probe whose self-similarity is too low', () => {
    const weak: ProbeOutcome[] = [
      ...good(5),
      { sourceId: 'drift', rank: 1, selfSimilarity: SELF_SIM_FLOOR - 0.05 },
    ]
    expect(codes(assessSelfRetrieval(weak))).toContain('self-similarity-low')
  })

  it('warns rather than passing when no probes ran', () => {
    expect(codes(assessSelfRetrieval([]))).toEqual(['no-probes'])
  })
})

describe('computeProbeOutcomes — the end-to-end assertion', () => {
  // The real cosine, so the width-mismatch behaviour is the production one.
  const cos = (a: number[], b: number[]): number => {
    if (a.length !== b.length) return 0
    let dot = 0
    let na = 0
    let nb = 0
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]
      na += a[i] * a[i]
      nb += b[i] * b[i]
    }
    if (na === 0 || nb === 0) return 0
    return dot / Math.sqrt(na * nb)
  }

  it('ranks a row first when queried with its own vector', () => {
    const corpus = rows(20)
    const probes = [0, 7, 19].map((i) => ({
      sourceId: corpus[i].sourceId,
      query: corpus[i].embedding,
    }))
    const out = computeProbeOutcomes(probes, corpus, cos)
    expect(out.every((o) => o.rank === 1)).toBe(true)
    expect(out.every((o) => o.selfSimilarity > 0.999)).toBe(true)
    expect(assessSelfRetrieval(out)).toEqual([])
  })

  it('reports rank 0 — not a false rank 1 — when query width differs from the corpus', () => {
    // The actual incident: 1536-dim queries against a 768-dim corpus. Every
    // cosine is 0, and a naive "take the top of the sorted list" would still
    // name a winner and pass the check.
    const corpus = rows(20, 768)
    const probes = [0, 5, 10].map((i) => ({
      sourceId: corpus[i].sourceId,
      query: unit(1536, i + 100),
    }))
    const out = computeProbeOutcomes(probes, corpus, cos)
    expect(out.map((o) => o.rank)).toEqual([0, 0, 0])
    expect(codes(assessSelfRetrieval(out))).toEqual(['retrieval-dead'])
  })

  it('ties when the gap is provider noise, but not when it is real', () => {
    // Measured on a real duplicate pair: identical text, embeddings differing
    // by 2.3e-7 in cosine. That must tie. A gap an order of magnitude above
    // TIE_EPSILON must still rank.
    const corpus: ShapeRow[] = [
      { sourceId: 'probe', embedding: [1] },
      { sourceId: 'other', embedding: [2] },
    ]
    // cosine is injected, so drive the gap directly: `other` scores 1, `probe`
    // scores 1 - gap.
    const cosWithGap = (gap: number) => (_q: number[], e: number[]) => (e[0] === 1 ? 1 - gap : 1)

    const noise = computeProbeOutcomes(
      [{ sourceId: 'probe', query: [0] }],
      corpus,
      cosWithGap(2.3e-7),
    )
    expect(noise[0].rank).toBe(1)

    const real = computeProbeOutcomes(
      [{ sourceId: 'probe', query: [0] }],
      corpus,
      cosWithGap(TIE_EPSILON * 10),
    )
    expect(real[0].rank).toBe(2)
  })

  it('treats a byte-identical duplicate as a tie, not a miss', () => {
    // Real case: transcript line-windows overlap, so a repeated passage yields
    // two rows with identical text at different line ranges. They embed
    // identically and score exactly 1.0 for each other; positional ranking
    // called the second one a rank-2 failure.
    const shared = unit(8, 42)
    const corpus: ShapeRow[] = [
      { sourceId: 'chunk#L1029-L1040', embedding: shared },
      { sourceId: 'chunk#L1803-L1814', embedding: shared },
      ...rows(10),
    ]
    const out = computeProbeOutcomes(
      [{ sourceId: 'chunk#L1803-L1814', query: shared }],
      corpus,
      cos,
    )
    expect(out[0].rank).toBe(1)
    expect(assessSelfRetrieval(out)).toEqual([])
  })

  it('still counts a genuinely better-scoring row as outranking the probe', () => {
    // Explicit vectors so the similarities are controlled: querying with `near`
    // scores it 1.0 and `probe` 0.707 — positive, so it IS retrieved, just
    // second. A tie-aware rank must not collapse that into rank 1.
    const probe = [1, 0, 0]
    const near = [Math.SQRT1_2, Math.SQRT1_2, 0]
    const corpus: ShapeRow[] = [
      { sourceId: 'probe', embedding: probe },
      { sourceId: 'near', embedding: near },
    ]
    const out = computeProbeOutcomes([{ sourceId: 'probe', query: near }], corpus, cos)
    expect(out[0].rank).toBe(2)
    expect(out[0].selfSimilarity).toBeCloseTo(Math.SQRT1_2, 6)
  })

  it('reports rank 0 for a row that is absent from the corpus', () => {
    const corpus = rows(10)
    const out = computeProbeOutcomes([{ sourceId: 'ghost', query: unit(8, 3) }], corpus, cos)
    expect(out[0].rank).toBe(0)
  })
})

describe('pickProbeIndices', () => {
  it('is deterministic, so a failure reproduces', () => {
    expect(pickProbeIndices(100, 8)).toEqual(pickProbeIndices(100, 8))
  })

  it('spreads across the corpus rather than clustering at the head', () => {
    const idx = pickProbeIndices(100, 5)
    expect(idx[0]).toBe(0)
    expect(Math.max(...idx)).toBeGreaterThan(50)
  })

  it('never exceeds the corpus and never repeats', () => {
    const idx = pickProbeIndices(3, 10)
    expect(new Set(idx).size).toBe(idx.length)
    expect(Math.max(...idx)).toBeLessThan(3)
  })

  it('handles empty input', () => {
    expect(pickProbeIndices(0, 5)).toEqual([])
  })
})

describe('helpers', () => {
  it('l2Norm of a unit vector is 1', () => {
    expect(l2Norm(unit(16, 3))).toBeCloseTo(1, 10)
  })

  it('median handles even and odd lengths', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([])).toBe(0)
  })
})
