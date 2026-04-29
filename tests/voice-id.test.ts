import { describe, it, expect } from 'vitest'
import {
  parseDiarizedTranscript,
  clustersFromSegments,
  pickRepresentativeSegments,
  cosine,
  bestMatch,
  rankCandidates,
  rewriteTranscript,
  DEFAULT_MATCH_OPTS,
  type DiarizedSegment,
  type VoiceprintEntry,
  type SpeakerAssignment,
} from '../src/scraper/voice-id'

const TRANSCRIPT = `
[10.0 → 15.0] (SPEAKER_00) Buenas tardes, abrimos sesión.
[15.5 → 28.0] (SPEAKER_01) El expediente número cuatro.
[29.0 → 31.0] (SPEAKER_00) Tiene la palabra el portavoz.
[31.5 → 95.0] (SPEAKER_01) Como decía, la propuesta es la siguiente…
[96.0 → 100.0] (UNKNOWN) ruido de fondo
[100.0 → 102.0] (SPEAKER_02) micro-intervención corta
not a transcript line
[200.0 → 220.0] (SPEAKER_00) Pasamos al siguiente punto.
`.trim()

describe('parseDiarizedTranscript', () => {
  it('extracts (start, end, speaker, text) tuples', () => {
    const segs = parseDiarizedTranscript(TRANSCRIPT)
    expect(segs).toHaveLength(7)
    expect(segs[0]).toEqual({
      start: 10.0,
      end: 15.0,
      speaker: 'SPEAKER_00',
      text: 'Buenas tardes, abrimos sesión.',
    })
  })

  it('skips lines that do not match the format', () => {
    const segs = parseDiarizedTranscript('not a transcript line\n[10 → 20] no speaker tag\n')
    expect(segs).toHaveLength(0)
  })

  it('skips degenerate intervals (end <= start)', () => {
    const segs = parseDiarizedTranscript('[10.0 → 10.0] (SPEAKER_00) zero-length\n')
    expect(segs).toHaveLength(0)
  })
})

describe('clustersFromSegments', () => {
  it('groups segments by speaker label', () => {
    const segs = parseDiarizedTranscript(TRANSCRIPT)
    const clusters = clustersFromSegments(segs)
    const speakers = clusters.map((c) => c.speaker).sort()
    // SPEAKER_02 has only 2s of speech (below 5s floor) — dropped.
    expect(speakers).toEqual(['SPEAKER_00', 'SPEAKER_01'])
  })

  it('drops UNKNOWN cluster (diarizer indecision)', () => {
    const segs = parseDiarizedTranscript(TRANSCRIPT)
    const clusters = clustersFromSegments(segs)
    expect(clusters.find((c) => c.speaker === 'UNKNOWN')).toBeUndefined()
  })

  it('drops tiny clusters under 5 seconds', () => {
    // SPEAKER_02 in TRANSCRIPT has only 2s — must be filtered.
    const segs = parseDiarizedTranscript(TRANSCRIPT)
    const clusters = clustersFromSegments(segs)
    expect(clusters.find((c) => c.speaker === 'SPEAKER_02')).toBeUndefined()
  })

  it('orders clusters by total speech time, descending', () => {
    const segs = parseDiarizedTranscript(TRANSCRIPT)
    const clusters = clustersFromSegments(segs)
    expect(clusters[0].speaker).toBe('SPEAKER_01') // 12.5 + 63.5 = 76s
    expect(clusters[1].speaker).toBe('SPEAKER_00') // 5 + 2 + 20 = 27s
  })
})

describe('pickRepresentativeSegments', () => {
  it('prefers longer segments and caps total duration', () => {
    const seg = (start: number, end: number, speaker = 'SPEAKER_00'): DiarizedSegment => ({
      start,
      end,
      speaker,
      text: 'x',
    })
    const cluster = {
      speaker: 'SPEAKER_00',
      segments: [seg(0, 50), seg(60, 65), seg(70, 100), seg(110, 112)],
      totalDurationSec: 50 + 5 + 30 + 2,
    }
    const picked = pickRepresentativeSegments(cluster, 30)
    // Sorted by duration desc: 50, 30, 5, 2.
    // First pick is 50s — exceeds 30s cap, but cluster.length===0 so we accept.
    expect(picked).toHaveLength(1)
    expect(picked[0].end - picked[0].start).toBe(50)
  })

  it('drops segments under 1.5s as too noisy', () => {
    const seg = (start: number, end: number): DiarizedSegment => ({
      start,
      end,
      speaker: 'X',
      text: 'x',
    })
    const cluster = {
      speaker: 'X',
      segments: [seg(0, 10), seg(20, 30), seg(40, 41)],
      totalDurationSec: 21,
    }
    const picked = pickRepresentativeSegments(cluster, 60)
    expect(picked).toHaveLength(2)
  })

  it('returns picked segments sorted by start time', () => {
    const seg = (start: number, end: number): DiarizedSegment => ({
      start,
      end,
      speaker: 'X',
      text: 'x',
    })
    const cluster = {
      speaker: 'X',
      segments: [seg(50, 60), seg(10, 30)],
      totalDurationSec: 30,
    }
    const picked = pickRepresentativeSegments(cluster, 60)
    expect(picked.map((s) => s.start)).toEqual([10, 50])
  })
})

