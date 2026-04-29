/**
 * Pure helpers for voice-id matching.
 *
 * No I/O, no python. The CLI orchestrator
 * (`scripts/identify-pleno-speakers.ts`) handles ffmpeg slicing +
 * spawning the speechbrain worker; this module is the deterministic
 * core that's easy to unit-test.
 */

export interface DiarizedSegment {
  /** Start time in seconds (Whisper's transcript timestamp). */
  start: number
  /** End time in seconds. */
  end: number
  /** Anonymous diarizer label, e.g. "SPEAKER_00". */
  speaker: string
  /** Original transcript text (Whisper output, may be Spanish/Valencian). */
  text: string
}

export interface SpeakerCluster {
  speaker: string
  segments: DiarizedSegment[]
  totalDurationSec: number
}

/**
 * Whisper transcript line, after the diarize-pleno post-processor:
 *
 *   [12.3 → 18.7] (SPEAKER_00) Aprobamos el orden del día.
 */
const LINE_RE = /^\[(\d+\.?\d*)\s*→\s*(\d+\.?\d*)\]\s*\((SPEAKER_\d+|UNKNOWN)\)\s*(.*)$/

export function parseDiarizedTranscript(text: string): DiarizedSegment[] {
  const out: DiarizedSegment[] = []
  for (const raw of text.split('\n')) {
    const m = raw.match(LINE_RE)
    if (!m) continue
    const start = Number(m[1])
    const end = Number(m[2])
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
    out.push({ start, end, speaker: m[3], text: m[4] })
  }
  return out
}

export function clustersFromSegments(segments: DiarizedSegment[]): SpeakerCluster[] {
  const byLabel = new Map<string, DiarizedSegment[]>()
  for (const s of segments) {
    if (!byLabel.has(s.speaker)) byLabel.set(s.speaker, [])
    byLabel.get(s.speaker)!.push(s)
  }
  const clusters: SpeakerCluster[] = []
  for (const [speaker, segs] of byLabel) {
    const total = segs.reduce((acc, s) => acc + (s.end - s.start), 0)
    clusters.push({ speaker, segments: segs, totalDurationSec: total })
  }
  // Drop UNKNOWN cluster — those are gaps where the diarizer couldn't decide.
  // Drop tiny clusters (<5s of speech total) — embedding noise dominates.
  return clusters
    .filter((c) => c.speaker !== 'UNKNOWN' && c.totalDurationSec >= 5)
    .sort((a, b) => b.totalDurationSec - a.totalDurationSec)
}

/**
 * Pick the longest contiguous segments to use as the embedding probe.
 * Concatenating clean, long segments gives a much better embedding than
 * sampling many short fragments — the encoder is stateful and short
 * fragments magnify channel/room noise.
 *
 * Caps the cumulative duration at `maxTotalSec` (default 30s) — beyond
 * ~30s the ECAPA-TDNN encoder's discrimination plateaus.
 */
export function pickRepresentativeSegments(
  cluster: SpeakerCluster,
  maxTotalSec = 30,
): DiarizedSegment[] {
  const sorted = [...cluster.segments].sort((a, b) => b.end - b.start - (a.end - a.start))
  const picked: DiarizedSegment[] = []
  let acc = 0
  for (const s of sorted) {
    const dur = s.end - s.start
    if (dur < 1.5) break // too short — drop the tail of micro-segments
    if (acc + dur > maxTotalSec && picked.length > 0) break
    picked.push(s)
    acc += dur
    if (acc >= maxTotalSec) break
  }
  // Re-order picked segments by start time so ffmpeg concat is monotonic
  // — small but matters for prosody continuity in the encoder.
  picked.sort((a, b) => a.start - b.start)
  return picked
}

/**
 * Cosine similarity assuming both vectors are L2-normalised
 * (which is what `enroll-voice` writes — see the worker).
 * Same shape applied here = a plain dot product.
 */
export function cosine(a: Float32Array | number[], b: Float32Array | number[]): number {
  if (a.length !== b.length) {
    throw new Error(`cosine: dim mismatch (${a.length} vs ${b.length})`)
  }
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  return dot
}

export interface VoiceprintEntry {
  slug: string
  name: string
  party: string | null
  embedding: Float32Array
}

export interface MatchResult {
  /** Best-match official's slug. */
  slug: string
  name: string
  party: string | null
  /** Cosine similarity (0..1). */
  cosine: number
  /** Best minus second-best — wider margin = more confident. */
  margin: number
  /**
   * Editorial confidence tier:
   *   high   — cosine ≥ 0.6 AND margin ≥ 0.15 → individual attribution defensible
   *   medium — above threshold but tighter margin → keep SPEAKER_NN, log candidate
   *   low    — sub-threshold; do not assign
   */
  tier: 'high' | 'medium' | 'low'
}

export interface ScoredCandidate {
  slug: string
  name: string
  party: string | null
  cosine: number
}

/**
 * Score every enrolled voiceprint against the probe and return the
 * full ranking (slug → cosine, descending). Useful for inspection in
 * the curator dashboard / audit log.
 */
export function rankCandidates(
  probe: Float32Array,
  enrolled: VoiceprintEntry[],
): ScoredCandidate[] {
  return enrolled
    .map((e) => ({
      slug: e.slug,
      name: e.name,
      party: e.party,
      cosine: cosine(probe, e.embedding),
    }))
    .sort((a, b) => b.cosine - a.cosine)
}

