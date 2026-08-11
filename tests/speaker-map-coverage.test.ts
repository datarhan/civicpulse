import { describe, it, expect } from 'vitest'
import {
  speechSeconds,
  isUsableReference,
  unattemptedChunks,
  referenceCoverage,
  resumableChunks,
  type RawSegment,
} from '../src/scraper/speaker-map'

/**
 * The coverage floor exists so a partial chunk never lands on disk: downstream
 * a gap is indistinguishable from a stretch where nobody spoke.
 *
 * It was computed as `segments.at(-1).end / chunkDuration` — the position of
 * the last timestamp — which a single segment near the end of a chunk
 * maximises no matter how much is missing before it.
 *
 * The obvious repair, union-of-segments over chunk duration, is also wrong,
 * and measurably so. Silence is not missing data. Measured on `15uvjew` chunk
 * 0 against the published transcript, which is an independent record of where
 * speech actually is: the session does not begin until 545 s, so chunk 0 holds
 * 34 s of speech in 600 s of audio. The speaker map found 40 s of it. Scoring
 * that against 600 s gives 7 % and rejects a chunk that was transcribed
 * correctly — then retries it three times, every run, forever.
 *
 * So the denominator is the speech the published transcript places in the same
 * window. Measured on the same run, that separates the two cases cleanly:
 *
 *   chunk 0  ·  34 s of speech  ·  map found 40 s   → complete
 *   chunk 1  · 518 s of speech  ·  map found  0 s   → truncated
 *   chunk 6  · 546 s of speech  ·  map found  0 s   → truncated
 *
 * Chunks 1, 3, 6 and 8 are genuine model failures. Chunk 0 never was.
 */
function seg(start: number, end: number): RawSegment {
  return { start, end, speaker: 'SPEAKER_01', text: 'x' }
}

describe('speechSeconds', () => {
  it('sums the time actually covered inside the window', () => {
    expect(speechSeconds([seg(10, 20), seg(30, 45)], 0, 600)).toBeCloseTo(25, 3)
  })

  it('counts overlapping speakers once', () => {
    // Two councillors talking over each other cover that stretch, not twice it.
    expect(speechSeconds([seg(0, 100), seg(10, 90), seg(50, 100)], 0, 600)).toBeCloseTo(100, 3)
  })

  it('clips to the window rather than counting a segment that straddles it', () => {
    expect(speechSeconds([seg(550, 650)], 0, 600)).toBeCloseTo(50, 3)
    expect(speechSeconds([seg(550, 650)], 600, 1200)).toBeCloseTo(50, 3)
  })

  it('ignores segments entirely outside the window', () => {
    expect(speechSeconds([seg(700, 800)], 0, 600)).toBe(0)
  })

  it('does not depend on input order', () => {
    expect(speechSeconds([seg(400, 500), seg(0, 100), seg(200, 300)], 0, 600)).toBeCloseTo(300, 3)
  })

  it('is 0 for no segments', () => {
    expect(speechSeconds([], 0, 600)).toBe(0)
  })
})

describe('referenceCoverage', () => {
  it('passes the real chunk 0 — 40 s found against 34 s of actual speech', () => {
    const map = [seg(543.2, 545.2), seg(547.2, 558), seg(561, 572.5), seg(583, 599)]
    const published = [seg(545.2, 545.6), seg(548.2, 549.6), seg(555.4, 556.4), seg(562.7, 590)]
    expect(referenceCoverage(map, published, 0, 600)).toBeGreaterThanOrEqual(0.85)
  })

  it('fails the real chunk 6 — nothing found against 546 s of actual speech', () => {
    const published = Array.from({ length: 54 }, (_, i) => seg(3600 + i * 10, 3600 + i * 10 + 9))
    expect(referenceCoverage([], published, 3600, 4200)).toBe(0)
  })

  it('fails a chunk that returns a tenth of the speech that is there', () => {
    const published = Array.from({ length: 50 }, (_, i) => seg(1800 + i * 10, 1800 + i * 10 + 10))
    const map = [seg(1800, 1854)]
    expect(referenceCoverage(map, published, 1800, 2400)).toBeLessThan(0.2)
  })

  /**
   * The tail of the audio after the session closes. There is nothing to miss,
   * so it cannot be judged missing — otherwise the last chunk of every session
   * fails forever and costs three retries a run.
   */
  it('passes a window the published transcript says holds no speech', () => {
    expect(referenceCoverage([], [], 9600, 10200)).toBe(1)
  })

  it('caps at 1 when the map finds more than the reference recorded', () => {
    expect(referenceCoverage([seg(0, 500)], [seg(0, 200)], 0, 600)).toBe(1)
  })
})

/**
 * Resume decided a chunk was done if the prior map held ANY segment in its
 * window. Against a gate that could not tell a dense chunk from a sparse one
 * that was as good a proxy as existed; against a real one it makes the
 * correction inert, since every chunk already on disk keeps the verdict the
 * old metric gave it. Correcting a gate has to re-open what the old one
 * decided, across all 44 sessions, or nothing that already exists changes.
 */