describe('cosine', () => {
  it('returns 1.0 for identical normalised vectors', () => {
    const v = new Float32Array([1, 0, 0])
    expect(cosine(v, v)).toBeCloseTo(1.0, 6)
  })

  it('returns 0.0 for orthogonal vectors', () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0.0, 6)
  })

  it('returns negative for opposite vectors', () => {
    expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1.0, 6)
  })

  it('throws on dim mismatch', () => {
    expect(() => cosine([1, 0], [1, 0, 0])).toThrow(/dim mismatch/)
  })
})

describe('rankCandidates', () => {
  it('returns candidates sorted by cosine descending', () => {
    const probe = new Float32Array([1, 0, 0])
    const enrolled: VoiceprintEntry[] = [
      { slug: 'a', name: 'Alice', party: 'PSOE', embedding: new Float32Array([0.5, 0.5, 0]) },
      { slug: 'b', name: 'Bob', party: 'PP', embedding: new Float32Array([1, 0, 0]) },
      { slug: 'c', name: 'Carol', party: 'VOX', embedding: new Float32Array([0, 1, 0]) },
    ]
    const ranked = rankCandidates(probe, enrolled)
    expect(ranked[0].slug).toBe('b')
    expect(ranked[0].cosine).toBeCloseTo(1.0, 6)
    expect(ranked[1].slug).toBe('a')
    expect(ranked[2].slug).toBe('c')
  })
})

describe('bestMatch', () => {
  it('returns high-tier when cosine + margin both above their high thresholds', () => {
    const m = bestMatch([
      { slug: 'a', name: 'Alice', party: 'PSOE', cosine: 0.85 },
      { slug: 'b', name: 'Bob', party: 'PP', cosine: 0.4 },
    ])
    expect(m?.tier).toBe('high')
    expect(m?.slug).toBe('a')
    expect(m?.cosine).toBe(0.85)
    expect(m?.margin).toBeCloseTo(0.45, 4)
  })

  it('returns medium-tier when cosine is above threshold but margin is moderate', () => {
    const m = bestMatch([
      { slug: 'a', name: 'Alice', party: 'PSOE', cosine: 0.55 },
      { slug: 'b', name: 'Bob', party: 'PP', cosine: 0.4 },
    ])
    expect(m?.tier).toBe('medium')
  })

  it('returns null when best is below the cosine threshold', () => {
    const m = bestMatch([
      { slug: 'a', name: 'Alice', party: 'PSOE', cosine: 0.3 },
      { slug: 'b', name: 'Bob', party: 'PP', cosine: 0.1 },
    ])
    expect(m).toBeNull()
  })

  it('returns null when margin between best and second is too tight', () => {
    const m = bestMatch([
      { slug: 'a', name: 'Alice', party: 'PSOE', cosine: 0.55 },
      { slug: 'b', name: 'Bob', party: 'PP', cosine: 0.52 },
    ])
    expect(m).toBeNull() // 0.03 margin < default 0.1
  })

  it('handles single-candidate ranking by treating second as 0', () => {
    const m = bestMatch([
      { slug: 'a', name: 'Alice', party: 'PSOE', cosine: 0.7 },
    ])
    expect(m?.tier).toBe('high') // 0.7 >= 0.6, margin 0.7 >= 0.15
  })

  it('returns null on empty ranking', () => {
    expect(bestMatch([])).toBeNull()
  })

  it('respects custom thresholds when provided', () => {
    const m = bestMatch(
      [{ slug: 'a', name: 'Alice', party: 'PSOE', cosine: 0.45 }],
      { ...DEFAULT_MATCH_OPTS, threshold: 0.4, thresholdHigh: 0.4, margin: 0, marginHigh: 0 },
    )
    expect(m?.tier).toBe('high')
  })
})

describe('rewriteTranscript', () => {
  it('replaces SPEAKER_NN with named tag for high-tier matches only', () => {
    const transcript = `
[10.0 → 15.0] (SPEAKER_00) Buenas tardes.
[20.0 → 30.0] (SPEAKER_01) Tiene la palabra.
[31.0 → 35.0] (SPEAKER_02) Otra intervención.
`.trim()
    const assignments: SpeakerAssignment[] = [
      {
        speaker: 'SPEAKER_00',
        durationSec: 30,
        segmentCount: 5,
        match: {
          slug: 'robert-raga-gadea',
          name: 'Robert Raga Gadea',
          party: 'PSOE',
          cosine: 0.85,
          margin: 0.4,
          tier: 'high',
        },
        topCandidates: [],
      },
      {
        speaker: 'SPEAKER_01',
        durationSec: 25,
        segmentCount: 3,
        match: {
          slug: 'rafael-gomez-sanchez',
          name: 'Rafael Gómez Sánchez',
          party: 'PSOE',
          cosine: 0.55,
          margin: 0.12,
          tier: 'medium',
        },
        topCandidates: [],
      },
      {
        speaker: 'SPEAKER_02',
        durationSec: 4,
        segmentCount: 1,
        match: null,
        topCandidates: [],
      },
    ]
    const out = rewriteTranscript(transcript, assignments)
    expect(out).toContain('(Robert Raga Gadea) Buenas tardes')
    expect(out).toContain('(SPEAKER_01 ≈ Rafael Gómez Sánchez?) Tiene la palabra')
    expect(out).toContain('(SPEAKER_02) Otra intervención')
  })

  it('preserves transcript untouched when no matches are high or medium', () => {
    const transcript = '[10.0 → 15.0] (SPEAKER_00) Hola.\n'
    const out = rewriteTranscript(transcript, [
      { speaker: 'SPEAKER_00', durationSec: 5, segmentCount: 1, match: null, topCandidates: [] },
    ])
    expect(out).toBe(transcript)
  })
})
