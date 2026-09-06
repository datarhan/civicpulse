/**
 * Which evidence rows the synth stage gets to see.
 *
 * The synth prompt is capped (18 rows: biography sweeps yield 30+ sources,
 * which overflow gemini's prompt budget and OOM smaller ollama models). The
 * old order was trust-high-first, then most recent — so a curator-seeded press
 * capture (trust medium, often the only independent source a rank-and-file
 * councillor has) fell off the end behind eighteen actas. Seeds go first:
 * somebody already decided they matter. Within each group the old order holds.
 */
export interface RankableEvidence {
  citationId: string
  trust: 'high' | 'medium' | 'low'
  publishedAt?: string
  seeded?: boolean
}

const TRUST_RANK = { high: 0, medium: 1, low: 2 } as const

export function rankEvidenceForSynth<T extends RankableEvidence>(
  evidence: readonly T[],
  cap: number,
): T[] {
  return [...evidence]
    .sort((a, b) => {
      const s = Number(Boolean(b.seeded)) - Number(Boolean(a.seeded))
      if (s !== 0) return s
      const t = TRUST_RANK[a.trust] - TRUST_RANK[b.trust]
      if (t !== 0) return t
      return (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '')
    })
    .slice(0, cap)
}