describe('resumableChunks', () => {
  const speech = (chunk: number, seconds: number): RawSegment[] =>
    Array.from({ length: Math.round(seconds / 10) }, (_, i) =>
      seg(chunk * 600 + i * 10, chunk * 600 + i * 10 + 10),
    )

  it('keeps a chunk that found the speech that is there, so resume still skips it', () => {
    const published = speech(3, 500)
    expect(resumableChunks(speech(3, 500), published, 600, 4, 0.85).has(3)).toBe(true)
  })

  it('keeps the real chunk 0 — mostly silence, correctly transcribed', () => {
    const map = [seg(543.2, 545.2), seg(547.2, 558), seg(561, 572.5), seg(583, 599)]
    const published = [seg(545.2, 545.6), seg(548.2, 549.6), seg(555.4, 556.4), seg(562.7, 590)]
    expect(resumableChunks(map, published, 600, 1, 0.85).has(0)).toBe(true)
  })

  it('re-opens a chunk the old metric admitted on a late timestamp alone', () => {
    // One segment at the end of a chunk that really holds 500 s of speech:
    // 100 % under the old rule, 2 % under this one.
    expect(resumableChunks([seg(1195, 1200)], speech(2, 500), 600, 3, 0.85).has(2)).toBe(false)
  })

  it('judges each chunk on its own window', () => {
    const published = [...speech(0, 500), ...speech(2, 500)]
    const map = [...speech(0, 500), seg(1200, 1210)]
    const done = resumableChunks(map, published, 600, 3, 0.85)
    expect(done.has(0)).toBe(true)
    expect(done.has(2)).toBe(false)
  })

  it('treats a chunk with no prior segments as not done', () => {
    expect(resumableChunks([], speech(0, 500), 600, 2, 0.85).has(0)).toBe(false)
  })

  it('counts a silent trailing chunk as done rather than retrying it forever', () => {
    expect(resumableChunks([], speech(0, 500), 600, 2, 0.85).has(1)).toBe(true)
  })
})

/**
 * The reference has to fail CLOSED.
 *
 * `referenceCoverage` returns 1 for a window the transcript says is silent —
 * correct for the tail of a session, and catastrophic if the whole reference
 * is empty, because then every window looks silent and the gate passes
 * everything it was built to catch.
 *
 * This is not hypothetical. 23 of the 44 files in `public/data/pleno-transcripts`
 * are not diarized transcripts at all: they are acta text carrying placeholder
 * `[0.0 → 0.0]` stamps and no speaker labels. `parseDiarizedTranscript` drops
 * every line of them and returns [], and `existsSync` on the path cannot tell
 * the difference. An unusable reference means "cannot judge", never "nothing
 * to miss".
 */
describe('isUsableReference', () => {
  it('rejects the acta-shaped files — every stamp is [0.0 → 0.0]', () => {
    // What parseDiarizedTranscript yields for them: nothing at all.
    expect(isUsableReference([])).toBe(false)
  })

  it('rejects a reference too short to judge a session against', () => {
    expect(isUsableReference([seg(0, 12)])).toBe(false)
  })

  it('accepts a real diarized transcript', () => {
    const real = Array.from({ length: 200 }, (_, i) => seg(i * 10, i * 10 + 9))
    expect(isUsableReference(real)).toBe(true)
  })
})

/**
 * What a quota-capped run may call "never attempted".
 *
 * The fill was `for (let i = done + failedChunks.length; i < planned; i++)` —
 * a chunk INDEX derived from two counts, which only holds while chunks are
 * processed strictly in order from zero. A resume breaks that: the done set is
 * scattered (0, 2, 4, 5, 7, 9, 10, 16 on `15uvjew`), so when the quota `break`
 * landed at index 1 the arithmetic started the fill at 2 and marked everything
 * above it unattempted — including seven chunks whose segments were sitting in
 * the same file it was writing.
 *
 * Observed 2026-08-11: a run that resumed with «8 chunk(s) already mapped»
 * reported «1/17 transcribed, 16 GAP(S)» one line later. The segments were
 * fine; the account of them was false, which is DATA_INTEGRITY.md rule 2 —
 * done, attempted and never-attempted have to be separable, and a count cannot
 * stand in for a position.
 */
describe('unattemptedChunks', () => {
  it('names only the chunks that are neither finished nor already failed', () => {
    expect(unattemptedChunks(6, new Set([0, 2]), new Set([1]))).toEqual([3, 4, 5])
  })

  it('does not claim a scattered done-set was never attempted — the real case', () => {
    // Resume held 0,2,4,5,7,9,10,16; quota broke at chunk 1.
    const done = new Set([0, 2, 4, 5, 7, 9, 10, 16])
    expect(unattemptedChunks(17, done, new Set([1]))).toEqual([3, 6, 8, 11, 12, 13, 14, 15])
  })

  it('is empty when every chunk is accounted for', () => {
    expect(unattemptedChunks(3, new Set([0, 1, 2]), new Set())).toEqual([])
  })

  it('is empty when the run finished everything it planned', () => {
    expect(unattemptedChunks(2, new Set([0]), new Set([1]))).toEqual([])
  })
})