export interface BestMatchOpts {
  /** Minimum cosine to consider any match at all. */
  threshold: number
  /** Minimum gap between best and second-best to call it a clean match. */
  margin: number
  /** Cosine ≥ this AND margin ≥ marginHigh → tier='high' (named attribution). */
  thresholdHigh: number
  marginHigh: number
}

export const DEFAULT_MATCH_OPTS: BestMatchOpts = {
  threshold: 0.5,
  margin: 0.1,
  thresholdHigh: 0.6,
  marginHigh: 0.15,
}

export function bestMatch(
  ranking: ScoredCandidate[],
  opts: BestMatchOpts = DEFAULT_MATCH_OPTS,
): MatchResult | null {
  if (ranking.length === 0) return null
  const best = ranking[0]
  const second = ranking[1]
  const margin = best.cosine - (second?.cosine ?? 0)
  if (best.cosine < opts.threshold) return null
  let tier: MatchResult['tier'] = 'low'
  if (best.cosine >= opts.thresholdHigh && margin >= opts.marginHigh) tier = 'high'
  else if (margin >= opts.margin) tier = 'medium'
  else return null
  return {
    slug: best.slug,
    name: best.name,
    party: best.party,
    cosine: Number(best.cosine.toFixed(4)),
    margin: Number(margin.toFixed(4)),
    tier,
  }
}

export interface CuratorOverride {
  /** null = explicitly unassigned by curator (override clears auto-match too). */
  slug: string | null
  name: string | null
  party: string | null
  /** ISO timestamp the override was applied. */
  setAt: string
  /** Optional curator name for audit (defaults to system user). */
  by?: string | null
  /** Free-text reason — useful for the audit log when the override
   *  contradicts a high-tier auto-match. */
  reason?: string | null
}

export interface SpeakerAssignment {
  speaker: string
  durationSec: number
  segmentCount: number
  match: MatchResult | null
  /** Top 3 candidates for audit (always present, even when no match). */
  topCandidates: Array<{ slug: string; name: string; cosine: number }>
  /**
   * Curator-applied override. When present, takes precedence over
   * `match` for downstream consumers (LLM extractor, dashboard, etc.).
   * Only mutated by `scripts/override-speaker-assignment.ts`.
   *
   * Auto-runs of identify-pleno-speakers MUST NOT clobber existing
   * curator overrides — see the merge logic in the CLI.
   */
  curatorOverride?: CuratorOverride | null
}

/**
 * Resolve the effective slug for an assignment. Curator override wins
 * over auto-match; if both absent, returns null. Used everywhere the
 * downstream pipeline needs a single answer.
 *
 *   curatorOverride present + slug=null  → null (explicitly unassigned)
 *   curatorOverride present + slug=foo   → foo
 *   curatorOverride absent  + match.slug → match.slug
 *   neither                              → null
 */
export function effectiveSlug(a: Pick<SpeakerAssignment, 'match' | 'curatorOverride'>): string | null {
  if (a.curatorOverride !== undefined && a.curatorOverride !== null) {
    return a.curatorOverride.slug
  }
  return a.match?.slug ?? null
}

/** Tag describing which layer set the effective assignment. */
export function effectiveTier(
  a: Pick<SpeakerAssignment, 'match' | 'curatorOverride'>,
): 'curator' | 'high' | 'medium' | 'low' | 'unmatched' {
  if (a.curatorOverride !== undefined && a.curatorOverride !== null) return 'curator'
  if (!a.match) return 'unmatched'
  return a.match.tier
}

export interface IdentifyResult {
  generatedAt: string
  plenoId: string
  totalSpeakers: number
  highConfidenceCount: number
  mediumConfidenceCount: number
  unmatchedCount: number
  assignments: SpeakerAssignment[]
}

/**
 * Replace `(SPEAKER_NN)` markers in the transcript with named tags.
 * Curator overrides win over auto-matches — an override that clears
 * the slug (explicitly unassigned) keeps the SPEAKER_NN as-is.
 *
 *   curator (assigned)   → "(Robert Raga)"
 *   curator (unassigned) → "(SPEAKER_00)"            (untouched)
 *   high                 → "(Robert Raga)"
 *   medium               → "(SPEAKER_00 ≈ Robert Raga?)"
 *   low / unmatched      → "(SPEAKER_00)"            (unchanged)
 */
export function rewriteTranscript(transcript: string, assignments: SpeakerAssignment[]): string {
  const map = new Map<string, SpeakerAssignment>()
  for (const a of assignments) map.set(a.speaker, a)
  const lines = transcript.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(LINE_RE)
    if (!m) continue
    const speaker = m[3]
    const a = map.get(speaker)
    if (!a) continue
    let tag: string | null = null
    if (a.curatorOverride !== undefined && a.curatorOverride !== null) {
      // Curator decision overrides the automatic match entirely.
      if (a.curatorOverride.slug && a.curatorOverride.name) {
        tag = `(${a.curatorOverride.name})`
      }
      // null slug = explicitly unassigned → leave SPEAKER_NN
    } else if (a.match) {
      tag = a.match.tier === 'high' ? `(${a.match.name})` : `(${speaker} ≈ ${a.match.name}?)`
    }
    if (tag !== null) {
      lines[i] = lines[i].replace(`(${speaker})`, tag)
    }
  }
  return lines.join('\n')
}
